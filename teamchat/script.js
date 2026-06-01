import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, deleteDoc, query, orderBy, onSnapshot, serverTimestamp, where, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// ⚠️ 본인의 Firebase 웹 앱 설정 값으로 반드시 변경하세요!
const firebaseConfig = {
  apiKey: "AIzaSyCUqV3NCRuPS_1s5yKXoeNF2IZQWpOtvQU",
  authDomain: "teamchat-d623c.firebaseapp.com",
  projectId: "teamchat-d623c",
  storageBucket: "teamchat-d623c.firebasestorage.app",
  messagingSenderId: "699718942268",
  appId: "1:699718942268:web:2e99e744d122bb15c58d39"
};


const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

let myStoreId = "";       
let myStoreName = "";     
let targetStoreId = "";   
let currentRoomId = "";   
let unsubscribeChat = null; 
let unsubscribeGlobalNotifications = null; // 전역 알림 구독 해제용
let globalStores = {};    

const appBootTime = new Date(); // 과거 메시지 알림 폭탄 방지용 기준선

// [최초 1회 실행용] 초기 데이터 셋업
async function seedInitialStores() {
    const adminDoc = await getDoc(doc(db, "stores", "admin"));
    if (!adminDoc.exists()) {
        await setDoc(doc(db, "stores", "admin"), { name: "관리자", password: "admin123", role: "admin", createdAt: Date.now() });
        await setDoc(doc(db, "stores", "store_A"), { name: "매장A", password: "storea123", role: "store", createdAt: Date.now() });
        await setDoc(doc(db, "stores", "store_B"), { name: "매장B", password: "storeb123", role: "store", createdAt: Date.now() });
    }
}

// 매장 정보 실시간 모니터링
function listenStoresData() {
    onSnapshot(collection(db, "stores"), (snapshot) => {
        const loginParent = document.getElementById('login-buttons-parent');
        loginParent.innerHTML = '';
        globalStores = {};

        snapshot.forEach((docSnap) => {
            const id = docSnap.id;
            const data = docSnap.data();
            globalStores[id] = data;

            const loginBtn = document.createElement('button');
            loginBtn.className = 'store-btn';
            loginBtn.innerText = id === 'admin' ? `👑 ${data.name}` : `🏬 ${data.name}`;
            loginBtn.addEventListener('click', () => tryLogin(id, data.password, data.name));
            loginParent.appendChild(loginBtn);
        });

        if (myStoreId) renderSidebarAndAdmin();
    });
}

