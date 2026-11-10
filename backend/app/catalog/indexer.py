import argparse
from pathlib import Path

from backend.app.core.config import Settings
from backend.app.services.fashionclip_service import FashionClipService
from backend.app.services.local_catalog_search import LocalCatalogSearch


def main():
    parser = argparse.ArgumentParser(description="Build the local clothing image index")
    parser.add_argument("command", choices=["index", "validate"])
    parser.add_argument("--manifest", type=Path, required=True)
    args = parser.parse_args()
    settings = Settings()
    from backend.app.catalog.manifest import load_manifest, resolve_image_path

    manifest = load_manifest(args.manifest)
    for item in manifest.items:
        if not resolve_image_path(item, settings.catalog_images_dir).is_file():
            raise ValueError(f"Missing image: {item.id}")
    if args.command == "index":
        model = FashionClipService(
            settings.fashionclip_model_name, settings.fashionclip_model_revision
        )
        model.load()
        LocalCatalogSearch(
            args.manifest, settings.catalog_images_dir, settings.catalog_index_path, model
        ).load()
    print(f"{args.command}: {len(manifest.items)} items")


if __name__ == "__main__":
    main()
