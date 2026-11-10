from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import FileResponse

from backend.app.schemas.search_schema import ImageSearchResponse
from backend.app.security.jwt_auth import AuthenticatedUser, require_access_token

router = APIRouter()


@router.post("/api/search/catalog/{catalog_item_id}", response_model=ImageSearchResponse)
async def search_catalog_item(
    request: Request,
    catalog_item_id: str,
    _user: Annotated[AuthenticatedUser, Depends(require_access_token)],
    top_k: int = Query(default=2, alias="topK", ge=1, le=20),
):
    results = await request.app.state.inference_executor.run(
        request.app.state.catalog_search_service.search_by_catalog_id,
        catalog_item_id,
        top_k,
    )
    return ImageSearchResponse(results=results)


@router.get("/api/catalog/items/{catalog_item_id}/image")
async def catalog_image(request: Request, catalog_item_id: str):
    path = request.app.state.catalog_store.get_image(catalog_item_id)
    media_type = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    return FileResponse(path, media_type=media_type, filename=path.name)
