# Style Finder

사진에서 선택한 옷과 비슷한 카탈로그 이미지를 찾는 패션 이미지 유사도 검색
포트폴리오입니다. OpenCV 기반 관심 영역 전처리, FashionCLIP 임베딩, 로컬 벡터 인덱스
벡터 검색에 Spring Boot 회원 서비스와 MySQL을 결합하고 있습니다.

현재 React, FastAPI, Spring Boot, MySQL, Caddy가 하나의 Docker Compose
스택으로 실행됩니다. 서비스 경계, 서버 측 인증, 사용자별 활동 기능은 구현되어 있습니다.
다만 단일 Compose에 배포하는 포트폴리오 기준선이며, 독립 배포와 운영 체계를 갖춘 완성형
마이크로서비스라고 과장하지 않습니다.

## 현재 구현

### 사용자 화면

- 에디토리얼 스타일 랜딩, 로그인, 회원가입 화면
- 로그인 후 이미지 업로드, 자동 및 수동 크롭, 유사 이미지 검색
- JPEG/PNG 사전 검증: 최대 10MiB, 최대 1,600만 픽셀
- 카탈로그 ID 기반 재검색과 유사도 결과 표시
- 새로고침 세션 복원과 Access Token 자동 갱신
- 검색 기록, 결과 저장, 삭제, 저장 이미지 재검색, 마이페이지

### 이미지 검색 서비스

- FastAPI 업로드 검증과 안전한 오류 응답
- OpenCV/YOLO 관심 영역 제안과 사람 상반신 HOG fallback
- FashionCLIP 512차원 임베딩과 NumPy 로컬 코사인 유사도 검색
- 임의 URL 다운로드 API 제거와 로컬 manifest 기반 이미지 제공
- 추론 thread offload, 동시 실행 제한, liveness/readiness
- 대기열 timeout과 실제 실행 timeout 분리
- 권리 메타데이터 기반 카탈로그 인덱서와 로컬 legacy 마이그레이션 도구
- Spring Boot가 발급한 RS256 Access Token을 이용한 검색과 크롭 API 보호

### 회원 서비스 기준선

- Spring Boot 3, Java 21, Spring Security
- 회원가입, 로그인, 내 정보 조회
- BCrypt 비밀번호 해시
- Access/Refresh Token 발급과 Refresh Token 해시 저장, 회전, 폐기
- RSA 비대칭키 서명, issuer, audience, 만료, token type 검증
- 일관된 Spring Security 401/403 오류 응답
- HttpOnly Refresh 쿠키, 회전, 폐기, 로그아웃, 만료 데이터 정리
- MySQL과 Flyway V1/V2/V3 migration
- 페이지네이션과 소유권 조건을 적용한 검색 기록 및 저장 결과 API
- JSON metadata 직렬화와 사용자별 접근 차단
- H2 통합 테스트와 MySQL Testcontainers migration 테스트
- MySQL·Flyway 기반 readiness

## 아직 완료되지 않은 기능

- 공개 배포 가능한 권리 확보 카탈로그
- 권리 확보 카탈로그 기준의 검색 성능 측정과 최신 화면 자료

React는 검색과 크롭 요청에 Access Token을 전달하고, FastAPI는 Spring Boot와 공개키를
공유해 서명과 표준 claim을 검증합니다. Refresh Token 원문은 JSON에 포함하지 않고
HttpOnly 쿠키로만 전달합니다. 자세한 흐름은 [인증 문서](docs/AUTHENTICATION.md)를
참고하세요.

## 아키텍처

```text
Browser
  → Caddy
    → /                         React와 Nginx
    → /api/members/*            Spring Boot → MySQL
    → /api/search/*             FastAPI → 로컬 벡터 인덱스
    → /api/preprocess/*         FastAPI
    → /api/catalog/*            FastAPI
```

Spring Boot와 FastAPI는 데이터베이스를 공유하지 않습니다. Spring Boot는 회원과 사용자
활동 데이터를, FastAPI는 이미지 처리와 벡터 검색을 소유합니다. 자세한 내용은
[아키텍처 문서](docs/ARCHITECTURE.md)를 참고하세요.

## 로컬 실행

JDK 21, Docker Desktop이 필요합니다. `.env.example`의 비밀번호는 로컬 실행 기본값일
뿐 운영 환경에서 사용하면 안 됩니다. RSA 키는 첫 Compose 실행 시 전용 Docker volume에
생성되며 Git에 저장되지 않습니다.

```powershell
docker compose --env-file .env.example config
docker compose --env-file .env.example up -d --build
docker compose --env-file .env.example ps
```

접속 주소는 `http://localhost`입니다.

권리 확보 카탈로그가 없는 새 환경에서는 랜딩, 회원, 크롭 기능은 실행되지만
`/health/ready`가 503을 반환하고 검색 결과는 제공되지 않습니다. 카탈로그 준비 방법은
[catalog/README.md](catalog/README.md)를 참고하세요.

## 검증

```powershell
uv sync --frozen
uv run ruff check backend
uv run pytest backend/tests -q

cd frontend
npm ci
npm run test
npm run lint
npm run build

cd ../member-service
./gradlew test
./gradlew bootJar
```

서비스별 테스트는 위 명령으로 실행합니다.


## 데이터 정책

기존 네이버 쇼핑 API에서 수집한 크롭 이미지와 벡터는 로컬 기능 확인에만 사용합니다.
이미지, 로컬 manifest, 로컬 임베딩 캐시은 Git과 Docker 빌드 컨텍스트에서 제외됩니다.
공개 저장소나 공개 배포에는 소유권 또는 재배포 권리가 확인된 카탈로그만 사용해야 합니다.

자세한 정책은 [DATA_POLICY.md](docs/DATA_POLICY.md)를 참고하세요.

## 알려진 제한

- HOG fallback은 의류 탐지가 아니라 사람 상반신 추정입니다.
- YOLO가 의류 클래스를 감지하지 못하면 원본 이미지를 유지합니다.
- 새 공개 카탈로그는 FashionCLIP commit `7e3ba62ce16b379a1ab479346b66f192e76f51b7`로 고정합니다.
- legacy 네이버 벡터의 정확한 FashionCLIP commit revision은 확인되지 않았습니다.
- 일반 CI에서는 실제 모델 다운로드와 실제 로컬 이미지 검색을 수행하지 않습니다.
- 공개 운영 전 로그인, 회원가입, 토큰 갱신에는 공유 저장소 기반 edge rate limit이 필요합니다.
- cold start와 warm search 성능 측정은 권리 확보 카탈로그 준비 후 공개할 예정입니다.

## Repository

https://github.com/cora1022/fashion-portfolio-project
