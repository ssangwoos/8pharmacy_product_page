# EIGHT PHARMACY — Store Locator

에이트약국 지점 안내 페이지. 인스타그램 프로필 링크용으로 만든 한 장짜리 사이트입니다.
9개 언어를 지원하고, 지점 정보는 별도 관리자 페이지에서 수정합니다.

**공개 페이지** → `https://8pharmacy.kr/profile/`
**관리자 페이지** → `https://8pharmacy.kr/profile/admin.html`

---

## 기능

- 지점 카드 — 주소, 영업시간(평일/토/일), 지도 링크, 지점 SNS, 전화걸기
- **실시간 영업 상태** — 한국 시간 기준으로 `영업중 / 곧 마감 / 영업 종료 / 오늘 휴무` 자동 표시
- **지도 4종** — 네이버지도 · 카카오맵 · 구글맵 · 고덕지도(高德, 중국 방문객용)
- **9개 언어** — 한국어 · English · 日本語 · 简体中文 · 繁體中文 · ไทย · Tiếng Việt · Indonesia · Монгол
- 지역 / 영업중 필터, 다크모드, 모바일 우선 레이아웃

## 파일 구조

| 파일 | 역할 |
|---|---|
| `index.html` `style.css` `script.js` | 공개 페이지 |
| `admin.html` `admin.css` `admin.js` | 관리자 페이지 (Firebase Auth 로그인) |
| `data.js` | 언어 설정, 화면 문구, 지점 기본값 |
| `store.js` | Firestore 읽기/쓰기 |
| `README-관리자.md` | 설정 및 사용 안내 |

의존성은 Firebase JS SDK(CDN)와 Google Fonts뿐입니다. 빌드 과정이 없어 정적 호스팅에 그대로 올리면 됩니다.

## 데이터

지점 내용은 Firestore `profile/config` 문서 한 곳에 저장됩니다.
Firestore에 연결하지 못하면 `data.js`의 기본값으로 화면을 그리므로 페이지가 비어 보이는 일은 없습니다.

`store.js`의 Firebase 설정값은 브라우저에 노출되는 공개 식별자입니다.
실제 접근 통제는 Firestore 보안 규칙이 담당합니다 — 설정 방법은 `README-관리자.md` 참고.

## 국기 이미지

언어 선택기는 상위 폴더의 `../images/flag-*.png` 를 사용합니다.
이 저장소만 따로 배포할 경우 해당 이미지를 함께 옮기거나 `data.js`의 `LANGS` 경로를 수정하세요.
이미지가 없어도 국가 코드(EN, JP …)로 정상 동작합니다.
