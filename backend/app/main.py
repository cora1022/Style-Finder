import json
import logging
import time
from contextlib import asynccontextmanager
from io import BytesIO
from typing import Annotated

import anyio
from fastapi import Depends, FastAPI, File, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from backend.app.api.catalog_routes import router as catalog_router
from backend.app.catalog.image_store import CatalogImageStore
from backend.app.core.config import Settings, settings
from backend.app.core.errors import AppError, install_error_handlers
from backend.app.schemas.search_schema import ImageSearchResponse
from backend.app.security.jwt_auth import AuthenticatedUser, JwtAccessVerifier, require_access_token
from backend.app.services.fashionclip_service import FashionClipService
from backend.app.services.image_validation import validate_upload
from backend.app.services.inference_executor import InferenceExecutor
from backend.app.services.local_catalog_search import LocalCatalogSearch
from backend.app.services.opencv_crop_service import OpenCvCropService

logger = logging.getLogger("style_finder.api")


def _build_services(app: FastAPI, config: Settings) -> None:
    app.state.fashionclip_service = FashionClipService(
        config.fashionclip_model_name, config.fashionclip_model_revision
    )
    app.state.opencv_crop_service = OpenCvCropService(
        enabled=config.opencv_crop_enabled,
        cascade_path=config.opencv_cascade_path,
        yolo_model_path=config.yolo_clothing_model_path,
        yolo_confidence=config.yolo_confidence,
    )
    app.state.catalog_search_service = LocalCatalogSearch(
        config.catalog_manifest_path,
        config.catalog_images_dir,
        config.catalog_index_path,
        app.state.fashionclip_service,
    )
    app.state.catalog_store = CatalogImageStore(
        config.catalog_manifest_path, config.catalog_images_dir
    )
    app.state.inference_executor = InferenceExecutor(
        config.inference_max_concurrency,
        config.inference_queue_timeout_seconds,
        config.search_timeout_seconds,
    )
    app.state.model_load_error = None
    app.state.readiness_cache = None
    app.state.jwt_verifier = JwtAccessVerifier(
        config.jwt_public_key_path, config.jwt_issuer, config.jwt_audience
    )


async def _load_local_services(app: FastAPI) -> None:
    try:
        await anyio.to_thread.run_sync(app.state.fashionclip_service.load)
    except Exception as exc:
        app.state.model_load_error = type(exc).__name__
        logger.exception("FashionCLIP initialization failed", exc_info=exc)
    try:
        await anyio.to_thread.run_sync(app.state.opencv_crop_service.load)
    except Exception as exc:
        logger.exception("Image crop detector initialization failed", exc_info=exc)
    try:
        app.state.catalog_store.load()
        if app.state.fashionclip_service.loaded:
            await anyio.to_thread.run_sync(app.state.catalog_search_service.load)
    except Exception as exc:
        logger.exception("Catalog manifest initialization failed", exc_info=exc)


def create_app(config: Settings | None = None, *, load_services: bool = True) -> FastAPI:
    active_settings = config or settings

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if not hasattr(app.state, "fashionclip_service"):
            _build_services(app, active_settings)
        if load_services:
            await _load_local_services(app)
        yield

    application = FastAPI(
        title="Style Finder Image Search API",
        version="2.0.0",
        lifespan=lifespan,
    )
    application.state.settings = active_settings
    _build_services(application, active_settings)
    install_error_handlers(application)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=active_settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=[
            "X-Request-ID",
            "X-Crop-Applied",
            "X-Crop-Box",
            "X-Original-Size",
            "X-Crop-Size",
            "X-Crop-Detector",
        ],
    )
    application.include_router(catalog_router)

    @application.get("/health/live")
    async def health_live():
        return {"status": "live"}

    @application.get("/health/ready")
    async def health_ready(request: Request):
        now = time.monotonic()
        cached = request.app.state.readiness_cache
        if cached and now - cached[0] < active_settings.readiness_cache_seconds:
            payload, status_code = cached[1], cached[2]
            return JSONResponse(payload, status_code=status_code)

        model_ready = request.app.state.fashionclip_service.loaded
        catalog_ready = request.app.state.catalog_store.ready
        model_version = request.app.state.fashionclip_service.model_version
        index_status = await anyio.to_thread.run_sync(
            request.app.state.catalog_search_service.collection_status,
            active_settings.expected_vector_size,
            model_version,
        )
        ready = model_ready and catalog_ready and index_status["ready"]
        payload = {
            "status": "ready" if ready else "not_ready",
            "checks": {
                "model": model_ready,
                "catalogManifest": catalog_ready,
                "localIndex": index_status,
            },
            "modelVersion": model_version,
        }
        status_code = 200 if ready else 503
        request.app.state.readiness_cache = (now, payload, status_code)
        return JSONResponse(payload, status_code=status_code)

    @application.post("/api/search/image", response_model=ImageSearchResponse)
    async def search_image(
        request: Request,
        file: Annotated[UploadFile, File()],
        _user: Annotated[AuthenticatedUser, Depends(require_access_token)],
        top_k: int = Query(default=2, alias="topK", ge=1, le=20),
    ):
        validated = await validate_upload(
            file,
            max_bytes=active_settings.max_upload_bytes,
            max_pixels=active_settings.max_image_pixels,
        )
        if not request.app.state.fashionclip_service.loaded:
            raise AppError("SEARCH_UNAVAILABLE", "검색 모델이 준비되지 않았습니다.", 503)

        def perform_search():
            vector = request.app.state.fashionclip_service.embed_image_bytes(validated.content)
            return request.app.state.catalog_search_service.search_similar(vector, top_k=top_k)

        results = await request.app.state.inference_executor.run(perform_search)
        return ImageSearchResponse(results=results)

    @application.post("/api/preprocess/crop")
    async def crop_image(
        request: Request,
        file: Annotated[UploadFile, File()],
        _user: Annotated[AuthenticatedUser, Depends(require_access_token)],
    ):
        validated = await validate_upload(
            file,
            max_bytes=active_settings.max_upload_bytes,
            max_pixels=active_settings.max_image_pixels,
        )
        cropped_image, metadata = await request.app.state.inference_executor.run(
            request.app.state.opencv_crop_service.crop_image_bytes_with_metadata,
            validated.content,
        )
        buffer = BytesIO()
        cropped_image.save(buffer, format="JPEG", quality=94)
        buffer.seek(0)
        crop_box = metadata["crop_box"]
        return StreamingResponse(
            buffer,
            media_type="image/jpeg",
            headers={
                "X-Crop-Applied": str(metadata["crop_applied"]).lower(),
                "X-Crop-Box": json.dumps(crop_box),
                "X-Original-Size": (f"{metadata['original_width']}x{metadata['original_height']}"),
                "X-Crop-Size": f"{crop_box['width']}x{crop_box['height']}",
                "X-Crop-Detector": metadata.get("detector", "none"),
            },
        )

    return application


app = create_app()
