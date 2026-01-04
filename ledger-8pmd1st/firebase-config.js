// firebase-config.js
const firebaseConfig = {
  apiKey: "AIzaSyDHENfqV16JMUBvatYvJq4F3FPvvyCWMqM",
  authDomain: "ledger-8pmd1st.firebaseapp.com",
  projectId: "ledger-8pmd1st",
  storageBucket: "ledger-8pmd1st.firebasestorage.app",
  messagingSenderId: "396567030990",
  appId: "1:396567030990:web:5ae5265c49d7800fcbf49f"
};

// 초기화
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const storage = firebase.storage();
