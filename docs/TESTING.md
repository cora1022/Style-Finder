# 테스트 구성과 검증 범위

테스트 개수보다 서비스 경계에서 실제로 깨질 수 있는 동작을 검증하는 데 중점을 둡니다. Spring이 발급한 토큰을 Python에서 받아들이는지, 검색 결과를 저장할 때 필드가 유지되는지, 다른 사용자가 데이터를 삭제할 수 없는지 확인합니다.

## 서비스 연동 테스트

`integration/tests/test_service_contract.py`는 별도 Docker Compose 프로젝트에 실제 Spring Boot와 MySQL 8.4를 실행합니다. 테스트마다 새 RSA 키를 만들고 Spring에는 개인키, FastAPI에는 공개키를 전달합니다. Python에서 임의로 만든 토큰으로 Spring 발급을 대신하지 않습니다. FastAPI는 운영 애플리케이션의 ASGI 경로를 TestClient로 호출합니다.

실제 회원 서비스, Flyway V1부터 V4, MySQL 트랜잭션과 제약 조건, JWT 서명과 검증, 업로드 검증, NumPy 검색과 상품 이미지 제공 코드를 사용합니다. 이미지 임베딩은 합성 이미지의 색상 특징을 반환하는 결정적 인코더로 교체합니다. 의류 탐지기는 비활성화하고 원본을 유지해 JPEG로 반환하는 크롭 경로를 검증합니다. 테스트 도중 실제 의류 사진이나 외부 모델 가중치를 다운로드하지 않습니다.

초기 실행에서 저장된 `metadata`와 검색 응답의 `metadata`를 비교하자 `storeId`, `storeName`, `productKey`, `price`가 빠져 실패했습니다. Spring의 저장 DTO에 해당 선택 필드를 추가하고 음수 가격을 거절하도록 수정했습니다. 기존 세 필드만 있는 저장 데이터도 읽을 수 있게 유지합니다. 이 테스트는 상품 ID가 같다는 확인을 넘어 판매처와 가격까지 보존되는지 검증합니다.

| 시나리오 | 검증하는 위험 |
|---|---|
| 가입, 로그인, 크롭, 검색, 저장, 갱신 후 조회와 삭제 | Java와 Python의 인증 계약 및 검색 결과 DTO 불일치, 저장 후 데이터 누락 |
| 다른 계정으로 목록 조회와 삭제 시도 | 저장 상품과 검색 기록의 사용자 간 노출, 무단 삭제 |
| Refresh Token으로 검색, 이전 쿠키 재사용, 로그아웃 후 재사용 | 토큰 용도 혼동, 회전과 폐기 실패 |
| 같은 상품 동시 저장 | DB 경쟁 상태로 중복 행이 생기거나 500을 반환하는 문제 |
| 같은 쿠키 동시 갱신 | 한 토큰으로 세션이 두 개 발급되는 문제, 정상 승자의 세션을 잘못 폐기하는 문제 |

중복 저장은 201과 409가 한 번씩 반환되고 실제 행은 하나인지 확인합니다. 동시 갱신은 200과 401이 한 번씩 반환되고 승자의 새 쿠키가 계속 유효한지 확인합니다. 단순히 HTTP 200만 검사하지 않습니다.

로그아웃 후에는 갱신 토큰이 폐기됩니다. 이미 발급된 Access Token은 자체 만료까지 유효하다는 현재 설계도 테스트에 명시합니다. 즉시 JWT 폐기를 구현했다고 설명하지 않습니다.

저장소 루트에서 실행합니다. Docker Desktop 또는 Docker Engine과 프로젝트 Python 의존성이 필요합니다.

```powershell
uv sync --frozen
docker build -t stylefinder-contract-member:test -f member-service/Dockerfile .
uv run pytest integration/tests -q --junitxml=integration/results-local.xml
```

이미 현재 소스로 만든 회원 이미지가 있다면 빌드를 생략하고 아래처럼 지정할 수 있습니다. 소스를 수정한 뒤에는 해당 이미지도 다시 빌드해야 합니다.

```powershell
uv run pytest integration/tests -q --member-image stylefinder-portfolio-member-service:latest
```