// 매장 친구목록 및 제어판 UI 렌더링
function renderSidebarAndAdmin() {
    const sidebarUl = document.getElementById('member-list');
    const adminTableBody = document.getElementById('admin-store-list');
    
    sidebarUl.innerHTML = '';
    if (adminTableBody) adminTableBody.innerHTML = '';

    Object.keys(globalStores).forEach((id) => {
        const data = globalStores[id];
        if (id === myStoreId) myStoreName = data.name;

        if (id !== myStoreId) {
            const li = document.createElement('li');
            li.className = 'member-item';
            li.setAttribute('data-id', id);
            if (id === targetStoreId) li.classList.add('active');
            li.innerText = id === 'admin' ? `👑 ${data.name}` : `🏪 ${data.name}`;
            li.addEventListener('click', () => selectTarget(id, data.name));
            sidebarUl.appendChild(li);
        }

        if (myStoreId === 'admin' && id !== 'admin' && adminTableBody) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input type="text" value="${data.name}" id="edit-name-${id}" style="padding:6px; border:1px solid #d1d3e2; border-radius:4px;"></td>
                <td>
                    <div class="table-input-group">
                        <input type="text" value="${data.password}" id="edit-pw-${id}">
                        <button class="btn-save" data-id="${id}">수정</button>
                    </div>
                </td>
                <td><button class="btn-delete" data-id="${id}">삭제</button></td>
            `;
            tr.querySelector('.btn-save').addEventListener('click', () => updateStore(id));
            tr.querySelector('.btn-delete').addEventListener('click', () => deleteStore(id));
            adminTableBody.appendChild(tr);
        }
    });
}

// 로그인 핸들러 및 알림 활성화
function tryLogin(storeId, correctPassword, storeName) {
    const password = prompt(`[${storeName}]의 비밀번호를 입력하세요:`);
    if (password === null) return;

    if (password === correctPassword) {
        myStoreId = storeId;
        myStoreName = storeName;
        
        document.getElementById('login-container').style.display = 'none';
        document.getElementById('main-container').style.display = 'flex';
        
        if (myStoreId === 'admin') {
            document.getElementById('btn-admin-panel').style.display = 'inline-block';
        }
        
        renderSidebarAndAdmin();
        selectTarget("", ""); 
        
        // 로그인 즉시 전역 백그라운드 메시지 알림 시스템 가동
        startNotificationEngine();
    } else {
        alert("비밀번호가 올바르지 않습니다.");
    }
}

// 로그아웃
function logout() {
    if(unsubscribeChat) unsubscribeChat();
    if(unsubscribeGlobalNotifications) unsubscribeGlobalNotifications();
    myStoreId = ""; myStoreName = ""; targetStoreId = ""; currentRoomId = "";
    document.getElementById('main-container').style.display = 'none';
    document.getElementById('login-container').style.display = 'block';
    document.getElementById('btn-admin-panel').style.display = 'none';
    document.getElementById('btn-admin-panel').innerText = "⚙️ 관리자 설정";
    toggleView('none');
}

function toggleView(view) {
    document.getElementById('no-chat-view').style.display = view === 'none' ? 'flex' : 'none';
    document.getElementById('chat-view').style.display = view === 'chat' ? 'flex' : 'none';
    document.getElementById('admin-view').style.display = view === 'admin' ? 'flex' : 'none';
    if (view !== 'chat') targetStoreId = "";
}

// 대상 변경 및 자동 읽음 업데이트
function selectTarget(storeId, storeName) {
    if (!storeId) {
        document.getElementById('view-title').innerText = `🏬 접속매장: [${myStoreName}]`;
        toggleView('none');
        return;
    }
    
    targetStoreId = storeId;
    document.getElementById('view-title').innerText = `💬 [${myStoreName}] ➔ [${storeName}] 대화방`;
    document.getElementById('btn-admin-panel').innerText = "⚙️ 관리자 설정";
    toggleView('chat');

    document.querySelectorAll('.member-item').forEach(el => {
        if(el.getAttribute('data-id') === storeId) el.classList.add('active');
        else el.classList.remove('active');
    });

    currentRoomId = [myStoreId, targetStoreId].sort().join('_');

    if (unsubscribeChat) unsubscribeChat();
    loadChatMessages();
}

// 메시지 전송 로직 (읽음 유무 속성 추가)
async function sendMessage() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text || !currentRoomId) return;
    input.value = '';
    
    await addDoc(collection(db, "messages"), { 
        roomId: currentRoomId, 
        sender: myStoreId, 
        type: "text", 
        content: text, 
        isRead: false, // 전송 초기값은 안읽음(false)
        timestamp: serverTimestamp() 
    });
}

// 대화 내역 렌더링 + 읽음 실시간 전환 스위치[cite: 2]
function loadChatMessages() {
    const q = query(collection(db, "messages"), where("roomId", "==", currentRoomId), orderBy("timestamp", "asc"));
    
    unsubscribeChat = onSnapshot(q, (snapshot) => {
        const chatMessages = document.getElementById('chat-messages');
        chatMessages.innerHTML = '';
        
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const msgId = docSnap.id;
            const isMine = data.sender === myStoreId;

            // 방이 열려있는 동안 상대방이 보낸 안읽은 글을 실시간 '읽음' 처리
            if (!isMine && data.isRead === false) {
                updateDoc(doc(db, "messages", msgId), { isRead: true });
            }

            // 메시지 로우 껍데기 생성
            const row = document.createElement('div');
            row.className = `message-row ${isMine ? 'mine' : 'others'}`;

            // 1. 프로필 이니셜 아이콘 배치
            const senderName = globalStores[data.sender]?.name || data.sender;
            const avatar = document.createElement('div');
            avatar.className = 'msg-avatar';
            avatar.innerText = senderName.substring(0, 2); // 이름 앞 두 글자 추출

            // 2. 바디 감싸기
            const bodyFlow = document.createElement('div');
            bodyFlow.className = 'msg-body-flow';
            
            if(!isMine) {
                const nameLabel = document.createElement('span');
                nameLabel.className = 'msg-sender-name';
                nameLabel.innerText = senderName;
                bodyFlow.appendChild(nameLabel);
            }

            // 3. 말풍선 및 메타데이터 결합
            const bubbleAndMeta = document.createElement('div');
            bubbleAndMeta.className = 'bubble-and-meta';

            const bubble = document.createElement('div');
            bubble.className = `message ${isMine ? 'mine' : 'others'}`;
            if (data.type === "image") {
                const img = document.createElement('img');
                img.src = data.content;
                img.addEventListener('click', () => window.open(data.content));
                bubble.appendChild(img);
            } else {
                bubble.innerText = data.content;
            }

            // 4. 메타박스 구성 (시간 및 숫자 1)
            const metaBox = document.createElement('div');
            metaBox.className = 'msg-meta-box';

            // 안읽었을 때만 숫자 '1' 노출
            if (data.isRead === false) {
                const readIndicator = document.createElement('span');
                readIndicator.className = 'read-status';
                readIndicator.innerText = '1';
                metaBox.appendChild(readIndicator);
            }

            // 시간 파싱
            const timeStr = data.timestamp 
                ? data.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                : "전송중";
            const timeLabel = document.createElement('span');
            timeLabel.innerText = timeStr;
            metaBox.appendChild(timeLabel);

            // 결합 후 출력
            bubbleAndMeta.appendChild(bubble);
            bubbleAndMeta.appendChild(metaBox);
            bodyFlow.appendChild(bubbleAndMeta);
            
            row.appendChild(avatar);
            row.appendChild(bodyFlow);
            chatMessages.appendChild(row);
        });
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });
}

// 🔔 전역 알림 수신 추적 엔진
function startNotificationEngine() {
    const qGlobal = query(collection(db, "messages"), orderBy("timestamp", "desc"));
    
    unsubscribeGlobalNotifications = onSnapshot(qGlobal, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                const data = change.doc.data();
                
                // 내가 속한 방이고, 내가 보낸 게 아닐 때 검사
                if (data.sender !== myStoreId && data.roomId.includes(myStoreId)) {
                    if (data.timestamp) {
                        const msgTime = data.timestamp.toDate();
                        
                        // 앱이 구동된 시점 이후의 '신규 메시지'만 통지 조건문 진입
                        if (msgTime > appBootTime) {
                            // 대화창이 닫혀있거나 브라우저 탭이 백그라운드 상태일 때 팝업 알림 발생
                            if (document.hidden || currentRoomId !== data.roomId) {
                                triggerWebNotification(data);
                            }
                        }
                    }
                }
            }
        });
    });
}

// 웹 브라우저 OS 알림 호출부
// 🎵 자바스크립트로 소리를 직접 만들어 연주하는 사운드 함수 (파일 불필요)
// 🎵 [수정] 볼륨을 5배 키우고 주파수를 다듬은 맑고 우렁찬 벨소리 엔진
function playNotificationSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        const playTone = (frequency, startTime, duration) => {
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(frequency, startTime);
            
            // ★ 기존 0.15에서 0.75로 게인(볼륨) 값을 정확히 5배 증폭!
            gainNode.gain.setValueAtTime(0.75, startTime); 
            gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
            
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            oscillator.start(startTime);
            oscillator.stop(startTime + duration);
        };
        
        const now = audioCtx.currentTime;
        // 딩~ 동~ 소리가 더 웅장하고 깔끔하게 울리도록 주파수 상향 조정
        playTone(587.33, now, 0.15);       // D5 (레)
        playTone(880.00, now + 0.10, 0.35); // A5 (라)
    } catch (e) {
        console.error("오디오 재생 실패:", e);
    }
}

// 🎈 [신규 추가] 화면 왼쪽 하단에 풍선 팝업을 직접 띄워주는 함수
function showToastPopup(data) {
    const senderName = globalStores[data.sender]?.name || data.sender;
    const bodyContent = data.type === 'image' ? '📷 사진을 보냈습니다.' : data.content;

    // 이미 떠 있는 풍선 팝업이 있다면 지우고 새로 생성
    const oldToast = document.querySelector('.toast-popup');
    if (oldToast) oldToast.remove();

    // 풍선 팝업 엘리먼트 생성
    const toast = document.createElement('div');
    toast.className = 'toast-popup';
    toast.innerHTML = `
        <div class="toast-header">📩 [${senderName}] 새 메시지</div>
        <div class="toast-body">${bodyContent}</div>
    `;
    
    // 이 풍선 팝업을 클릭하면, 보낸 매장의 대화방으로 즉시 화면 전환!
    toast.addEventListener('click', () => {
        selectTarget(data.sender, senderName);
        toast.remove();
    });

    document.body.appendChild(toast);

    // 5초 뒤에 화면에서 완전히 요소 삭제
    setTimeout(() => {
        if (toast.parentNode) toast.remove();
    }, 5000);
}

// 웹 브라우저 OS 알림 및 사운드/풍선 통합 트리거
// 웹 브라우저 OS 알림 및 사운드/풍선 통합 트리거 (최상단 무한고정 버전)
function triggerWebNotification(data) {
    const senderName = globalStores[data.sender]?.name || data.sender;
    const bodyContent = data.type === 'image' ? '📷 사진을 보냈습니다.' : data.content;

    // 1. ★ OS 자체 알림창 발송 (크롬이 최소화되어 있어도 모니터 최상단에 뜸)
    if (Notification.permission === "granted") {
        const notification = new Notification(`📩 [${senderName}] 새 메시지`, {
            body: bodyContent,
            icon: "https://cdn-icons-png.flaticon.com/512/5962/5962463.png",
            
            // 🚨 [핵심] 사용자가 직접 닫거나 클릭하기 전까지 알림이 화면에서 절대 안 사라짐!
            requireInteraction: true 
        });

        // 사용자가 이 최상단 OS 알림창을 클릭하면 해당 매장 대화방으로 즉시 이동하는 기능
        notification.onclick = function() {
            window.focus(); // 크롬 창을 맨 앞으로 강제 소환
            selectTarget(data.sender, senderName);
            notification.close();
        };
    }

    // 2. 웅장한 사운드 연주
    playNotificationSound();

    // 3. 브라우저 내부용 풍선 팝업도 함께 노출 (크롬 창을 열었을 때 한 번 더 인지용)
    showToastPopup(data);
}

// [관리자 설정 제어용 내부 모듈 함수들]
async function updateAdminProps() {
    const newPw = document.getElementById('admin-new-pw').value.trim();
    if(!newPw) return alert("새 비밀번호를 입력하세요.");
    await updateDoc(doc(db, "stores", "admin"), { password: newPw });
    document.getElementById('admin-new-pw').value = '';
    alert("관리자 비밀번호가 수정되었습니다.");
}

async function addStore() {
    const nameInput = document.getElementById('new-store-name');
    const pwInput = document.getElementById('new-store-pw');
    const name = nameInput.value.trim(); const pw = pwInput.value.trim();
    if (!name || !pw) return alert("매장명과 비밀번호를 모두 입력하세요.");
    const newStoreId = "store_" + Date.now();
    await setDoc(doc(db, "stores", newStoreId), { name: name, password: pw, role: "store", createdAt: Date.now() });
    nameInput.value = ''; pwInput.value = '';
    alert(`[${name}] 매장이 추가되었습니다.`);
}

async function updateStore(id) {
    const updatedName = document.getElementById(`edit-name-${id}`).value.trim();
    const updatedPw = document.getElementById(`edit-pw-${id}`).value.trim();
    if (!updatedName || !updatedPw) return alert("빈칸 수정 불가");
    await updateDoc(doc(db, "stores", id), { name: updatedName, password: updatedPw });
    alert("정보가 동기화되었습니다.");
}

async function deleteStore(id) {
    if (!confirm("해당 매장 계정을 삭제하시겠습니까?")) return;
    await deleteDoc(doc(db, "stores", id));
    alert("매장 계정이 파기되었습니다.");
}

// 초기화 연동 리스너 바인딩
document.addEventListener('DOMContentLoaded', async () => {
    // 최초 브라우저 푸시 권한 획득 처리
    if (Notification.permission === "default") {
        Notification.requestPermission();
    }

    await seedInitialStores(); 
    listenStoresData();       

    document.getElementById('btn-logout').addEventListener('click', logout);
    document.getElementById('btn-send').addEventListener('click', sendMessage);
    document.getElementById('msg-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
    document.getElementById('btn-update-admin-pw').addEventListener('click', updateAdminProps);
    document.getElementById('btn-add-store').addEventListener('click', addStore);
    
    document.getElementById('btn-admin-panel').addEventListener('click', (e) => {
        const btn = e.target;
        if (document.getElementById('admin-view').style.display === 'none') {
            document.getElementById('view-title').innerText = "👑 전사 매장 통합 관리자 모드";
            btn.innerText = "💬 채팅창으로 복귀";
            toggleView('admin');
        } else {
            selectTarget("", "");
        }
    });

    document.getElementById('btn-file-trigger').addEventListener('click', () => document.getElementById('image-input').click());
    document.getElementById('image-input').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file || !currentRoomId) return;
        const storageRef = ref(storage, `chat_files/${Date.now()}_${file.name}`);
        try {
            alert("이미지를 안전하게 전송 중입니다...");
            const snapshot = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);
            await addDoc(collection(db, "messages"), { roomId: currentRoomId, sender: myStoreId, type: "image", content: downloadURL, isRead: false, timestamp: serverTimestamp() });
            e.target.value = '';
        } catch (error) { alert("이미지 전송 실패"); }
    });
});

function downloadExistingBatFile() {
    // 1. 선택된 파일명 가져오기 (예: run_1호점.bat)
    const fileName = document.getElementById('staticStoreSelect').value;
    
    // 2. [보안 우회 핵심] 브라우저가 'fake 클릭'으로 오해하지 못하도록 다이렉트 주소 이동 명령을 내립니다.
    // .bat 파일은 웹 브라우저가 화면에 띄울 수 없는 파일이기 때문에, 이 명령을 받으면 무조건 다운로드 창을 켭니다.
    window.location.href = fileName;
}