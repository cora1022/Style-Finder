# 로그인과 회원가입

Style Finder의 회원 기능은 Spring Boot 회원 서버와 React 화면으로 구성했습니다. 로그인하면 검색 기록과 저장한 상품을 같은 계정으로 확인할 수 있습니다.

## 입력과 오류 처리

회원가입은 이름, 이메일, 비밀번호와 비밀번호 확인을 받습니다. 화면에서 검증한 뒤 서버에서도 이름과 이메일 길이, 빈 값과 비밀번호 길이를 검증합니다. 이메일과 표시 이름의 앞뒤 공백은 제거하며, 비밀번호의 공백은 변경하지 않습니다. 이메일의 대소문자는 서버에서 정규화합니다.

비밀번호는 가입 시 8자 이상이며 BCrypt 입력 제한에 맞춰 UTF-8 기준 72바이트 이하로 받습니다. 글자 수가 제한 이내여도 한글처럼 여러 바이트를 쓰는 문자열이 제한을 넘으면 해시 함수를 호출하기 전에 거절합니다. 기존 계정 로그인에는 회원가입 최소 길이 규칙을 새로 적용하지 않습니다.

서버 검증 오류는 `error.fields`로 전달해 해당 입력 아래에 표시합니다. 비밀번호 확인 불일치, 중복 이메일, 로그인 실패, 네트워크 오류와 서버 오류를 구분합니다. 요청 중에는 중복 제출과 화면 전환을 막고, 성공하면 비밀번호를 지운 뒤 로그인 단계로 안내합니다. 로그인, 가입과 토큰 갱신 요청의 응답 대기는 15초로 제한합니다. 비밀번호 확인 값은 서버에 전송하지 않습니다.

입력마다 명시적인 레이블과 오류 설명을 연결하고 잘못 입력한 첫 필드로 포커스를 이동합니다. 비밀번호 표시 전환, Caps Lock 안내와 브라우저 자동완성을 지원합니다. 기본 `dialog`로 포커스를 제한하고 닫은 뒤 원래 위치로 돌려보냅니다. 작은 화면에서는 대화상자 안에서 스크롤합니다.

## 세션 흐름

- 비밀번호는 BCrypt 해시로 저장합니다.
- Access Token은 브라우저 메모리에만 보관합니다.
- Refresh Token은 HttpOnly 쿠키로 전달하며 서버에는 SHA-256 해시로 저장합니다.
- 새로고침하면 쿠키를 이용해 Access Token과 회원 정보를 복원합니다.
- 인증 요청이 401로 거절되면 갱신 요청을 하나로 합치고 원래 요청을 한 번 재시도합니다. 갱신이나 재시도가 실패하면 로그인 상태를 해제합니다.
- 갱신 토큰 조회에는 DB 쓰기 잠금을 사용합니다. 같은 토큰으로 동시에 갱신해도 한 요청만 새 토큰을 발급받고 나머지는 거절됩니다.
- 로그아웃하면 해당 갱신 토큰을 폐기하고 쿠키를 지웁니다. 이미 발급된 Access Token은 자체 만료 시각까지 유효합니다.

HTTPS 배포에서는 `REFRESH_COOKIE_SECURE=true`를 설정합니다. 허용 출처는 `MEMBER_CORS_ORIGINS`로 지정하며, 로컬 설정을 공개 배포에 그대로 사용하지 않습니다.

## 검증

`frontend`에서 `npm test`, `npm run build`, `npm run lint`를 실행합니다. 폼 검증, 가입 완료 전환, 중복 제출 방지와 세션 실패 처리를 테스트합니다.

`member-service`에서 `gradlew.bat check`를 실행합니다. 서버 입력 검증, 비밀번호 해시, 쿠키 설정, 토큰 교체, 동시 갱신과 로그아웃을 테스트합니다. 회원 API 테스트는 H2에서 실행하며 MySQL Flyway 테스트는 Testcontainers가 Docker를 사용할 수 있을 때 실행합니다.

