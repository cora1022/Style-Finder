from types import SimpleNamespace

from fastapi.testclient import TestClient

from backend.app.main import create_app
from backend.app.schemas.search_schema import CatalogMetadata, ImageSearchResult


class FakeModel:
    loaded = True
    model_version = "fake/model@test"

    def embed_image_bytes(self, _content):
        return [1.0, 0.0]


class FakeLocalSearch:
    def collection_status(self, _size, _version):
        return {"ready": True, "reason": "ready"}

    def search_similar(self, _vector, top_k):
        return [
            ImageSearchResult(
                catalog_item_id="shirt-blue-001",
                title="Blue shirt",
                image_url="/api/catalog/items/shirt-blue-001/image",
                similarity_score=0.91,
                metadata=CatalogMetadata(category="shirt", colors=["blue"]),
                model_version="fake/model@test",
            )
        ][:top_k]


def test_image_search_uses_camel_case_contract(jpeg_bytes, jwt_context):
    app = create_app(config=jwt_context.settings, load_services=False)
    app.state.fashionclip_service = FakeModel()
    app.state.catalog_search_service = FakeLocalSearch()
    with TestClient(app) as client:
        response = client.post(
            "/api/search/image?topK=2",
            files={"file": ("shirt.jpg", jpeg_bytes, "image/jpeg")},
            headers=jwt_context.authorization(),
        )
    assert response.status_code == 200
    assert response.json()["results"][0]["catalogItemId"] == "shirt-blue-001"
    assert "image_features" not in response.text


def test_removed_remote_url_endpoint_returns_404():
    app = create_app(load_services=False)
    with TestClient(app) as client:
        response = client.post(
            "/api/search/image-url", json={"image_url": "http://127.0.0.1/private"}
        )
    assert response.status_code == 404


def test_internal_exception_is_not_exposed(jpeg_bytes, jwt_context):
    app = create_app(config=jwt_context.settings, load_services=False)
    app.state.fashionclip_service = FakeModel()
    app.state.catalog_search_service = SimpleNamespace(
        search_similar=lambda *_args, **_kwargs: (_ for _ in ()).throw(
            RuntimeError("C:/secret/api-key")
        )
    )
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post(
            "/api/search/image",
            files={"file": ("shirt.jpg", jpeg_bytes, "image/jpeg")},
            headers=jwt_context.authorization(),
        )
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "INTERNAL_ERROR"
    assert "secret" not in response.text
    assert response.headers["X-Request-ID"]


def test_liveness_does_not_require_dependencies():
    app = create_app(load_services=False)
    with TestClient(app) as client:
        response = client.get("/health/live")
    assert response.status_code == 200
