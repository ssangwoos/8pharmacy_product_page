// firebase-config.js
const firebaseConfig = {
  apiKey: "AIzaSyACOqns4PnakUaowOC107czAkNUsvvVhLA",
  authDomain: "ledger-aewol.firebaseapp.com",
  projectId: "ledger-aewol",
  storageBucket: "ledger-aewol.firebasestorage.app",
  messagingSenderId: "1085469734295",
  appId: "1:1085469734295:web:0dbdfd0d675321686300d2"
};

// 초기화
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const storage = firebase.storage();