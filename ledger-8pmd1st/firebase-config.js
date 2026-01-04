// firebase-config.js
const firebaseConfig = {
  apiKey: "AIzaSyD6gYbjdXjdwLNP4baJTxKZpqbaSFkG670",
  authDomain: "ledger-cmr8p.firebaseapp.com",
  projectId: "ledger-cmr8p",
  storageBucket: "ledger-cmr8p.firebasestorage.app",
  messagingSenderId: "556126872516",
  appId: "1:556126872516:web:2c5e1044619d5201837a91"
};

// 초기화
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const storage = firebase.storage();
