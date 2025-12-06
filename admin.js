// admin.js (QR 즉시 다운로드 기능 추가됨)

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore, doc, setDoc, deleteDoc, collection, getDocs, getDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";
import imageCompression from "https://cdn.jsdelivr.net/npm/browser-image-compression@2.0.0/dist/browser-image-compression.mjs";

const firebaseConfig = {
    apiKey: "AIzaSyCygpc_WS2_35_8eYgdTEJwZCtNGJjHvY4",
    authDomain: "pharmacy-productlist.firebaseapp.com",
    projectId: "pharmacy-productlist",
    storageBucket: "pharmacy-productlist.firebasestorage.app",
    messagingSenderId: "409677826366",
    appId: "1:409677826366:web:dc825470ef673194e2446f"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

let allProducts = []; 

// 1. 보안 & 설정 (동일)
window.checkLogin = async function() {
    const inputPw = document.getElementById('adminPassword').value;
    const overlay = document.getElementById('loginOverlay');
    try {
        const docRef = doc(db, "settings", "admin");
        const docSnap = await getDoc(docRef);
        let dbPassword = "0000"; 
        if (docSnap.exists() && docSnap.data().password) dbPassword = docSnap.data().password;
        if (inputPw === dbPassword) { overlay.style.display = 'none'; loadProductList(); } 
        else { alert("비밀번호 불일치"); }
    } catch (e) {
        if(inputPw==="0000") { overlay.style.display='none'; loadProductList(); } else alert("오류 발생");
    }
}
window.openSettings = function() {
    document.getElementById('settingsOverlay').style.display = 'flex';
    document.getElementById('settingsAuthBox').style.display = 'block';
    document.getElementById('settingsConfigBox').style.display = 'none';
    document.getElementById('supervisorPassword').value = '';
}
window.closeSettings = function() { document.getElementById('settingsOverlay').style.display = 'none'; }
window.checkSupervisorLogin = async function() {
    const pw = document.getElementById('supervisorPassword').value;
    try {
        const docRef = doc(db, "settings", "supervisor");
        const docSnap = await getDoc(docRef);
        let superPw = "dpdlxmqbxl1*"; 
        if (docSnap.exists() && docSnap.data().password) superPw = docSnap.data().password;
        if (pw === superPw) {
            document.getElementById('settingsAuthBox').style.display = 'none';
            document.getElementById('settingsConfigBox').style.display = 'block';
            loadConfig();
        } else { alert("슈퍼바이저 비밀번호가 틀렸습니다."); }
    } catch (e) { alert("인증 오류: " + e.message); }
}
async function loadConfig() {
    try {
        const configSnap = await getDoc(doc(db, "settings", "config"));
        if(configSnap.exists() && configSnap.data().openai_key) document.getElementById('configApiKey').value = configSnap.data().openai_key;
        const adminSnap = await getDoc(doc(db, "settings", "admin"));
        if(adminSnap.exists() && adminSnap.data().password) document.getElementById('configAdminPw').value = adminSnap.data().password;
        else document.getElementById('configAdminPw').value = "0000";
    } catch(e) {}
}
window.saveSettings = async function() {
    const newKey = document.getElementById('configApiKey').value.trim();
    const newAdminPw = document.getElementById('configAdminPw').value.trim();
    if(!newAdminPw) return alert("관리자 비밀번호를 비워둘 순 없습니다.");
    try {
        await setDoc(doc(db, "settings", "config"), { openai_key: newKey }, { merge: true });
        await setDoc(doc(db, "settings", "admin"), { password: newAdminPw }, { merge: true });
        alert("✅ 모든 설정이 저장되었습니다."); closeSettings();
    } catch(e) { alert("저장 실패: " + e.message); }
}
document.getElementById('adminPassword').addEventListener("keypress", (e) => { if(e.key==="Enter") checkLogin(); });
document.getElementById('supervisorPassword').addEventListener("keypress", (e) => { if(e.key==="Enter") checkSupervisorLogin(); });


// 2. AI 번역 (동일)
window.translateContent = async function() {
    const krDesc = document.getElementById('desc_kr').value;
    const btn = document.querySelector('.ai-btn');
    if(!krDesc) return alert("한국어 설명을 먼저 작성해주세요!");
    let apiKey = "";
    try { const docSnap = await getDoc(doc(db, "settings", "config")); if(docSnap.exists()) apiKey = docSnap.data().openai_key; } catch(e) {}
    if(!apiKey) return alert("❌ API Key 없음. 설정창에서 등록하세요.");

    try {
        btn.disabled = true; btn.innerText = "🤖 번역 중...";
        const prompt = `Translate this Korean text to English, Chinese(Simplified), Japanese, Thai, Vietnamese, Indonesian, Mongolian. JSON keys: en, cn, jp, th, vn, id, mn.\nText: "${krDesc}"`;
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({ model: "gpt-3.5-turbo", messages: [{ role: "user", content: prompt }], temperature: 0.3 })
        });
        const data = await res.json();
        const content = JSON.parse(data.choices[0].message.content);
        ['en','cn','jp','th','vn','id','mn'].forEach(l => document.getElementById('desc_'+l).value = content[l] || "");
        alert("✅ 번역 완료!");
    } catch (error) { alert("번역 실패"); } finally { btn.disabled = false; btn.innerText = "✨ 한국어 내용을 7개국어로 자동 번역하기"; }
}

