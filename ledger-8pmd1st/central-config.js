// central-config.js
// 🧠 모든 지점이 공유하는 '중앙 AI 브레인' 연결 (허브: pharmacy-ledger-fbca7)
// - 장부·카드·설정 등은 각 지점 firebase-config.js(기본 앱)를 그대로 사용
// - AI 스캔(scanInvoice) + 제약사 학습(ai_learning: 지침·예시·정확도)만 이 중앙 허브로 모임
// - 이 파일은 모든 지점에 동일하게 넣으면 됩니다. (지점별로 안 바꿔도 됨)

const centralConfig = {
  apiKey: "AIzaSyBcMCqu39hwSw1Osm8Kd4GS5KMTG6BEgYA",
  authDomain: "pharmacy-ledger-fbca7.firebaseapp.com",
  projectId: "pharmacy-ledger-fbca7",
  storageBucket: "pharmacy-ledger-fbca7.firebasestorage.app",
  messagingSenderId: "243652172908",
  appId: "1:243652172908:web:a801ea5d71cdfec01fcc49"
};

// 'central'이라는 이름의 두 번째 Firebase 앱으로 허브에 연결 (기본 앱과 별개)
let CENTRAL_APP;
try {
  CENTRAL_APP = firebase.app('central');
} catch (e) {
  CENTRAL_APP = firebase.initializeApp(centralConfig, 'central');
}

// 중앙 Firestore (ai_learning 전용) — 장부/카드는 여기 쓰지 않음
const centralDb = CENTRAL_APP.firestore();

// 중앙 스캔 함수 호출 핸들
function centralScanFn() {
  return CENTRAL_APP.functions('us-central1').httpsCallable('scanInvoice');
}

// 학습 문서 키 정규화: 지점·표기가 달라도 같은 제약사면 한 문서로 합침
// 예: "메타에프앤비", "(주)메타에프앤비", "메타에프앤비 " → 모두 vendor_메타에프앤비
function centralVendorKey(name) {
  const n = String(name || "").toLowerCase()
    .replace(/\(주\)|\(유\)|주식회사|㈜|유한회사|합자회사/g, "")
    .replace(/[\s\-_.,·`'"()\[\]/\\]/g, "")
    .trim();
  return "vendor_" + (n || "unknown");
}
