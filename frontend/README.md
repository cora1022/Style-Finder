# Style Finder Frontend

Style Finder의 React 사용자 인터페이스입니다.

## 현재 기능

- SNS 사진으로 옷을 찾는 서비스 랜딩과 움직이는 의류 배경
- 크림색과 코랄색의 둥근 로그인 및 회원가입 화면
- 서버 설정에 따른 Google 로그인과 인증 후 세션 복원
- 비로그인 검색 시작 시 로그인 안내
- 로그인 후 이미지 업로드와 검색 화면 전환
- JPEG/PNG, 파일 크기, 이미지 픽셀 사전 검증
- 자동 영역 제안과 수동 크롭
- FastAPI 이미지 검색과 카탈로그 ID 재검색
- 유사도, 카테고리, 태그, 원본 링크 결과 표시
- HttpOnly Refresh 쿠키 기반 새로고침 세션 복원과 단일 자동 갱신
- 검색 기록, 저장 결과, 삭제, 저장 이미지 재검색과 마이페이지

회원 API는 `src/api/members.ts`, 검색 API는 `src/api/search.ts`로 분리되어 있습니다.
Access Token은 메모리에만 저장하고 보호된 요청의 Bearer 헤더로 전달합니다. Refresh
Token은 JavaScript에서 읽지 않으며, Spring Boot가 설정한 HttpOnly 쿠키로 회전합니다.
동시에 여러 요청이 401을 받아도 하나의 Refresh 요청만 실행하고 원 요청을 한 번만
재시도합니다.

## 실행

```powershell
npm ci
npm run dev
```

기본 개발 주소는 `http://127.0.0.1:5173`입니다. `/api`와 `/health` 요청은
`http://localhost`의 Caddy로 프록시하므로 전체 서비스도 실행해야 합니다. Docker의 동일 출처 Caddy를 사용할 때
`VITE_API_BASE_URL`은 비워둘 수 있습니다.

## 검증

```powershell
npm run test
npm run lint
npm run build
```

## API 연결 원칙

- 이미지 검색과 크롭은 FastAPI가 담당합니다.
- 회원과 사용자 활동은 Spring Boot가 담당합니다.
- 화면 컴포넌트에서 서비스 URL을 직접 조합하지 않습니다.
- Access Token은 localStorage와 sessionStorage에 저장하지 않습니다.
- 서버 오류 코드를 사용자가 이해할 수 있는 메시지로 변환합니다.

## 이미지 자산

`public/assets/wardrobe`의 최적화된 WebP 10개를 랜딩 배경으로 사용합니다.
자체 호스팅 글꼴과 라이선스는 `public/assets/fonts`에 있습니다. 기존
`public/style-finder-hero*.png`는 이전 시안 자산입니다. 네이버 상품 크롭 이미지는
프런트 자산에 포함하지 않습니다. 자세한 화면 구성은
[프런트엔드 디자인 문서](../docs/FRONTEND_DESIGN.md)를 참고하세요.
