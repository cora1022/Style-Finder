# ADR 0004: Exact search over a local catalog

## Context

The demo contains 80 products from three generated storefronts. Each image has a
512-dimensional FashionCLIP embedding. The catalog is provisioned as local files;
the application does not need distributed updates or shared vector storage.

## Decision

Use a normalized float32 NumPy matrix and exact cosine search inside FastAPI.
At this size, the raw matrix occupies 163,840 bytes, about 160 KiB. Each query
scores 80 vectors, followed by a stable full sort. Scoring costs O(ND) and sorting
costs O(N log N); actual endpoint latency has not yet been benchmarked.

The manifest pins the model revision. A SHA-256 fingerprint covers the manifest
and image contents so an unchanged `.npz` cache can avoid embedding the catalog
again. Model compatibility is checked when loading the index. Readiness reports
whether the model, manifest and populated index are available.

Remove the Qdrant runtime, client dependency and historical Naver import path.
This reduces the demo's deployment dependencies and avoids maintaining a separate
database process for a catalog that fits in memory. Spring Boot continues to own
members and saved-result snapshots in MySQL.

## Consequences and review criteria

Search returns exact scores for the loaded catalog without approximate-neighbor
recall loss. This does not prove that FashionCLIP retrieves the right garment;
quality needs a separate set of realistic query images and relevance judgments.

Each FastAPI process holds its own index. Catalog updates require reloading the
service, and a cache miss embeds images during initialization. This design does
not provide online writes, distributed synchronization or database filtering.

Reconsider FAISS or Qdrant when catalog growth causes measured search p95 or
memory usage to exceed an agreed budget, or when online updates, metadata filters
or shared indexing across instances become requirements. No measured item-count
threshold exists yet. Benchmark increasing catalog sizes and concurrent queries
before choosing one. FAISS would address local neighbor-search cost; Qdrant would
also introduce a separately operated indexing and query service.