// 3. 초기화/저장/QR (동일)
window.resetForm = function(force = false) {
    if(!force && !confirm("신규 등록 하시겠습니까?")) return;
    document.getElementById('productId').value = ''; document.getElementById('productId').disabled = false; document.getElementById('productId').style.backgroundColor = 'white';
    document.getElementById('name').value = ''; document.getElementById('price').value = '';
    document.querySelectorAll('textarea').forEach(t => t.value = '');
    document.getElementById('imageFile').value = ''; document.getElementById('preview').style.display = 'none';
    document.getElementById('qrPreview').style.display = 'none'; document.getElementById('qrPlaceholder').style.display = 'block'; document.getElementById('qrDownloadBtn').style.display = 'none';
    document.getElementById('saveBtn').innerText = "상품 및 QR 자동 저장하기";
}
async function generateAndUploadQR(productId) {
    return new Promise((resolve, reject) => {
        const container = document.getElementById('qrCodeContainer'); container.innerHTML = ''; 
        new QRCode(container, { text: `https://8pharmacy.kr/product.html?id=${productId}`, width: 500, height: 500 });
        setTimeout(async () => {
            const canvas = container.querySelector('canvas') || container.querySelector('img');
            if(!canvas) reject("QR 생성 실패");
            else {
                const blob = canvas.tagName === 'IMG' ? await (await fetch(canvas.src)).blob() : await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.9));
                const refS = ref(storage, 'products/' + productId + '_qr.jpg');
                await uploadBytes(refS, blob); resolve(await getDownloadURL(refS));
            }
        }, 500);
    });
}
window.saveProduct = async function() {
    const btn = document.getElementById('saveBtn'); const id = document.getElementById('productId').value.trim(); const name = document.getElementById('name').value;
    if(!id || !name) return alert("ID와 상품명 필수");
    try {
        btn.disabled = true; btn.innerText = "⏳ 저장 중...";
        let imageUrl = "", qrImageUrl = "";
        const fileInput = document.getElementById('imageFile');
        if (fileInput.files.length > 0) {
            let file = fileInput.files[0];
            try { file = await imageCompression(file, { maxSizeMB: 0.5, maxWidthOrHeight: 1200 }); } catch (e) {}
            const refImg = ref(storage, 'products/' + id + '.jpg'); await uploadBytes(refImg, file); imageUrl = await getDownloadURL(refImg);
        }
        if (document.getElementById('qrPreview').style.display === 'none') { try { qrImageUrl = await generateAndUploadQR(id); } catch(e){} }
        
        const data = { name, price: Number(document.getElementById('price').value), updatedAt: new Date() };
        ['kr','en','cn','jp','th','vn','id','mn'].forEach(l => data['desc_'+l] = document.getElementById('desc_'+l).value);
        if(imageUrl) data.image = imageUrl; if(qrImageUrl) data.qrImage = qrImageUrl;

        await setDoc(doc(db, "products", id), data, { merge: true });
        alert("✅ 저장 완료!"); window.resetForm(true); loadProductList();
    } catch (e) { alert("오류: " + e.message); } finally { btn.disabled = false; btn.innerText = "상품 및 QR 자동 저장하기"; }
}

