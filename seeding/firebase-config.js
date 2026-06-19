// ---------------------------------------------------------------------------
// Firebase 설정
// 이 apiKey는 웹 클라이언트용으로 노출되어도 되는 값입니다.
// 실제 보안은 Firestore 보안 규칙 + Authentication으로 처리합니다.
// (firestore.rules 파일 참고)
// ---------------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyDYjnMVCoV7siAWPBIlXcAmxxniFrSNlGg",
  authDomain: "todolist-db16c.firebaseapp.com",
  projectId: "todolist-db16c",
  storageBucket: "todolist-db16c.firebasestorage.app",
  messagingSenderId: "882821223652",
  appId: "1:882821223652:web:a17f286a91ebf4751488f1"
};

// 새로 만드는 관리자용 컬렉션 이름.
// visitors(방문형 체험단)와 분리된 배송형 시딩 데이터.
const SEEDING_COLLECTION = "seeding";

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();