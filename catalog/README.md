# Local catalog

Only images that you own or may redistribute belong in `catalog/images`. Copy
`manifest.example.json` to an ignored manifest, add an item for every local image,
and record its owner and license in `rights`.

The example manifest pins FashionCLIP to commit
`7e3ba62ce16b379a1ab479346b66f192e76f51b7`. Keep the manifest revision and
`FASHIONCLIP_MODEL_REVISION` identical when producing new vectors.

The indexer never downloads `sourceUrl`; it is metadata only. `imagePath` is always
resolved below `catalog/images`, so absolute paths and `..` are rejected.

```powershell
uv run python -m backend.app.catalog.indexer validate --manifest catalog/manifest.json
uv run python -m backend.app.catalog.indexer index --manifest catalog/manifest.json
```

For a custom manifest, set `CATALOG_MANIFEST_PATH` to that file when starting the
backend. The current default is `catalog/generated/shopping-manifest.json`.
The indexer and backend must use the same `CATALOG_INDEX_PATH` to share a cache.
There is no collection, Qdrant connection or `--recreate` option.

## Local legacy Naver catalog

Previously collected Naver Shopping crops and vectors are historical local data.
Their redistribution rights and exact model revision are not established. The
legacy importer has been removed, and these vectors are not loaded by the current
search service. Do not publish them as a public catalog or relabel their revision.

## Generated demo storefronts

The `backend.app.catalog.import_shopping` command prepares the three demo stores
from their local product catalogs. It converts WebP assets to JPEG and records
store metadata and product detail links. Alternatively, `import_downloads` matches
the original image filenames to those product catalogs.

Both commands produce an ignored `catalog/generated/shopping-manifest.json` and
images under `catalog/images/shopping`. See
[shopping integration](../docs/SHOPPING_INTEGRATION.md) for validation and indexing.
The backend loads normalized vectors into an in-process NumPy matrix and uses an
`.npz` cache; it does not require a vector database.

The generated manifest records the supplied image provenance. These labels do not
independently establish redistribution rights. Check the source and applicable
terms before publishing the catalog. Search images, manifests and vectors remain
outside Git and must be provisioned separately for deployment.
