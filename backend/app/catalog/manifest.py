import json
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, ValidationError, field_validator


class CatalogMetadata(BaseModel):
    category: str = Field(min_length=1)
    colors: list[str] = Field(default_factory=list)
    style_tags: list[str] = Field(default_factory=list, alias="styleTags")
    store_id: str | None = Field(default=None, alias="storeId")
    store_name: str | None = Field(default=None, alias="storeName")
    product_key: str | None = Field(default=None, alias="productKey")
    price: int | None = Field(default=None, ge=0)

    model_config = ConfigDict(populate_by_name=True)


class CatalogRights(BaseModel):
    owner: str = Field(min_length=1)
    license: str = Field(min_length=1)
    source_url: HttpUrl | None = Field(default=None, alias="sourceUrl")

    model_config = ConfigDict(populate_by_name=True)


class CatalogItem(BaseModel):
    id: str = Field(pattern=r"^[a-zA-Z0-9][a-zA-Z0-9._-]{1,127}$")
    title: str = Field(min_length=1)
    image_path: str = Field(alias="imagePath", min_length=1)
    source_url: HttpUrl | None = Field(default=None, alias="sourceUrl")
    metadata: CatalogMetadata
    rights: CatalogRights

    model_config = ConfigDict(populate_by_name=True)

    @field_validator("image_path")
    @classmethod
    def safe_relative_image_path(cls, value: str) -> str:
        path = Path(value)
        if path.is_absolute() or ".." in path.parts:
            raise ValueError("imagePath must stay inside catalog/images")
        return value.replace("\\", "/")


class CatalogManifest(BaseModel):
    catalog_version: str = Field(alias="catalogVersion", min_length=1)
    model_name: str = Field(alias="modelName", min_length=1)
    model_revision: str = Field(alias="modelRevision", min_length=1)
    items: list[CatalogItem]

    model_config = ConfigDict(populate_by_name=True)

    @field_validator("items")
    @classmethod
    def unique_ids(cls, items: list[CatalogItem]) -> list[CatalogItem]:
        ids = [item.id for item in items]
        if len(ids) != len(set(ids)):
            raise ValueError("catalog item ids must be unique")
        return items


def load_manifest(path: Path) -> CatalogManifest:
    try:
        return CatalogManifest.model_validate_json(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ValueError(f"manifest not found: {path}") from exc
    except (json.JSONDecodeError, ValidationError) as exc:
        raise ValueError(f"invalid catalog manifest: {exc}") from exc


def resolve_image_path(item: CatalogItem, images_root: Path) -> Path:
    root = images_root.resolve()
    candidate = (root / item.image_path).resolve()
    if not candidate.is_relative_to(root):
        raise ValueError(f"imagePath escapes catalog root: {item.id}")
    return candidate
