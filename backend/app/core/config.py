import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[3]
load_dotenv(ROOT_DIR / ".env")


def _get_int(name: str, default: int) -> int:
    return int(os.getenv(name, str(default)))


def _get_float(name: str, default: float) -> float:
    return float(os.getenv(name, str(default)))


def _get_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    return default if value is None else value.lower() in {"1", "true", "yes", "on"}


def _get_list(name: str, default: list[str]) -> list[str]:
    value = os.getenv(name)
    return default if not value else [item.strip() for item in value.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    qdrant_url: str | None = field(default_factory=lambda: os.getenv("QDRANT_URL") or None)
    qdrant_host: str = field(default_factory=lambda: os.getenv("QDRANT_HOST", "localhost"))
    qdrant_port: int = field(default_factory=lambda: _get_int("QDRANT_PORT", 6333))
    qdrant_collection_name: str = field(
        default_factory=lambda: os.getenv("QDRANT_COLLECTION_NAME", "fashion_catalog_v1")
    )
    catalog_index_path: Path = field(
        default_factory=lambda: Path(
            os.getenv("CATALOG_INDEX_PATH", str(ROOT_DIR / "catalog/generated/embeddings.npz"))
        )
    )
    fashionclip_model_name: str = field(
        default_factory=lambda: os.getenv("FASHIONCLIP_MODEL_NAME", "patrickjohncyh/fashion-clip")
    )
    fashionclip_model_revision: str = field(
        default_factory=lambda: os.getenv(
            "FASHIONCLIP_MODEL_REVISION",
            "7e3ba62ce16b379a1ab479346b66f192e76f51b7",
        )
    )
    expected_vector_size: int = field(
        default_factory=lambda: _get_int("FASHIONCLIP_VECTOR_SIZE", 512)
    )
    max_upload_bytes: int = field(default_factory=lambda: _get_int("MAX_UPLOAD_BYTES", 10_485_760))
    max_image_pixels: int = field(default_factory=lambda: _get_int("MAX_IMAGE_PIXELS", 16_000_000))
    inference_max_concurrency: int = field(
        default_factory=lambda: _get_int("INFERENCE_MAX_CONCURRENCY", 1)
    )
    inference_queue_timeout_seconds: float = field(
        default_factory=lambda: _get_float("INFERENCE_QUEUE_TIMEOUT_SECONDS", 5.0)
    )
    search_timeout_seconds: float = field(
        default_factory=lambda: _get_float("SEARCH_TIMEOUT_SECONDS", 45.0)
    )
    readiness_cache_seconds: float = field(
        default_factory=lambda: _get_float("READINESS_CACHE_SECONDS", 5.0)
    )
    catalog_manifest_path: Path = field(
        default_factory=lambda: Path(
            os.getenv(
                "CATALOG_MANIFEST_PATH",
                str(ROOT_DIR / "catalog" / "generated" / "shopping-manifest.json"),
            )
        )
    )
    catalog_images_dir: Path = field(
        default_factory=lambda: Path(
            os.getenv("CATALOG_IMAGES_DIR", str(ROOT_DIR / "catalog" / "images"))
        )
    )
    opencv_crop_enabled: bool = field(
        default_factory=lambda: _get_bool("OPENCV_CROP_ENABLED", True)
    )
    opencv_cascade_path: str | None = field(
        default_factory=lambda: os.getenv("OPENCV_CASCADE_PATH") or None
    )
    yolo_clothing_model_path: str = field(
        default_factory=lambda: os.getenv(
            "YOLO_CLOTHING_MODEL_PATH",
            str(ROOT_DIR / "backend" / "models" / "yolov8n-clothing-detection-best.pt"),
        )
    )
    yolo_confidence: float = field(default_factory=lambda: _get_float("YOLO_CONFIDENCE", 0.25))
    cors_origins: list[str] = field(
        default_factory=lambda: _get_list(
            "CORS_ORIGINS",
            [
                "http://localhost",
                "http://localhost:5173",
                "http://127.0.0.1:5173",
            ],
        )
    )
    jwt_public_key_path: Path = field(
        default_factory=lambda: Path(
            os.getenv("JWT_PUBLIC_KEY_PATH", str(ROOT_DIR / "secrets" / "jwt-public.pem"))
        )
    )
    jwt_issuer: str = field(
        default_factory=lambda: os.getenv("JWT_ISSUER", "style-finder-member-service")
    )
    jwt_audience: str = field(default_factory=lambda: os.getenv("JWT_AUDIENCE", "style-finder-api"))


settings = Settings()
