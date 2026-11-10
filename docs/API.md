# API contract

All JSON fields use camelCase. Errors never expose internal exception text.

| Endpoint | Purpose |
|---|---|
| `POST /api/preprocess/crop` | Bearer access token; JPEG/PNG file → JPEG crop with `X-Crop-*` headers |
| `POST /api/search/image?topK=2` | Bearer access token; search an already selected/cropped image |
| `POST /api/search/catalog/{catalogItemId}?topK=2` | Bearer access token; search from an indexed catalog vector, excluding itself |
| `GET /api/catalog/items/{catalogItemId}/image` | Serve only a manifest-registered local image |
| `GET /health/live` | Process liveness |
| `GET /health/ready` | Model, manifest, local NumPy index index/version readiness |

`/api/search/image-url` was intentionally removed; the server never downloads arbitrary URLs.

Search results contain `catalogItemId`, `title`, `imageUrl`, `sourceUrl`,
`similarityScore`, `metadata` (`category`, `colors`, `styleTags`) and `modelVersion`.

Errors use `{ "error": { "code", "message", "requestId" } }`. Codes are:
`INVALID_IMAGE`, `UNSUPPORTED_IMAGE_TYPE`, `IMAGE_TOO_LARGE`,
`IMAGE_DIMENSIONS_EXCEEDED`, `CATALOG_NOT_READY`, `CATALOG_ITEM_NOT_FOUND`,
`SEARCH_BUSY`, `SEARCH_TIMEOUT`, `SEARCH_UNAVAILABLE`, `AUTHENTICATION_REQUIRED`,
`ACCESS_TOKEN_EXPIRED`, `ACCESS_TOKEN_INVALID`, and `INTERNAL_ERROR`.

## Member API baseline

Member JSON fields also use camelCase and are routed to Spring Boot.

| Endpoint | Authentication | Current purpose |
|---|---|---|
| `POST /api/members/signup` | Public | Create a member with a BCrypt password hash |
| `POST /api/members/login` | Public | Return an access token and set the refresh cookie |
| `POST /api/members/token/refresh` | HttpOnly cookie | Rotate the refresh cookie and return a new access token |
| `POST /api/members/logout` | Bearer + HttpOnly cookie | Revoke the refresh token and clear its cookie |
| `GET /api/members/me` | Bearer access token | Return the current member |
| `GET/POST/DELETE /api/members/search-histories` | Bearer access token | Paginated owned search histories |
| `GET/POST/DELETE /api/members/saved-results` | Bearer access token | Paginated owned saved-result snapshots |

Token JSON contains `accessToken`, `tokenType`, and `expiresIn`; it never contains the refresh token.
The refresh token uses an environment-configured HttpOnly, Secure, SameSite, Path and Max-Age cookie.
Access tokens are RS256 JWTs with issuer, audience, subject, role, type, issued-at and expiry claims.
Spring Boot owns the private key and FastAPI verifies protected search routes with the public key.


Activity list responses use `{ items, page, size, totalElements, totalPages }`. Saved results include
`catalogItemId`, title and URLs, `similarityScore`, structured metadata, `modelVersion`, and
`createdAt`. Ownership is taken only from the authenticated principal.

Saved metadata preserves `category`, `colors`, `styleTags` and optional `storeId`, `storeName`,
`productKey`, and `price`. Missing shop fields remain nullable for older records. Prices must be
non-negative. Cross-service contract tests compare the full metadata returned by search and storage.
