import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, deleteDoc, query, orderBy, onSnapshot, serverTimestamp, where, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
// 🚨 실시간 업로드 추적을 위해 uploadBytesResumable 엔진으로 교체 수입했습니다.
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

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
let unsubscribeGlobalNotifications = null; 
let globalStores = {};    

const appBootTime = new Date(); 

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

// 메시지 전송 로직
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
        isRead: false, 
        timestamp: serverTimestamp() 
    });
}

// 대화 내역 렌더링 + 읽음 실시간 전환 스위치
function loadChatMessages() {
    const q = query(collection(db, "messages"), where("roomId", "==", currentRoomId), orderBy("timestamp", "asc"));
    
    unsubscribeChat = onSnapshot(q, (snapshot) => {
        const chatMessages = document.getElementById('chat-messages');
        chatMessages.innerHTML = '';
        
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const msgId = docSnap.id;
            const isMine = data.sender === myStoreId;

            if (!isMine && data.isRead === false) {
                updateDoc(doc(db, "messages", msgId), { isRead: true });
            }

            const row = document.createElement('div');
            row.className = `message-row ${isMine ? 'mine' : 'others'}`;

            const senderName = globalStores[data.sender]?.name || data.sender;
            const avatar = document.createElement('div');
            avatar.className = 'msg-avatar';
            avatar.innerText = senderName.substring(0, 2); 

            const bodyFlow = document.createElement('div');
            bodyFlow.className = 'msg-body-flow';
            
            if(!isMine) {
                const nameLabel = document.createElement('span');
                nameLabel.className = 'msg-sender-name';
                nameLabel.innerText = senderName;
                bodyFlow.appendChild(nameLabel);
            }

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

            const metaBox = document.createElement('div');
            metaBox.className = 'msg-meta-box';

            if (data.isRead === false) {
                const readIndicator = document.createElement('span');
                readIndicator.className = 'read-status';
                readIndicator.innerText = '1';
                metaBox.appendChild(readIndicator);
            }

            const timeStr = data.timestamp 
                ? data.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                : "전송중";
            const timeLabel = document.createElement('span');
            timeLabel.innerText = timeStr;
            metaBox.appendChild(timeLabel);

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
                if (data.sender !== myStoreId && data.roomId.includes(myStoreId)) {
                    if (data.timestamp) {
                        const msgTime = data.timestamp.toDate();
                        if (msgTime > appBootTime) {
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

// 사운드 함수
function playNotificationSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const playTone = (frequency, startTime, duration) => {
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            oscizer = oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(frequency, startTime);
            gainNode.gain.setValueAtTime(0.75, startTime); 
            gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            oscillator.start(startTime);
            oscillator.stop(startTime + duration);
        };
        const now = audioCtx.currentTime;
        playTone(587.33, now, 0.15);       
        playTone(880.00, now + 0.10, 0.35); 
    } catch (e) { console.error(e); }
}

// 풍선 팝업
function showToastPopup(data) {
    const senderName = globalStores[data.sender]?.name || data.sender;
    const bodyContent = data.type === 'image' ? '📷 사진을 보냈습니다.' : data.content;
    const oldToast = document.querySelector('.toast-popup');
    if (oldToast) oldToast.remove();
    const toast = document.createElement('div');
    toast.className = 'toast-popup';
    toast.innerHTML = `<div class="toast-header">📩 [${senderName}] 새 메시지</div><div class="toast-body">${bodyContent}</div>`;
    toast.addEventListener('click', () => { selectTarget(data.sender, senderName); toast.remove(); });
    document.body.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 5000);
}

// 통합 트리거
function triggerWebNotification(data) {
    const senderName = globalStores[data.sender]?.name || data.sender;
    const bodyContent = data.type === 'image' ? '📷 사진을 보냈습니다.' : data.content;
    if (Notification.permission === "granted") {
        const notification = new Notification(`📩 [${senderName}] 새 메시지`, { body: bodyContent, icon: "https://cdn-icons-png.flaticon.com/512/5962/5962463.png", requireInteraction: true });
        notification.onclick = function() { window.focus(); selectTarget(data.sender, senderName); notification.close(); };
    }
    playNotificationSound();
    showToastPopup(data);
}

// 이미지 가상 압축 엔진 (품질을 0.6으로 조절하여 전송 속도 추가 향상)
function compressImageEngine(file, maxWidth = 1280, maxHeight = 1280, quality = 0.6) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = function (event) {
            const img = new Image();
            img.src = event.target.result;
            img.onload = function () {
                let width = img.width; let height = img.height;
                if (width > maxWidth || height > maxHeight) {
                    if (width > height) { height *= maxWidth / width; width = maxWidth; } 
                    else { width *= maxHeight / height; height = maxHeight; }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error("Compression error"));
                }, 'image/jpeg', quality);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}

// 🚨 [전면 수정] 클립보드/파일 이미지 전송 + 실시간 채팅방 퍼센트(%) 표시 엔진
async function uploadAndSendImage(file) {
    if (!file || !currentRoomId) return;
    
    const chatMessages = document.getElementById('chat-messages');
    
    // 1. 차단형 alert 제거 후, 채팅창 내부에 임시 진행바 말풍선 생성 및 강제 스크롤
    const progressRow = document.createElement('div');
    progressRow.className = 'message-row mine';
    progressRow.innerHTML = `
        <div class="msg-avatar">${(myStoreName || "나").substring(0,2)}</div>
        <div class="msg-body-flow">
            <div class="bubble-and-meta">
                <div class="message mine" style="background: #a0aec0; color: white; font-weight: bold;">
                    ⏳ 사진 업로드 중... (<span id="upload-percentage">0</span>%)
                </div>
            </div>
        </div>
    `;
    chatMessages.appendChild(progressRow);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    try {
        // 2. 고속 압축 처리 (퀄리티 0.6 세팅으로 초고속 통과)
        const compressedBlob = await compressImageEngine(file, 1280, 1280, 0.6);
        
        const baseName = (file.name || `pasted_${Date.now()}`).replace(/\.[^/.]+$/, "");
        const storageRef = ref(storage, `chat_files/${Date.now()}_${baseName}.jpg`);
        
        // 3. Resumable 전송 명령어로 업로드 실시간 스트리밍 추적 시작
        const uploadTask = uploadBytesResumable(storageRef, compressedBlob);
        
        uploadTask.on('state_changed', 
            (snapshot) => {
                // 구글 서버에 전송되는 바이트 계산 후 스팬 태그 값 갱신
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                const percentEl = document.getElementById('upload-percentage');
                if (percentEl) {
                    percentEl.innerText = Math.round(progress);
                }
            }, 
            (error) => {
                // 전송 에러 발생 시 임시 말풍선 파기
                progressRow.remove();
                alert("이미지 전송 실패");
            }, 
            async () => {
                // 전송 성공 시 주소 변환 후 임시 말풍선 삭제 및 진짜 데이터베이스 등록
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                progressRow.remove();
                
                await addDoc(collection(db, "messages"), { 
                    roomId: currentRoomId, 
                    sender: myStoreId, 
                    type: "image", 
                    content: downloadURL, 
                    isRead: false, 
                    timestamp: serverTimestamp() 
                });
            }
        );
    } catch (error) { 
        progressRow.remove();
        alert("이미지 처리 오류"); 
    }
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
    if (Notification.permission === "default") { Notification.requestPermission(); }
    await seedInitialStores(); listenStoresData();       

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
        } else { selectTarget("", ""); }
    });

    document.getElementById('btn-file-trigger').addEventListener('click', () => document.getElementById('image-input').click());
    
    document.getElementById('image-input').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) { await uploadAndSendImage(file); e.target.value = ''; }
    });

    document.getElementById('msg-input').addEventListener('paste', async (e) => {
        const clipboardData = e.clipboardData || window.shadowRoot || window.clipboardData;
        if (!clipboardData) return;
        const items = clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                e.preventDefault(); 
                const file = items[i].getAsFile();
                if (file) { await uploadAndSendImage(file); }
                break; 
            }
        }
    });
});

function downloadExistingBatFile() {
    const fileName = document.getElementById('staticStoreSelect').value;
    window.location.href = fileName;
}