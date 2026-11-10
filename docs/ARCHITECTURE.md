# Architecture

## Current runtime

```text
Browser
  → Caddy
    → /                         React static files (Nginx)
    → /api/members/*            Spring Boot → MySQL
    → /api/search/*             FastAPI → FashionCLIP → local NumPy index
    → /api/preprocess/*         FastAPI → OpenCV/YOLO
    → /api/catalog/*            FastAPI → local manifest images
```

Caddy is the only public entry point. Nginx serves static files and SPA fallback only.
The applications do not share a database.

| Component | Current responsibility | Storage |
|---|---|---|
| React | Landing, auth session, upload/crop/search, history, saved results and My Page | Access token in memory only |
| Spring Boot | Members, RS256 token issuer, refresh sessions and user-owned activity | MySQL and private signing key volume |
| FastAPI | Access-token verification, image validation, crop, embedding and vector search | local NumPy index, local catalog and public verification key volume |
| Catalog indexer | Manifest validation and idempotent vector indexing | Local files → local NumPy index |
| Caddy | Same-origin routing and request-size boundary | None |

FastAPI never downloads arbitrary result URLs. Catalog-ID re-search uses a vector already stored in
local NumPy index. HOG is a person upper-body fallback, not a clothing detector.

## Health semantics

FastAPI `/health/live` checks process liveness. `/health/ready` additionally requires the model, a
loaded local manifest and a non-empty index with the configured vector dimension. Model-version
compatibility is checked against the manifest when loading the index, before it becomes available.

The member service `/health/live` has no dependency checks. Its `/health/ready` executes a MySQL
query and verifies that Flyway has a current migration with no pending versions. Caddy's public
`/health/*` route targets FastAPI; member health is used inside the service network and tests.

## Authentication status

Signup, login, member lookup and token persistence exist in Spring Boot. Spring signs access tokens
with RS256; FastAPI verifies the signature, issuer, audience, expiry and access-token type before
search, crop or catalog re-search. The private key is mounted only into the member service, while
FastAPI receives the public key. Refresh tokens are hashed in MySQL and delivered only as rotating
HttpOnly cookies. React restores a session through refresh and `/me`, keeps the access token in
memory, and coalesces concurrent 401 responses into one refresh request.

## User activity status

Search histories and saved-result snapshots use concrete DTOs and paginated user-ID repository
queries. JSON metadata is serialized with Jackson. Cross-user reads and deletes are hidden as 404,
and duplicate saves return 409. Spring Boot does not read local NumPy index; React sends a result snapshot after
FastAPI search succeeds.