// 4. ✨ [추가] 이미지 다운로드 헬퍼 함수
window.downloadQR = async function(url, filename) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (error) {
        console.error("다운로드 실패", error);
        window.open(url, '_blank'); // 실패 시 새 창으로 열기
    }
}

// 5. 목록 조회 (✨ 뱃지 클릭 시 다운로드 연결)
window.loadProductList = async function() {
    const list = document.getElementById('productList'); list.innerHTML = '<p style="text-align:center;">로딩 중...</p>';
    try {
        const q = await getDocs(collection(db, "products"));
        allProducts = []; q.forEach(doc => allProducts.push({id: doc.id, ...doc.data()}));
        renderProductList(allProducts);
    } catch (e) { list.innerHTML = '로드 실패'; }
}

function renderProductList(products) {
    const list = document.getElementById('productList');
    if (products.length === 0) { list.innerHTML = '<p style="text-align:center; padding:20px;">검색 결과 없음</p>'; return; }
    
    let html = '';
    products.forEach((item) => {
        const img = item.image || 'https://via.placeholder.com/60';
        
        // ✨ [핵심] 클릭하면 다운로드되는 뱃지
        const qrBadge = item.qrImage 
            ? `<span class="badge-qr-on" onclick="downloadQR('${item.qrImage}', '${item.id}_qr.jpg')" title="클릭하여 다운로드">✅QR받기</span>` 
            : '<span class="badge-qr-off">⬜미등록</span>';

        const viewCount = item.views ? item.views : 0;

        html += `
            <div class="product-item">
                <img src="${img}" class="item-img">
                <div class="item-info">
                    <div class="item-title">
                        <span class="badge-id">${item.id}</span> 
                        ${item.name} 
                        ${qrBadge}
                        <span class="badge-view">👁️ ${viewCount}</span>
                    </div>
                    <div class="item-price">${Number(item.price).toLocaleString()}원</div>
                </div>
                <div class="btn-group">
                    <button class="btn-small btn-view" onclick="window.open('product.html?id=${item.id}')">확인</button>
                    <button class="btn-small btn-edit" onclick="editProduct('${item.id}')">수정</button>
                    <button class="btn-small btn-delete" onclick="deleteProduct('${item.id}')">삭제</button>
                </div>
            </div>`;
    });
    list.innerHTML = html;
}

// 검색/삭제/수정 (동일)
const searchInput = document.getElementById('searchInput');
if(searchInput) {
    searchInput.addEventListener('keyup', function() {
        const k = this.value.toLowerCase().trim();
        renderProductList(allProducts.filter(i => i.name.toLowerCase().includes(k) || i.id.toLowerCase().includes(k)));
    });
}
window.deleteProduct = async function(id) { if(confirm('삭제하시겠습니까?')) { await deleteDoc(doc(db, "products", id)); alert('삭제됨'); loadProductList(); } }
window.editProduct = async function(id) {
    const d = await getDoc(doc(db, "products", id));
    if(d.exists()) {
        const data = d.data();
        document.getElementById('productId').value = id; document.getElementById('productId').disabled = true; document.getElementById('productId').style.backgroundColor = '#e0e0e0';
        document.getElementById('name').value = data.name; document.getElementById('price').value = data.price;
        ['kr','en','cn','jp','th','vn','id','mn'].forEach(l => document.getElementById('desc_'+l).value = data['desc_'+l] || '');
        if(data.image) { document.getElementById('preview').src = data.image; document.getElementById('preview').style.display = 'block'; }
        if(data.qrImage) {
            document.getElementById('qrPreview').src = data.qrImage; document.getElementById('qrPreview').style.display = 'block'; document.getElementById('qrPlaceholder').style.display = 'none';
            const btn = document.getElementById('qrDownloadBtn'); btn.href = data.qrImage; btn.download = id + '_qr.jpg'; btn.style.display = 'inline-block';
        }
        document.getElementById('saveBtn').innerText = "수정 저장하기"; window.scrollTo(0,0);
    }
}
document.getElementById('imageFile').addEventListener('change', e => { if(e.target.files[0]) { const r = new FileReader(); r.onload = ev => { document.getElementById('preview').src = ev.target.result; document.getElementById('preview').style.display='block'; }; r.readAsDataURL(e.target.files[0]); } });