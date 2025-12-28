// firebase-config.js
const firebaseConfig = {
  apiKey: "AIzaSyBcMCqu39hwSw1Osm8Kd4GS5KMTG6BEgYA",
  authDomain: "pharmacy-ledger-fbca7.firebaseapp.com",
  projectId: "pharmacy-ledger-fbca7",
  storageBucket: "pharmacy-ledger-fbca7.firebasestorage.app",
  messagingSenderId: "243652172908",
  appId: "1:243652172908:web:a801ea5d71cdfec01fcc49"
};

// 초기화
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const storage = firebase.storage();