Docker 연결 실패나 이미지 누락은 테스트 실패로 처리합니다. 자동으로 건너뛰거나 실제 서비스로 대체하지 않습니다. 생성한 `stylefinder-contract-<임의 ID>` 프로젝트만 테스트 종료 시 제거합니다. 테스트 DB는 tmpfs를 사용하고 기존 앱의 DB, OAuth 설정과 카탈로그를 사용하지 않습니다. Compose에 적힌 비밀번호는 격리된 테스트 전용 값입니다. 기존 서비스의 비밀 값을 복사하지 않습니다.

## 화면의 실패 처리 테스트

`frontend/src/components/SearchScreen.test.tsx`는 실제 화면과 API 클라이언트를 렌더링하고 MSW로 HTTP 응답만 제어합니다.

- 검색 기록 저장이 실패해도 상품 결과와 링크를 유지하고 결과를 저장할 수 있습니다.
- 추가 검색이 실패해도 기존 결과를 유지합니다. 재시도는 요청 수가 `2 → 4 → 4`로 이어져 결과를 건너뛰지 않습니다. 추가 검색 중에는 전체 검색 모달을 띄우지 않습니다.
- 상품 저장이 실패하면 같은 결과에서 다시 저장할 수 있습니다.
- 이미 저장된 상품의 409 응답은 저장 완료 상태로 처리합니다.
- 검색 서버가 요청을 거절하면 로딩을 끝내고 오류를 안내합니다. 실패한 검색의 기록은 생성하지 않습니다.

```powershell
cd frontend
npm test
npm run lint
```

## 추론 자원 회수 테스트

`backend/tests/test_inference_executor.py`는 대기열과 실행 시간 초과 외에 추론 예외와 요청 취소도 검증합니다. 요청이 취소돼도 실제 작업 스레드가 실행 중이면 슬롯을 유지해야 합니다. 작업 종료 후에는 다음 요청이 처리돼야 합니다. 취소 테스트의 작업 시작과 종료는 고정된 sleep 대신 스레드 이벤트로 동기화합니다.

```powershell
uv run pytest backend/tests -q
uv run ruff check backend integration
```

## CI

기존 프런트엔드와 백엔드 검사 외에 `service-contract` 작업이 회원 이미지를 빌드하고 격리된 MySQL 연동 테스트를 실행합니다. 결과는 JUnit XML 아티팩트로 보관합니다. 이 설정은 다음 push 또는 PR에서 실행되며, 로컬에서 파일을 변경했다고 GitHub CI가 실행된 것으로 기록하지 않습니다.

## 이번 테스트로 판단하지 않는 것

이 연동 테스트는 브라우저와 Caddy를 포함한 E2E 테스트가 아닙니다. Google의 실제 인증 서버도 자동 테스트에 포함하지 않습니다. 실제 FashionCLIP의 검색 품질이나 운영 서버 성능을 합성 인코더의 결과로 평가할 수 없습니다. 공개 배포 후 브라우저 전체 흐름 확인, 실제 사진을 이용한 품질 평가와 성능 측정은 별도로 수행합니다.

## 로컬 실행 결과

2026-11-10 Windows의 로컬 Python 3.12와 Docker Desktop에서 실행했습니다. Python 테스트는 `uv sync --frozen`으로 준비한 프로젝트 `.venv`에서도 다시 실행해 잠금 파일의 의존성으로 통과하는지 확인했습니다.

| 검사 | 결과 |
|---|---|
| FastAPI 기존 테스트와 추론 회복 테스트 | 29개 통과 |
| React 기존 테스트와 검색 실패 처리 테스트 | 33개 통과 |
| Spring Boot H2 및 단위 테스트 | 25개 통과, MySQL Testcontainers 1개 건너뜀 |
| 실제 Spring Boot와 MySQL 서비스 연동 테스트 | 5개 통과 |
| Python Ruff 및 프런트엔드 ESLint | 통과 |

Python 테스트에는 설치된 Starlette TestClient와 httpx 조합에 대한 사용 중단 예정 경고 1개가 표시됐습니다. 테스트 실패는 없었습니다. GitHub CI 실행 결과와 실제 운영 서버 성능을 이 로컬 결과로 대체하지 않습니다.
