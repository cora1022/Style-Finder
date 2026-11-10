import json

import pytest
from PIL import Image

from backend.app.catalog.import_shopping import prepare_shopping_catalog


@pytest.fixture
def shopping(tmp_path):
    root = tmp_path / "shopping"
    public = root / "shop1/public"
    (public / "assets").mkdir(parents=True)
    Image.new("RGB", (8, 10), "blue").save(public / "assets/t01.webp", format="WEBP")
    products = [
        {
            "id": "t01",
            "name": "테스트 셔츠",
            "price": 59000,
            "category": "상의",
            "color": "블루",
            "image": "./assets/t01.webp",
            "storeId": "modo",
            "productKey": "modo:t01",
            "detailUrl": "./#/product/t01",
        }
    ]
    (public / "products.json").write_text(json.dumps(products), encoding="utf-8")
    stores = tmp_path / "stores.json"
    stores.write_text(
        json.dumps(
            [
                {
                    "folder": "shop1",
                    "storeId": "modo",
                    "name": "MODO",
                    "baseUrl": "https://shop1.cora1022.com/",
                }
            ]
        ),
        encoding="utf-8",
    )
    return root, stores, tmp_path / "generated/manifest.json", tmp_path / "images"


def test_shop_import_preserves_product_identity_and_deep_link(shopping):
    manifest = prepare_shopping_catalog(*shopping)
    item = manifest.items[0]
    assert item.id == "modo.t01"
    assert str(item.source_url) == "https://shop1.cora1022.com/#/product/t01"
    assert item.metadata.product_key == "modo:t01"
    assert item.metadata.store_name == "MODO"
    assert item.metadata.price == 59000
    with Image.open(shopping[3] / item.image_path) as image:
        assert image.format == "JPEG"
        assert image.size == (8, 10)


def test_shop_import_rejects_duplicate_ids_before_writing(shopping):
    products = shopping[0] / "shop1/public/products.json"
    body = json.loads(products.read_text())
    products.write_text(json.dumps(body + body), encoding="utf-8")
    with pytest.raises(ValueError, match="unique"):
        prepare_shopping_catalog(*shopping)
    assert not shopping[2].exists()


def test_shop_import_rejects_external_or_escaping_image_paths(shopping):
    products = shopping[0] / "shop1/public/products.json"
    body = json.loads(products.read_text())
    body[0]["image"] = "../../private.webp"
    products.write_text(json.dumps(body), encoding="utf-8")
    with pytest.raises(ValueError, match="local assets"):
        prepare_shopping_catalog(*shopping)


def test_shop_import_requires_https_unless_local_mode_is_explicit(shopping):
    stores = json.loads(shopping[1].read_text())
    stores[0]["baseUrl"] = "http://localhost:4173/"
    shopping[1].write_text(json.dumps(stores), encoding="utf-8")
    with pytest.raises(ValueError, match="HTTPS"):
        prepare_shopping_catalog(*shopping)
    manifest = prepare_shopping_catalog(*shopping, allow_local=True)
    assert str(manifest.items[0].source_url) == "http://localhost:4173/#/product/t01"
