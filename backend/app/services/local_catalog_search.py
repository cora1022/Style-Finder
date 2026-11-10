import hashlib
import os
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

from backend.app.catalog.manifest import load_manifest, resolve_image_path
from backend.app.core.errors import AppError
from backend.app.schemas.search_schema import CatalogMetadata, ImageSearchResult


class LocalCatalogSearch:
    """Exact cosine search over a small, locally owned clothing catalog."""

    def __init__(self, manifest_path, images_root, cache_path, model):
        self.manifest_path = Path(manifest_path)
        self.images_root = Path(images_root)
        self.cache_path = Path(cache_path)
        self.model = model
        self.items = []
        self.vectors = np.empty((0, 0), dtype=np.float32)

    def load(self):
        manifest = load_manifest(self.manifest_path)
        if f"{manifest.model_name}@{manifest.model_revision}" != self.model.model_version:
            raise ValueError("catalog model version mismatch")
        paths = [resolve_image_path(item, self.images_root) for item in manifest.items]
        digest = hashlib.sha256(self.manifest_path.read_bytes())
        for path in paths:
            digest.update(path.read_bytes())
        fingerprint = digest.hexdigest()
        vectors = None
        if self.cache_path.is_file():
            try:
                with np.load(self.cache_path, allow_pickle=False) as cache:
                    if str(cache["fingerprint"]) == fingerprint:
                        vectors = cache["vectors"]
            except (ValueError, OSError, KeyError):
                pass
        if vectors is None:
            rows = []
            for path in paths:
                with Image.open(path) as image:
                    rows.append(self.model.embed_image(image.convert("RGB")))
            vectors = np.asarray(rows, dtype=np.float32)
        if (
            vectors.ndim != 2
            or len(vectors) != len(manifest.items)
            or not np.isfinite(vectors).all()
        ):
            raise ValueError("invalid local catalog vectors")
        norms = np.linalg.norm(vectors, axis=1, keepdims=True)
        if np.any(norms == 0):
            raise ValueError("zero catalog vector")
        vectors = vectors / norms
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=self.cache_path.parent, delete=False) as stream:
            temporary = Path(stream.name)
            np.savez_compressed(stream, fingerprint=fingerprint, vectors=vectors)
        try:
            os.replace(temporary, self.cache_path)
        finally:
            temporary.unlink(missing_ok=True)
        self.items, self.vectors = manifest.items, vectors

    def collection_status(self, expected_vector_size, expected_model_version):
        ready = (
            bool(self.items)
            and self.vectors.shape[1] == expected_vector_size
            and self.model.model_version == expected_model_version
        )
        return {
            "ready": ready,
            "reason": "ready" if ready else "local_index_not_ready",
            "items": len(self.items),
        }

    def search_similar(self, vector, top_k=2, exclude_id=None):
        if not self.items:
            raise AppError("SEARCH_UNAVAILABLE", "검색 이미지가 준비되지 않았습니다.", 503)
        query = np.asarray(vector, dtype=np.float32)
        if (
            query.shape != (self.vectors.shape[1],)
            or not np.isfinite(query).all()
            or np.linalg.norm(query) == 0
        ):
            raise AppError("SEARCH_UNAVAILABLE", "검색 특징을 확인할 수 없습니다.", 503)
        scores = self.vectors @ (query / np.linalg.norm(query))
        order = np.argsort(-scores, kind="stable")
        results = []
        for index in order:
            item = self.items[index]
            if item.id == exclude_id:
                continue
            results.append(
                ImageSearchResult(
                    catalog_item_id=item.id,
                    title=item.title,
                    image_url=f"/api/catalog/items/{item.id}/image",
                    source_url=str(item.source_url) if item.source_url else None,
                    similarity_score=float(np.clip(scores[index], -1, 1)),
                    metadata=CatalogMetadata.model_validate(
                        item.metadata.model_dump(by_alias=True)
                    ),
                    model_version=self.model.model_version,
                )
            )
            if len(results) >= top_k:
                break
        return results

    def search_by_catalog_id(self, catalog_item_id, top_k):
        for index, item in enumerate(self.items):
            if item.id == catalog_item_id:
                return self.search_similar(self.vectors[index], top_k, exclude_id=catalog_item_id)
        raise AppError("CATALOG_ITEM_NOT_FOUND", "카탈로그 항목을 찾을 수 없습니다.", 404)
