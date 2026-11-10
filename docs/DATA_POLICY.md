# Data policy

Do not add scraped product images, external catalog data, `.env` files, API keys,
passwords, local vector caches or model weights to Git. Each catalog item must have
an owner and license in the manifest. `sourceUrl` documents provenance only;
Style Finder does not download it.

The current search catalog uses generated images from three demo storefronts.
The import commands record the supplied owner and an AI-generated demo label.
These fields are provenance metadata, not an independent rights determination.
Check the original source and applicable generation terms before public deployment.

`catalog/generated/`, `catalog/manifest.json` and catalog images are ignored by Git
and excluded from application image builds. A deployment must provision its
approved manifest and images separately. The public catalog directory contains
only this documentation, an example manifest and `.gitkeep`.

Intentional frontend inputs are handled separately: ten optimized wardrobe
background images, a Google sign-in image and self-hosted fonts are included with
the UI. Font license files are kept alongside the fonts. The background images
come from the generated demo storefronts, not historical Naver product crops.

Legacy Naver Shopping crops and their vectors remain historical local data. Their
redistribution rights and exact FashionCLIP revision are unverified. The current
application has no Naver API dependency, Qdrant service or legacy importer and does
not load those vectors.

New indexing pins FashionCLIP to commit
`7e3ba62ce16b379a1ab479346b66f192e76f51b7`. The manifest and loaded model revision
must match. Do not relabel historical vectors as this revision; approved images
must be embedded again with the pinned model.
