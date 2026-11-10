# 로컬 쇼핑몰 이미지 검색

네이버 API와 Qdrant를 사용하지 않습니다. 다운로드 폴더의 원본 사진을 쇼핑몰 상품명과 정확히 대조해 로컬 카탈로그로 가져옵니다. 원본은 수정하지 않으며, 상품 ID와 가격은 기존 쇼핑몰의 `public/products.json`을 기준으로 연결합니다.

## 데이터 갱신

저장소 루트에서 실행합니다.

```powershell
uv run python -m backend.app.catalog.import_downloads --source-root ../shopping-originals --shopping-root ../shopping
```

`../shopping-originals`에는 `1쇼핑몰`, `2쇼핑몰`, `3쇼핑몰` 원본 폴더를 두고, `../shopping`에는 대응하는 `shop1`, `shop2`, `shop3` 프로젝트를 둡니다. 실제 위치가 다르면 경로를 바꿉니다.

동일한 상품명이 중복되거나 대응하는 원본이 없으면 가져오기를 중단합니다. 대응 내역은 Git에서 제외한 `catalog/generated/source-images.json`, 검색 상품 정보는 `catalog/generated/shopping-manifest.json`에 생성됩니다. 상품을 추가할 때는 쇼핑몰 상품 정보에도 같은 상품을 등록해야 합니다.

가져온 뒤 백엔드를 재시작하면 이미지와 manifest의 SHA-256에 따라 임베딩 캐시를 갱신합니다. FashionCLIP은 그대로 사용하며, 정규화한 벡터를 NumPy 행렬로 유지해 정확한 코사인 유사도를 계산합니다. 상품 재검색에서는 자기 자신을 제외합니다. 재시작 시 유효한 캐시가 있으면 다시 임베딩하지 않습니다.

Docker 캐시 경로는 `/app/.cache/huggingface/shopping-embeddings.npz`입니다. `/health/ready`의 `checks.localIndex`에서 준비 상태와 상품 수를 확인합니다. 기본 Compose는 카탈로그를 읽기 전용으로 마운트합니다. 소스 코드를 수정하면 배포 이미지를 다시 빌드해야 합니다.

## 확인 결과 (2026-11-10)

- 원본 80개를 누락 없이 상품명으로 연결했습니다.
- Qdrant 컨테이너를 제거하고 서비스 정의와 Python 의존성, 이전 네이버 가져오기 도구를 제거했습니다. 기존 데이터 볼륨은 보관했습니다.
- 카탈로그 전환 당시 백엔드 테스트 27개와 변경한 Python 파일의 Ruff 검사를 통과했습니다. 이후 추가한 테스트를 포함한 최신 결과는 [테스트 문서](TESTING.md)에 기록했습니다.
- 원본 사진을 실제 인증된 이미지 검색 API에 업로드해 아래 첫 결과와 URL을 확인했습니다.

| 쇼핑몰 | 첫 결과 ID | 유사도 | 상품 주소 |
| --- | --- | --- | --- |
| shop1 | modo.t31 | 0.9969 | https://shop1.cora1022.com/#/product/t31 |
| shop2 | form01.t27 | 0.9919 | https://shop2.cora1022.com/#/product/t27 |
| shop3 | commonroom.t26 | 0.9866 | https://shop3.cora1022.com/#/product/t26 |

각 항목의 카탈로그 재검색에서 자기 자신이 제외되는 것도 확인했습니다. 프런트엔드 응답 형식과 상품 링크는 유지되므로 새 UI에서 그대로 사용할 수 있습니다.
