import json
from pathlib import Path
from types import SimpleNamespace

from PIL import Image

from backend.app.services.local_catalog_search import LocalCatalogSearch


def make_index(tmp_path):
    template = json.loads(Path("catalog/manifest.example.json").read_text())
    first = {"metadata": {"category": "상의"}, "rights": {"owner": "test", "license": "test"}}
    items = []
    for name, color in [("red", "red"), ("blue", "blue")]:
        Image.new("RGB", (16, 16), color).save(tmp_path / f"{name}.png")
        items.append(
            {
                **first,
                "id": name,
                "title": name,
                "imagePath": f"{name}.png",
                "sourceUrl": f"https://shop1.cora1022.com/#/product/{name}",
            }
        )
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps({**template, "items": items}))
    calls = []

    def embed(image):
        calls.append(1)
        return [1.0, 0.0] if image.getpixel((0, 0))[0] else [0.0, 1.0]

    model = SimpleNamespace(
        model_version=f"{template['modelName']}@{template['modelRevision']}", embed_image=embed
    )
    index = LocalCatalogSearch(manifest, tmp_path, tmp_path / "cache.npz", model)
    return index, calls


def test_cosine_ranking_and_exclusion(tmp_path):
    index, _ = make_index(tmp_path)
    index.load()
    result = index.search_similar([10.0, 0.0], 2)
    assert [item.catalog_item_id for item in result] == ["red", "blue"]
    assert result[0].similarity_score == 1.0
    assert result[0].source_url.endswith("#/product/red")
    assert [r.catalog_item_id for r in index.search_by_catalog_id("red", 2)] == ["blue"]


def test_cache_reuse_and_image_change_invalidation(tmp_path):
    index, calls = make_index(tmp_path)
    index.load()
    assert len(calls) == 2
    index.load()
    assert len(calls) == 2
    Image.new("RGB", (16, 16), "blue").save(tmp_path / "red.png")
    index.load()
    assert len(calls) == 4
