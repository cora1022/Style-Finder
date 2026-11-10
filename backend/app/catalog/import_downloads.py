"""Import named original clothing images and existing store product URLs."""

import argparse
import json
import unicodedata
from pathlib import Path

from PIL import Image, ImageOps


def prepare(source_root, shopping_root, output_root):
    stores = [
        ("shop1", "1쇼핑몰", "modo"),
        ("shop2", "2쇼핑몰", "form01"),
        ("shop3", "3쇼핑몰", "commonroom"),
    ]

    def normalize(text):
        return "".join(unicodedata.normalize("NFC", text).split()).casefold()

    planned = []
    for folder, originals, store_id in stores:
        files = {}
        for path in (source_root / originals).iterdir():
            if path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}:
                key = normalize(path.stem)
                if key in files:
                    raise ValueError(f"Ambiguous source image: {path.name}")
                files[key] = path
        products = json.loads(
            (shopping_root / folder / "public/products.json").read_text(encoding="utf-8")
        )
        for product in products:
            source = files.get(normalize(product["name"]))
            if source is None:
                raise ValueError(f"Source image missing: {folder}/{product['name']}")
            planned.append((folder, store_id, source, product))
    template = json.loads((output_root / "manifest.example.json").read_text(encoding="utf-8"))
    items, audit = [], []
    for folder, store_id, source, product in planned:
        relative = f"shopping/{store_id}/{product['id']}.jpg"
        destination = output_root / "images" / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(source) as image:
            ImageOps.exif_transpose(image).convert("RGB").save(destination, "JPEG", quality=94)
        url = f"https://{folder}.cora1022.com/#/product/{product['id']}"
        items.append(
            {
                "id": f"{store_id}.{product['id']}",
                "title": product["name"],
                "imagePath": relative,
                "sourceUrl": url,
                "metadata": {
                    "category": product["category"],
                    "colors": [product["color"]],
                    "styleTags": [product.get("kind", product["category"])],
                    "storeId": store_id,
                    "storeName": {"modo": "MODO", "form01": "FORM:01", "commonroom": "COMMON ROOM"}[
                        store_id
                    ],
                    "productKey": product["productKey"],
                    "price": product["price"],
                },
                "rights": {
                    "owner": "cora1022",
                    "license": "AI-generated original portfolio demo image",
                },
            }
        )
        audit.append({"id": items[-1]["id"], "source": str(source), "productUrl": url})
    generated = output_root / "generated"
    generated.mkdir(parents=True, exist_ok=True)
    (generated / "shopping-manifest.json").write_text(
        json.dumps(
            {**template, "catalogVersion": "local-shopping-originals-v1", "items": items},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    (generated / "source-images.json").write_text(
        json.dumps(audit, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return len(items)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--shopping-root", type=Path, required=True)
    parser.add_argument("--catalog-root", type=Path, default=Path("catalog"))
    args = parser.parse_args()
    count = prepare(args.source_root, args.shopping_root, args.catalog_root)
    print(f"Imported {count} original images")
