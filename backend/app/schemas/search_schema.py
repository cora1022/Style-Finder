import re

from pydantic import BaseModel, ConfigDict, Field


def to_camel(value: str) -> str:
    return re.sub(r"_([a-z])", lambda match: match.group(1).upper(), value)


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class CatalogMetadata(ApiModel):
    category: str
    colors: list[str] = Field(default_factory=list)
    style_tags: list[str] = Field(default_factory=list)
    store_id: str | None = None
    store_name: str | None = None
    product_key: str | None = None
    price: int | None = Field(default=None, ge=0)


class ImageSearchResult(ApiModel):
    catalog_item_id: str
    title: str
    image_url: str
    source_url: str | None = None
    similarity_score: float
    metadata: CatalogMetadata
    model_version: str


class ImageSearchResponse(ApiModel):
    results: list[ImageSearchResult]
