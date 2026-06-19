// ---------------------------------------------------------------------------
// Firebase 설정 (마케터 페이지)
// 이 apiKey는 웹 클라이언트용으로 노출되어도 되는 값입니다.
// 실제 보안은 Firestore 보안 규칙 + Authentication으로 처리합니다.
// ---------------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyDYjnMVCoV7siAWPBIlXcAmxxniFrSNlGg",
  authDomain: "todolist-db16c.firebaseapp.com",
  projectId: "todolist-db16c",
  storageBucket: "todolist-db16c.firebasestorage.app",
  messagingSenderId: "882821223652",
  appId: "1:882821223652:web:a17f286a91ebf4751488f1"
};

// 방문관리 페이지와 공유하는 컬렉션. 마케터 등록분도 여기에 들어갑니다.
const VISITORS_COLLECTION = "visitors";

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();