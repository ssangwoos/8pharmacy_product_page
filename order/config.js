/* ==========================================================================
   [설정] 약국별 고유 설정 파일 (이 파일만 수정해서 배포하세요)
   ========================================================================== */

// 1. 약국 식별자 (ID)
// - 본점(기존 데이터 주인): "main" (절대 바꾸지 마세요!)
// - 지점(새로운 약국): "pharmacy_b", "pharmacy_c" 등으로 영어로 변경
export const SHOP_ID = "main"; 

// 2. 약국 표시 이름 (화면 왼쪽 상단에 뜸)
export const SHOP_NAME = "에이트약국"; // 지점은 "비트약국" 등으로 변경
export const MANAGER_NAME = "배상우"; // <-- 추가

// 3. Firebase 키값 (모든 약국이 공유)
export const firebaseConfig = {
    apiKey: "AIzaSyA250TRzQCM9FMqiXBROX3IknKE1FZp5rc", 
    authDomain: "pharmacy-order-5ddc5.firebaseapp.com",
    projectId: "pharmacy-order-5ddc5",
    storageBucket: "pharmacy-order-5ddc5.firebasestorage.app", 
    messagingSenderId: "713414389922",
    appId: "1:713414389922:web:606452de8b27fe847ca7fb"
};