2026-11-10 프런트엔드 25개와 회원 서버 24개 테스트, 빌드, 린트와 Java 포맷 검사가 통과했습니다. 로컬 MySQL 환경에서 실제 Google 계정 선택과 사용자 동의를 거쳐 로그인에 성공했습니다. Google 계정 생성, 기존 이메일 계정의 자동 연결 거절, 미확인 이메일 거절, 잘못된 콜백 차단과 쿠키 발급은 서버 테스트에도 포함합니다. MySQL Flyway Testcontainers 테스트 1개는 Docker 감지 실패로 건너뛰었으며 실제 로컬 서버에서 V4 적용과 Google 로그인을 별도로 확인했습니다.

## Google 로그인 설정

Spring Security OAuth2 Client가 Google의 인증 코드 교환과 ID Token 검증을 처리합니다. OAuth 요청 상태는 수명이 짧은 HttpOnly 세션 쿠키에 연결하며 state와 nonce를 사용합니다. 로그인 완료 또는 실패 시 임시 세션을 무효화하고, 이후 API 인증에는 기존 JWT만 사용합니다. 기존 비밀번호 계정과 데이터는 V4 마이그레이션으로 유지하며 Google 전용 계정의 비밀번호 해시는 비워둡니다.

Google 사용자는 검증된 이메일과 고유 subject로 구분합니다. 기존 Google 계정은 subject로 조회하며, 같은 이메일의 비밀번호 계정은 자동으로 연결하지 않습니다. 해당 사용자는 기존 이메일 로그인으로 안내합니다. Google 로그인 성공 후에는 서비스의 갱신 쿠키를 발급하고 홈으로 이동합니다. Access Token이나 Google Token을 URL에 넣지 않으며, 홈 화면에서 서버 세션을 복원해야 로그인 상태가 됩니다.

서버 환경 변수는 다음과 같습니다. 비밀 값은 Git에서 제외된 `.env`에만 보관하며 프런트엔드 변수에 넣지 않습니다.

```dotenv
GOOGLE_OAUTH_ENABLED=true
GOOGLE_CLIENT_ID=your-client.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=https://fashion.cora1022.com/api/members/login/oauth2/code/google
GOOGLE_FRONTEND_URL=https://fashion.cora1022.com
```

Google Cloud에 동일한 리디렉션 URI를 등록해야 합니다. 로컬은 `http://localhost/api/members/login/oauth2/code/google`을 추가하고 `http://localhost/`에서 로그인합니다. 현재 로컬 Compose override는 콜백과 반환 주소를 localhost로 고정합니다. 브라우저가 시작 주소와 콜백 주소에서 같은 호스트를 사용해야 OAuth 세션 쿠키를 보낼 수 있습니다.

로컬 실행 시 기존 기본 설정과 `.env`의 Google 설정을 함께 읽습니다.

```powershell
docker compose -p stylefinder-portfolio --env-file .env.example --env-file .env -f docker-compose.yml -f docker-compose.shopping.yml -f docker-compose.local.yml up -d --build
```

운영 환경에서는 `.env.aws.example`을 참고해 VPS의 `.env`에 DB 비밀번호, OAuth 설정, HTTPS와 허용 출처를 함께 설정합니다. 로컬 override 파일은 배포에 사용하지 않습니다. `REFRESH_COOKIE_SECURE=true`로 설정하면 OAuth 임시 세션 쿠키도 Secure로 설정됩니다.

Google 동의 화면의 앱 이름은 Google Auth Platform의 브랜딩 설정을 따릅니다. 현재 계정 선택 화면에는 `KeyBreaker`로 표시되므로 포트폴리오 공개 전 `Style Finder`로 변경해야 합니다. Google 로그인은 전체 페이지 이동을 사용하므로 로그인 전에 선택한 업로드 파일은 다시 선택해야 합니다.

## 아직 연결하지 않은 기능

비밀번호 계정의 이메일 소유 확인과 비밀번호 재설정은 구현되지 않았습니다. Google 로그인은 설정 전 비활성 버튼과 안내 문구를 표시합니다. 로그인 시도 횟수 제한은 별도 운영 기능으로 남아 있습니다.
