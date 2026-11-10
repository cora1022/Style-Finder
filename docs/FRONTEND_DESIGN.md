# 프런트엔드 디자인

크림색 바탕, 코랄색 버튼과 둥근 형태를 홈, 로그인, 영역 선택, 검색 결과와 마이페이지에 적용했습니다. 홈의 옷 사진은 기존 쇼핑몰 상품 이미지를 재사용하며, 샘플 선택이나 추천 상품 목록은 표시하지 않습니다.

## 개발 화면

프로젝트의 `frontend`에서 `npm ci` 후 `npm run dev`를 실행합니다. 개발 주소는 `http://127.0.0.1:5173/`입니다. `/api`와 `/health`는 기존 로컬 Caddy로 전달하므로 회원 서비스와 이미지 검색 서버도 실행되어 있어야 합니다. 전체 서비스 실행 방법은 루트의 [README](../README.md#로컬-실행)를 참고합니다.

홈에서 고른 파일은 로그인 후 영역 선택 화면으로 전달합니다. 자동 탐지와 직접 영역 조절을 지원하고, 직접 조절한 경우 선택 영역을 적용한 뒤 검색합니다. 미리보기와 실제 검색은 같은 영역을 사용하며 변경한 영역을 다시 적용하기 전에는 검색 버튼이 비활성화됩니다.

검색 결과는 입력 사진과 가로 목록으로 배치했습니다. 상품 링크, 저장, 유사 상품 재검색과 추가 결과 조회는 기존 API를 사용합니다. 목록의 상품 이름, 가격과 유사도는 서버 응답으로 표시하며 시안의 예시 수치를 고정하지 않습니다.

## Google 로그인

Google 로그인은 Spring Security의 Authorization Code와 OpenID Connect 흐름을 사용합니다. 화면은 `/api/members/oauth2/status`로 활성 상태를 확인하고 `/api/members/oauth2/authorization/google`로 이동합니다. 설정이 없는 환경에서는 버튼을 비활성화합니다. 이메일 가입 검증과 세션 흐름은 `AUTHENTICATION.md`에 정리했습니다.

인증 후 서버가 기존 HttpOnly 갱신 쿠키를 발급하고 홈으로 돌아오면 프런트엔드는 세션 복원 API로 회원을 확인합니다. URL의 성공 표시만으로 로그인하지 않습니다. Google 이동 시 페이지가 다시 로드되므로 로그인 전에 선택한 파일은 다시 선택해야 합니다. 로컬 Google 로그인은 `http://localhost/`에서 검증합니다. 클라이언트 비밀키는 서버 환경 변수로만 전달합니다.

## 이미지와 글꼴

배경은 쇼핑몰에서 이미 만든 WebP를 복사해 사용합니다. 배경 전용 파일의 상품 정보나 API를 추가로 조회하지 않습니다. 행마다 다른 방향과 속도로 무한 반복하며 `prefers-reduced-motion`이 설정된 경우 멈춥니다.

제목과 로고에는 [LINE Seed KR](https://seed.line.me/index_kr.html), 본문과 상품 정보에는 Pretendard Variable을 자체 호스팅합니다. 글꼴 라이선스는 `frontend/public/assets/fonts/OFL.txt`와 `Pretendard-OFL.txt`에 보관합니다. 아이콘은 [Phosphor](https://github.com/phosphor-icons/react), Google 표시는 [공식 로그인 브랜드 자산](https://developers.google.com/identity/branding-guidelines)을 사용합니다.

`npm run build`, `npm run lint`, `npm test`로 코드를 확인합니다. 검색 실패와 세션 처리의 자동 테스트 범위는 [테스트 문서](TESTING.md)에 정리했습니다.
