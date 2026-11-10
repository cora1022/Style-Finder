# 가상 쇼핑몰 카탈로그 연결

MODO, FORM:01, COMMON ROOM의 생성형 의류 이미지 80개를 로컬 카탈로그로 가져옵니다. 네이버 API와 외부 이미지 다운로드를 사용하지 않습니다. 검색 결과의 `sourceUrl`은 해당 쇼핑몰 상품의 고유 상세 주소입니다.

공개 주소는 `https://shop1.cora1022.com/`, `https://shop2.cora1022.com/`, `https://shop3.cora1022.com/`입니다. 2026-11-09에 Cloudflare Pages 배포와 가비아 CNAME 연결을 완료하고 세 도메인의 HTTPS 접속과 상품별 상세 주소를 확인했습니다.

로컬 연동 코드와 상품 80개 카탈로그 생성 및 검증은 완료했습니다. 검색 서비스는 `fashion.cora1022.com`에 VPS로 배포할 예정이며 아직 운영 서버에 적용하지 않았습니다. 배포 시 검색용 manifest와 이미지도 별도로 전달해야 합니다.

## 카탈로그 생성

쇼핑몰 폴더에서 빌드한 뒤 이 저장소 루트에서 실행합니다.

```powershell
uv run python -m backend.app.catalog.import_shopping `
  --shopping-root ../shopping `
  --stores ../shopping/stores.production.json
```

기본 출력은 `catalog/generated/shopping-manifest.json`과 `catalog/images/shopping`입니다. 기존 `catalog/manifest.json`은 수정하지 않습니다. 예를 들어 `commonroom:t05`는 카탈로그 ID `commonroom.t05`로 매핑되고 `sourceUrl`은 `https://shop3.cora1022.com/#/product/t05`가 됩니다.

쇼핑몰에서는 WebP를 사용하고, 검색 카탈로그에는 기존 JPEG/PNG 검증과 호환되는 JPEG 파생본을 만듭니다. 쇼핑몰 원본 파일은 변경하지 않습니다.

상품 이름, 색상, 분류, 쇼핑몰 이름, 가격과 상품 키도 함께 기록합니다. `rights`에는 사용자 생성 이미지의 출처를 기록합니다. 생성된 파일과 이미지는 기존 로컬 카탈로그 정책에 따라 Git에서 제외합니다. 배포 서버에도 동일한 생성 파일과 이미지를 전달해야 합니다.

```powershell
uv run python -m backend.app.catalog.indexer validate --manifest catalog/generated/shopping-manifest.json
```

로컬 주소로 시험하려면 `--stores ...\stores.local.json --allow-local`을 사용합니다. 기본 모드는 HTTPS 주소를 요구합니다.

## 색인과 실행

`docker-compose.shopping.yml`은 쇼핑몰 manifest 경로를 명시합니다. 현재 기본 Compose도 같은 경로를 사용하므로 오버라이드는 선택 사항입니다. Qdrant 컬렉션은 사용하지 않습니다. FashionCLIP 모델 리비전은 기존 프로젝트에 고정된 값을 그대로 사용합니다.

Docker가 실행 중일 때, 쇼핑몰 구성으로 서비스를 빌드하고 실행합니다.

```powershell
docker compose --env-file .env.example -f docker-compose.yml -f docker-compose.shopping.yml up -d --build
docker compose --env-file .env.example -f docker-compose.yml -f docker-compose.shopping.yml exec backend python -m backend.app.catalog.indexer index --manifest /app/catalog/generated/shopping-manifest.json
```

모델 캐시가 없으면 첫 실행에 모델 다운로드가 필요합니다. 색인 명령은 정규화한 벡터를 `.npz` 캐시에 기록하며 컬렉션을 만들지 않습니다. 이미 실행 중인 백엔드는 캐시 생성만으로 메모리 인덱스를 다시 읽지 않으므로 재시작 후 `/health/ready`와 실제 이미지 검색 결과를 확인합니다.

```powershell
docker compose --env-file .env.example -f docker-compose.yml -f docker-compose.shopping.yml restart backend
```

다른 카탈로그를 사용하려면 별도 Compose 오버라이드에서 `CATALOG_MANIFEST_PATH`와 필요하면 `CATALOG_INDEX_PATH`를 지정하고 서비스를 다시 생성합니다. 운영 서버에서는 운영 환경 파일을 사용합니다.

## 결과 화면

검색 결과는 쇼핑몰 이름과 가격을 표시하고 `상품 보러 가기` 링크를 새 창으로 엽니다. 링크는 HTTP와 HTTPS만 허용하며, 이전 카탈로그처럼 쇼핑몰 정보나 링크가 없는 항목도 표시할 수 있습니다. 상품 사진은 기존 `/api/catalog/items/{id}/image`로 제공합니다.
