"""Prepare the generated demo-store catalog from the local store exports."""

import argparse
import json
from pathlib import Path
from urllib.parse import quote, urljoin, urlsplit

from PIL import Image

from backend.app.catalog.manifest import CatalogManifest

ROOT = Path(__file__).resolve().parents[3]


def prepare_shopping_catalog(
    shopping_root: Path,
    stores_path: Path,
    manifest_path: Path,
    images_root: Path,
    *,
    allow_local: bool = False,
    owner: str = "cora1022",
) -> CatalogManifest:
    shopping_root = shopping_root.resolve()
    images_root = images_root.resolve()
    stores = json.loads(stores_path.read_text(encoding="utf-8"))
    template = json.loads((ROOT / "catalog/manifest.example.json").read_text(encoding="utf-8"))
    items, copies = [], []
    for store in stores:
        folder = shopping_root / store["folder"]
        if folder.resolve().parent != shopping_root:
            raise ValueError("store folder must stay directly below shopping root")
        base = store["baseUrl"].rstrip("/") + "/"
        url = urlsplit(base)
        local = allow_local and url.hostname in {"localhost", "127.0.0.1", "::1"}
        if (
            url.scheme not in {"http", "https"}
            or not url.hostname
            or (url.scheme != "https" and not local)
            or url.query
            or url.fragment
            or url.username
            or url.password
        ):
            raise ValueError("store baseUrl must be an HTTPS base URL")
        products = json.loads((folder / "public/products.json").read_text(encoding="utf-8"))
        public = (folder / "public").resolve()
        for product in products:
            store_id, product_id = store["storeId"], product["id"]
            if (
                product["storeId"] != store_id
                or product["productKey"] != f"{store_id}:{product_id}"
            ):
                raise ValueError("store identity does not match product catalog")
            source = (public / product["image"]).resolve()
            if not source.is_relative_to(public / "assets") or not source.is_file():
                raise ValueError("product image must be an existing local assets file")
            relative = f"shopping/{store_id}/{product_id}.jpg"
            target = (images_root / relative).resolve()
            if not target.is_relative_to(images_root):
                raise ValueError("catalog image must stay inside images root")
            detail = urljoin(base, "./#/product/" + quote(product_id, safe=""))
            items.append(
                {
                    "id": f"{store_id}.{product_id}",
                    "title": product["name"],
                    "imagePath": relative,
                    "sourceUrl": detail,
                    "metadata": {
                        "category": product["category"],
                        "colors": [product["color"]],
                        "styleTags": [product.get("kind", product["category"])],
                        "storeId": store_id,
                        "storeName": store["name"],
                        "productKey": product["productKey"],
                        "price": product["price"],
                    },
                    "rights": {
                        "owner": owner,
                        "license": "AI-generated original portfolio demo image",
                    },
                }
            )
            copies.append((source, target))
    manifest = CatalogManifest.model_validate(
        {
            **template,
            "catalogVersion": "shopping-demo-v1",
            "items": items,
        }
    )
    # Validate all identities and paths before creating any output.
    for source, target in copies:
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.stat().st_mtime_ns < source.stat().st_mtime_ns:
            # Storefront WebP assets become JPEG for the existing search image validator.
            with Image.open(source) as image:
                image.convert("RGB").save(target, format="JPEG", quality=95)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        manifest.model_dump_json(by_alias=True, indent=2) + "\n", encoding="utf-8"
    )
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--shopping-root", type=Path, required=True)
    parser.add_argument("--stores", type=Path, required=True)
    parser.add_argument(
        "--manifest", type=Path, default=ROOT / "catalog/generated/shopping-manifest.json"
    )
    parser.add_argument("--images-root", type=Path, default=ROOT / "catalog/images")
    parser.add_argument("--allow-local", action="store_true")
    parser.add_argument("--owner", default="cora1022")
    args = parser.parse_args()
    manifest = prepare_shopping_catalog(
        args.shopping_root,
        args.stores,
        args.manifest,
        args.images_root,
        allow_local=args.allow_local,
        owner=args.owner,
    )
    print(f"Prepared {len(manifest.items)} items: {args.manifest}")


if __name__ == "__main__":
    main()
