# 인플루언서 시딩 보드 (관리자용)

배송형 인플루언서 시딩을 관리하는 Firebase 연동 대시보드입니다.
방문형 체험단(`visitors`)과 분리된 `seeding` 컬렉션을 사용하며, 로그인한 관리자만 접근할 수 있습니다.

## 파일 구성

| 파일 | 역할 |
|------|------|
| `index.html` | 화면 구조 (로그인 게이트 + 보드/리스트) |
| `styles.css` | 스타일 |
| `app.js` | 로직 — 인증, Firestore 실시간 동기화, CRUD |
| `firebase-config.js` | Firebase 설정값 + 컬렉션 이름 |
| `firestore.rules` | 보안 규칙 (콘솔에 붙여넣어야 함) |

---

## 설치 순서 (3단계)

### 1. Authentication 켜기 + 관리자 계정 만들기
Firebase 콘솔 → **Authentication** → 시작하기 → **로그인 방법** 탭
→ **이메일/비밀번호** 사용 설정(enable).
그다음 **Users** 탭 → **사용자 추가**로 본인 이메일/비밀번호를 등록하세요.
이 계정으로 로그인합니다. (앱에는 회원가입 기능을 일부러 넣지 않았습니다 — 관리자만 콘솔에서 추가)

### 2. 보안 규칙 게시
Firebase 콘솔 → **Firestore Database** → **규칙** 탭
→ `firestore.rules` 내용을 붙여넣고 **게시**.

> ⚠️ 중요: 규칙 안에 `tasks` 컬렉션 규칙이 없습니다.
> 현재 `tasks`도 쓰고 계신다면, 규칙 마지막의 전체 차단(`/{document=**}`) 때문에
> `tasks` 접근이 막힙니다. 아래처럼 `tasks` 규칙을 추가하세요(권한은 용도에 맞게 조정):
> ```
> match /tasks/{docId} {
>   allow read, write: if request.auth != null;  // 또는 기존에 쓰던 조건
> }
> ```

### 3. 파일 호스팅
네 파일(`index.html`, `styles.css`, `app.js`, `firebase-config.js`)을 같은 폴더에 두고 웹에 올립니다.
- 가장 간단: **Firebase Hosting** (`firebase deploy`)
- 또는 기존에 쓰는 호스팅의 한 경로에 업로드 (예: `/admin/`)

> 로컬에서 `file://` 로 바로 열면 로그인/Firestore가 제대로 안 될 수 있습니다.
> 반드시 `http(s)://` 로 접속하세요. (Firebase Hosting, 또는 `npx serve` 같은 로컬 서버)

---

## seeding 컬렉션 필드

문서 하나 = 인플루언서 한 명. 앱이 자동으로 만들어줍니다.

| 필드 | 타입 | 설명 |
|------|------|------|
| name | string | 이름/닉네임 |
| handle | string | @핸들 |
| platform | string | Instagram / YouTube / TikTok ... |
| sns | string | SNS 프로필 링크 |
| followers | number | 팔로워 수 |
| product | string | 보낸 제품 |
| keywords | array | 소구 키워드 |
| status | string | 대기 / 보냄 / 도착 / 수령 |
| recruitDate | string | 모집일 (YYYY-MM-DD) |
| sentDate | string | 발송일 |
| uploadDate | string | 업로드일 |
| uploaded | boolean | 업로드 완료 여부 |
| contentUrl | string | 콘텐츠 링크 |
| views, likes, conversions, cost, revenue | number | 성과·비용 |
| note | string | 메모 |
| order | number | 정렬 순서 |
| createdAt | timestamp | 생성 시각 (서버) |

`visitors` 컬렉션은 이 앱이 전혀 건드리지 않습니다.

---

## 자동 기록 동작
- 카드의 상태 배지를 눌러 **보냄**으로 바꾸면 → 발송일이 오늘로 자동 입력
- 업로드 토글을 켜면 → 업로드일이 오늘로 자동 입력
- 직접 날짜를 고치면 그 값이 우선

## 실시간 동기화
Firestore `onSnapshot`을 쓰기 때문에, PC에서 입력하면 폰 화면도 자동으로 갱신됩니다.
여러 기기·여러 관리자가 동시에 봐도 항상 같은 데이터를 봅니다.

---

## 보안 메모
`firebase-config.js`의 apiKey는 웹 클라이언트용이라 노출되어도 괜찮습니다.
실제 데이터 보호는 **보안 규칙(로그인 필수) + Authentication**이 담당합니다.
규칙을 게시하지 않으면 누구나 DB를 읽고 쓸 수 있으니, 2번 단계를 반드시 먼저 하세요.