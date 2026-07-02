// admin.js (실시간 검색 고침 + ID 검색 기능 추가)

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore, doc, setDoc, updateDoc,deleteDoc, collection, getDocs, getDoc, query, where, orderBy,arrayUnion, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
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
let allLogs = [];
let currentRelatedIds = []; // 현재 선택된 연관상품 ID들을 담을 그릇
// 갤러리 항목 관리: {type:'url', url:'...'} 또는 {type:'file', file:File, dataUrl:'...(미리보기용)'}
let currentGallery = [];
const DEFAULT_LAYOUT = { 
    prod_x: 100, prod_y: 200, prod_w: 1000, prod_h: 850, prod_scale: 1.0,
    qr_x: 1511, qr_y: 220, qr_size: 400, 
    price_x: 1711, price_y: 670, price_size: 170 
};

// 1. 보안 & 설정
window.checkLogin = async function() {
    const inputPw = document.getElementById('adminPassword').value;
    const overlay = document.getElementById('loginOverlay');
    if(!inputPw) return alert("비밀번호 입력");
    try {
        const adminSnap = await getDoc(doc(db, "settings", "admin"));
        let adminPw = null; if (adminSnap.exists()) adminPw = adminSnap.data().password;
        const superSnap = await getDoc(doc(db, "settings", "supervisor"));
        let superPw = null; if (superSnap.exists()) superPw = superSnap.data().password;
        if ((adminPw && inputPw === adminPw) || (superPw && inputPw === superPw)) { overlay.style.display = 'none'; loadProductList(); } 
        else { alert("비밀번호 불일치"); }
    } catch (e) { alert("로그인 오류: " + e.message); }
}
window.openSettings = function() { document.getElementById('settingsOverlay').style.display = 'flex'; document.getElementById('settingsAuthBox').style.display = 'block'; document.getElementById('settingsConfigBox').style.display = 'none'; document.getElementById('supervisorPassword').value = ''; }
window.closeSettings = function() { document.getElementById('settingsOverlay').style.display = 'none'; }
window.checkSupervisorLogin = async function() {
    const pw = document.getElementById('supervisorPassword').value;
    try {
        const docRef = doc(db, "settings", "supervisor"); const docSnap = await getDoc(docRef); let superPw = null; if (docSnap.exists()) superPw = docSnap.data().password;
        if (superPw && pw === superPw) { document.getElementById('settingsAuthBox').style.display = 'none'; document.getElementById('settingsConfigBox').style.display = 'block'; loadConfig(); } 
        else { alert("비밀번호 오류"); }
    } catch (e) { alert("인증 오류"); }
}
async function loadConfig() {
    try {
        const configSnap = await getDoc(doc(db, "settings", "config"));
        let layout = { ...DEFAULT_LAYOUT }; let apiKey = ""; let bgImage = ""; let refundRate="6.0";
        if(configSnap.exists()) {
            const data = configSnap.data();
            if(data.openai_key) apiKey = data.openai_key;
            if(data.bgImage) bgImage = data.bgImage;
            if(data.refund_rate) refundRate = data.refund_rate;
            if(data.layout) Object.keys(data.layout).forEach(key => { if(data.layout[key]!==undefined) layout[key] = data.layout[key]; });
        }
        document.getElementById('configApiKey').value = apiKey;
        document.getElementById('configRefundRate').value = refundRate;
        const bgStatus = document.getElementById('bgStatus');
        if(bgImage) { bgStatus.innerText = "✅ 배경 등록됨"; bgStatus.style.color = "green"; } else { bgStatus.innerText = "❌ 배경 없음"; bgStatus.style.color = "red"; }
        document.getElementById('layout_prod_x').value = layout.prod_x; document.getElementById('layout_prod_y').value = layout.prod_y;
        document.getElementById('layout_prod_w').value = layout.prod_w; document.getElementById('layout_prod_h').value = layout.prod_h;
        document.getElementById('layout_prod_scale').value = layout.prod_scale;
        document.getElementById('layout_qr_x').value = layout.qr_x; document.getElementById('layout_qr_y').value = layout.qr_y; document.getElementById('layout_qr_size').value = layout.qr_size;
        document.getElementById('layout_price_x').value = layout.price_x; document.getElementById('layout_price_y').value = layout.price_y; document.getElementById('layout_price_size').value = layout.price_size;
    } catch(e) {}
    try { const adminSnap = await getDoc(doc(db, "settings", "admin")); if(adminSnap.exists()) document.getElementById('configAdminPw').value = adminSnap.data().password; } catch(e) {}
}
window.saveSettings = async function() {
    const newKey = document.getElementById('configApiKey').value.trim(); const newRate = document.getElementById('configRefundRate').value.trim(); const newAdminPw = document.getElementById('configAdminPw').value.trim(); const bgFile = document.getElementById('bgFileInput').files[0];
    if(!newAdminPw) return alert("관리자 비번 필수");
    try {
        const configData = { openai_key: newKey, refund_rate: newRate };
        if(bgFile) { const bgRef = ref(storage, 'settings/pricetag_bg.jpg'); await uploadBytes(bgRef, bgFile); configData.bgImage = await getDownloadURL(bgRef); }
        const layout = {
            prod_x: Number(document.getElementById('layout_prod_x').value), prod_y: Number(document.getElementById('layout_prod_y').value),
            prod_w: Number(document.getElementById('layout_prod_w').value), prod_h: Number(document.getElementById('layout_prod_h').value), prod_scale: Number(document.getElementById('layout_prod_scale').value) || 1.0,
            qr_x: Number(document.getElementById('layout_qr_x').value), qr_y: Number(document.getElementById('layout_qr_y').value), qr_size: Number(document.getElementById('layout_qr_size').value),
            price_x: Number(document.getElementById('layout_price_x').value), price_y: Number(document.getElementById('layout_price_y').value), price_size: Number(document.getElementById('layout_price_size').value)
        };
        configData.layout = layout;
        await setDoc(doc(db, "settings", "config"), configData, { merge: true }); await setDoc(doc(db, "settings", "admin"), { password: newAdminPw }, { merge: true });
        alert("✅ 설정 저장 완료"); closeSettings();
    } catch(e) { alert("저장 실패: " + e.message); }
}
document.getElementById('adminPassword').addEventListener("keypress", (e) => { if(e.key==="Enter") checkLogin(); });
document.getElementById('supervisorPassword').addEventListener("keypress", (e) => { if(e.key==="Enter") checkSupervisorLogin(); });

// 2. AI & QR & 저장
// admin.js 의 translateContent 함수 교체

window.translateContent = async function() {
    const krDesc = document.getElementById('desc_kr').value;
    const btn = document.querySelector('.ai-btn');

    if(!krDesc) return alert("한국어 설명을 먼저 작성해주세요!");

    let apiKey = "";
    try { const docSnap = await getDoc(doc(db, "settings", "config")); if(docSnap.exists()) apiKey = docSnap.data().openai_key; } catch(e) {}

    if(!apiKey) return alert("❌ API Key가 없습니다. 설정에서 등록해주세요.");

    try {
        btn.disabled = true;
        btn.innerText = "🤖 GPT-4o가 완벽하게 번역 중...";

        const prompt = `
            Role: Professional Medical Translator.
            Task: Translate Korean text to English, Simplified Chinese, Traditional Chinese(Taiwan), Japanese, Thai, Vietnamese, Indonesian, Mongolian.
            
            IMPORTANT: 
            - Use friendly and professional pharmacy tone.
            - Handle special characters (quotes, brackets) correctly in JSON.
            - Output MUST be valid JSON.
            - "cn" is Simplified Chinese (Mainland China). "tw" is Traditional Chinese (Taiwan). They MUST be different scripts.
            
            JSON keys: en, cn, tw, jp, th, vn, id, mn.
            
            Source Text: "${krDesc}"
        `;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${apiKey}` 
            },
            body: JSON.stringify({
                model: "gpt-4o", // ✨ [변경] 최고급 모델 사용 (비용 조금 상승, 품질 최상)
                messages: [
                    { role: "system", content: "You are a helpful assistant designed to output JSON." }, // ✨ JSON 모드 활성화 힌트
                    { role: "user", content: prompt }
                ],
                response_format: { type: "json_object" }, // ✨ [핵심] JSON 강제 모드 (오류 박멸)
                temperature: 0.2
            })
        });

        const data = await response.json();
        
        if(data.error) throw new Error(data.error.message);
        
        // JSON 모드를 쓰면 마크다운 기호 없이 순수 JSON만 줍니다.
        const content = JSON.parse(data.choices[0].message.content);

        ['en','cn','tw','jp','th','vn','id','mn'].forEach(lang => {
            document.getElementById('desc_' + lang).value = content[lang] || "";
        });

        alert("✅ GPT-4o 번역 완료! (특수문자 완벽 처리)");

    } catch (error) {
        console.error(error);
        alert("번역 실패: " + error.message);
    } finally {
        btn.disabled = false;
        btn.innerText = "✨ AI 번역 (GPT-4o)";
    }
}
window.resetForm = function(force = false) {
    if(!force && !confirm("신규 등록 하시겠습니까?")) return;
    
    const idInput = document.getElementById('productId');
    idInput.value = ''; idInput.placeholder = "저장 시 자동 생성"; 
    idInput.disabled = true; idInput.style.backgroundColor = '#e0e0e0'; idInput.style.color = '#555'; idInput.style.cursor = 'not-allowed';

    currentRelatedIds = []; // 초기화
    document.getElementById('relatedTagsContainer').innerHTML = ''; // 태그 비우기
    document.getElementById('relatedSearchInput').value = '';

    // ✨ 미디어 초기화
    currentGallery = [];
    const gy = document.getElementById('media_youtube'); if(gy) gy.value = '';
    const gm = document.getElementById('media_mp4'); if(gm) gm.value = '';
    const gs = document.getElementById('media_sns'); if(gs) gs.value = '';
    const gu = document.getElementById('galleryUrlInput'); if(gu) gu.value = '';
    const gf = document.getElementById('galleryFileInput'); if(gf) gf.value = '';
    if(typeof renderGallery === 'function') renderGallery();

    document.getElementById('name').value = ''; document.getElementById('price').value = '';
    document.querySelectorAll('textarea').forEach(t => t.value = '');
    document.getElementById('imageFile').value = ''; document.getElementById('preview').style.display = 'none';
    document.getElementById('qrPreview').style.display = 'none'; document.getElementById('qrPlaceholder').style.display = 'block'; document.getElementById('qrDownloadBtn').style.display = 'none';
    document.getElementById('saveBtn').innerText = "상품 및 QR 자동 저장하기";
}
function generateRandomId() { const c='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'; let r=''; for(let i=0;i<6;i++) r+=c.charAt(Math.floor(Math.random()*c.length)); return r; }
async function generateAndUploadQR(productId) {
    return new Promise((resolve, reject) => {
        const container = document.getElementById('qrCodeContainer'); container.innerHTML = ''; 
        new QRCode(container, { text: `https://8pharmacy.kr/product.html?id=${productId}`, width: 500, height: 500 });
        setTimeout(async () => {
            const canvas = container.querySelector('canvas') || container.querySelector('img');
            if(!canvas) reject("QR 생성 실패");
            else {
                const blob = canvas.tagName === 'IMG' ? await (await fetch(canvas.src)).blob() : await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.9));
                const refS = ref(storage, 'products/' + productId + '_qr.jpg'); await uploadBytes(refS, blob); resolve(await getDownloadURL(refS));
            }
        }, 500);
    });
}
window.saveProduct = async function() {
    const btn = document.getElementById('saveBtn'); let id = document.getElementById('productId').value.trim(); const name = document.getElementById('name').value;
    if(!name) return alert("상품명 필수");
    try {
        btn.disabled = true; btn.innerText = "⏳ 저장 중...";
        if (!id) {
            let isUnique = false;
            while (!isUnique) { const tId = generateRandomId(); const c = await getDoc(doc(db, "products", tId)); if (!c.exists()) { id = tId; isUnique = true; } }
            document.getElementById('productId').value = id;
        }
        let imageUrl = "", qrImageUrl = "";
        const fileInput = document.getElementById('imageFile');
        if (fileInput.files.length > 0) {
            let file = fileInput.files[0];
            try { file = await imageCompression(file, { maxSizeMB: 1.5, maxWidthOrHeight: 2000 }); } catch (e) {}
            const refImg = ref(storage, 'products/' + id + '.jpg'); await uploadBytes(refImg, file); imageUrl = await getDownloadURL(refImg);
        }
        if (document.getElementById('qrPreview').style.display === 'none') { try { qrImageUrl = await generateAndUploadQR(id); } catch(e){} }
        
        const data = { name, price: Number(document.getElementById('price').value), updatedAt: new Date(),related_products: currentRelatedIds };
        ['kr','en','cn','tw','jp','th','vn','id','mn'].forEach(l => data['desc_'+l] = document.getElementById('desc_'+l).value);
        if(imageUrl) data.image = imageUrl; if(qrImageUrl) data.qrImage = qrImageUrl;

        // ✨ 미디어 필드 저장 (영상/SNS/갤러리)
        data.youtube = linesToArray(document.getElementById('media_youtube').value);
        data.video_mp4 = linesToArray(document.getElementById('media_mp4').value);
        data.sns_embed = linesToArray(document.getElementById('media_sns').value);
        try {
            data.gallery = await uploadGalleryAndGetUrls(id);
        } catch(e) {
            console.error("갤러리 업로드 실패:", e);
            data.gallery = currentGallery.filter(g => g.type === 'url').map(g => g.url); // 최소한 URL이라도 저장
        }

        await setDoc(doc(db, "products", id), data, { merge: true });

        // ✨ [신규 추가] 반대편 상품에도 '나'를 자동으로 등록하기 (쌍방향 연결)
        if (currentRelatedIds && currentRelatedIds.length > 0) {
            const updates = currentRelatedIds.map(targetId => {
                // targetId(B상품)의 related_products 배열에 id(내 상품 A)를 추가
                // updateDoc을 써야 기존 B상품의 다른 정보(가격, 이름 등)를 건드리지 않음
                return updateDoc(doc(db, "products", targetId), {
                    related_products: arrayUnion(id)
                }).catch(err => console.log(`연관상품 자동등록 실패 (${targetId}):`, err));
            });
            // 병렬로 동시 처리 (속도 저하 거의 없음)
            await Promise.all(updates);
        }
        // ✨ [끝]
        alert(`✅ 저장 완료! ID: [${id}]`); window.resetForm(true); loadProductList();
    } catch (e) { alert("오류: " + e.message); } finally { btn.disabled = false; btn.innerText = "상품 및 QR 자동 저장하기"; }
}
window.downloadQR = async function(url, filename) { try { const response = await fetch(url); const blob = await response.blob(); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = filename; document.body.appendChild(link); link.click(); document.body.removeChild(link); } catch (error) { window.open(url, '_blank'); } }

// 3. 목록 & 정렬 & 대시보드
window.loadProductList = async function() {
    const list = document.getElementById('productList'); list.innerHTML = '<p style="text-align:center;">로딩 중...</p>';
    try { const q = await getDocs(collection(db, "products")); allProducts = []; q.forEach(doc => allProducts.push({id: doc.id, ...doc.data()})); window.applySort(); } 
    catch (e) { list.innerHTML = '로드 실패'; }
}

// ✨ [핵심 수정] applySort에 검색 로직 통합 (실시간 검색 부활)
window.applySort = function() {
    const sortSelect = document.getElementById('sortSelect');
    const sortValue = sortSelect ? sortSelect.value : 'newest';
    
    if (sortValue === 'newest') allProducts.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
    else if (sortValue === 'oldest') allProducts.sort((a, b) => (a.updatedAt?.seconds || 0) - (b.updatedAt?.seconds || 0));
    else if (sortValue === 'name_asc') allProducts.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortValue === 'name_desc') allProducts.sort((a, b) => b.name.localeCompare(a.name));
    else if (sortValue === 'views') allProducts.sort((a, b) => (b.views || 0) - (a.views || 0));

    const searchInput = document.getElementById('searchInput');
    const k = searchInput ? searchInput.value.toLowerCase().trim() : "";
    
    // ✨ ID 검색 조건 추가 (이름 OR 아이디 포함)
    const filtered = k 
        ? allProducts.filter(i => i.name.toLowerCase().includes(k) || i.id.toLowerCase().includes(k)) 
        : allProducts;
        
    renderProductList(filtered);
}

function renderProductList(products) {
    const list = document.getElementById('productList');
    if (products.length === 0) { list.innerHTML = '<p style="text-align:center; padding:20px;">검색 결과 없음</p>'; return; }
    
    let html = '';
    products.forEach((item) => {
        const img = item.image || 'https://via.placeholder.com/60';
        const qrBadge = item.qrImage 
            ? `<span class="badge-qr-on" onclick="downloadQR('${item.qrImage}', '${item.id}_qr.jpg')">✅QR받기</span>` 
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
                    <button class="btn-small btn-view" onclick="window.open('product.html?id=${item.id}')">🔍확인</button>
                    <button class="btn-small btn-tag" onclick="createPriceTag('${item.id}', this)">🏷️가격표</button>
                    <button class="btn-small btn-edit" onclick="editProduct('${item.id}')">수정</button>
                    <button class="btn-small btn-delete" onclick="deleteProduct('${item.id}')">삭제</button>
                </div>
            </div>`;
    });
    list.innerHTML = html;
}

// admin.js 파일의 window.loadDashboard 함수 전체를 이걸로 덮어쓰세요.

window.loadDashboard = async function() {
    const startDateStr = document.getElementById('startDate').value;
    const endDateStr = document.getElementById('endDate').value;
    if(!startDateStr || !endDateStr) return alert("기간 선택 필수");

    // KST 시간 (UTC+9)
    const start = new Date(`${startDateStr}T00:00:00+09:00`);
    const end = new Date(`${endDateStr}T23:59:59+09:00`);

    const logList = document.getElementById('logContainer');
    logList.innerHTML = '<div style="text-align:center; padding-top:20px; color:#888;">분석 중...</div>';

    try {
        const q = query(
            collection(db, "scan_logs"),
            where("timestamp", ">=", start),
            where("timestamp", "<=", end),
            orderBy("timestamp", "desc")
        );
        
        const snapshot = await getDocs(q);
        const logs = [];
        snapshot.forEach(doc => logs.push(doc.data()));
        allLogs = logs; // 엑셀용 데이터 저장

        const productCounts = {};
        const langCounts = {kr:0, en:0, jp:0, cn:0, tw:0, th:0, vn:0, id:0, mn:0};
        const hourCounts = new Array(24).fill(0); 
        let cartAdds = 0;

        const actionMap = { 'kr': 'KR한국어', 'en': 'US영어', 'jp': 'JP일본어', 'cn': 'CN중국어', 'tw': 'TW대만어', 'th': 'TH태국어', 'vn': 'VN베트남', 'id': 'ID인니', 'mn': 'MN몽골', 'cart_add': '🛒장바구니' };

        let logHtml = "";
        logs.forEach(log => {
            if(log.timestamp) {
                const date = new Date(log.timestamp.seconds * 1000);
                const hour = date.getHours();
                hourCounts[hour]++;
            }

            if(log.language === 'cart_add') {
                cartAdds++;
            } else {
                if(langCounts[log.language] !== undefined) langCounts[log.language]++;
            }

            if(log.productName && log.language !== 'cart_add') {
                productCounts[log.productName] = (productCounts[log.productName] || 0) + 1;
            }

            const date = log.timestamp ? new Date(log.timestamp.seconds * 1000) : new Date();
            const timeStr = date.toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'});
            const actionText = actionMap[log.language] || log.language;

            logHtml += `
                <div class="log-item">
                    <span><span class="log-time">${timeStr}</span> <span class="log-product">${log.productName}</span></span>
                    <span class="log-action">${actionText}</span>
                </div>`;
        });

        // 요약 통계
        const totalViews = logs.filter(l => l.language !== 'cart_add').length;
        const conversionRate = totalViews > 0 ? ((cartAdds / totalViews) * 100).toFixed(1) : 0;

        document.getElementById('statTotalProducts').innerText = allProducts.length;
        document.getElementById('statPeriodViews').innerText = totalViews;
        document.getElementById('statCartAdds').innerText = cartAdds;
        document.getElementById('statConversion').innerText = conversionRate + "%";
        
        logList.innerHTML = logs.length === 0 ? '<div style="text-align:center; padding-top:80px; color:#888;">기록 없음</div>' : logHtml;

        // 📊 차트 1: 인기 상품 (✨ 가로형으로 변경)
        const sortedProducts = Object.entries(productCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5);
        
        const ctxProd = document.getElementById('chartProducts').getContext('2d');
        if(window.prodChart) window.prodChart.destroy();
        
        window.prodChart = new Chart(ctxProd, {
            type: 'bar',
            data: {
                labels: sortedProducts.map(([name]) => name),
                datasets: [{ 
                    label: '조회수', 
                    data: sortedProducts.map(([,cnt]) => cnt), 
                    backgroundColor: '#f39c12', 
                    borderRadius: 5,
                    barPercentage: 0.6 // 막대 두께 조절
                }]
            },
            options: { 
                indexAxis: 'y', // ✨ [핵심] 가로 그래프로 변경!
                responsive: true, 
                maintainAspectRatio: false,
                scales: {
                    x: { beginAtZero: true, suggestedMax: 5 } // 눈금 여유
                }
            }
        });

        // 차트 2: 언어별 (도넛) - 기존 유지
        const langs = ['kr', 'en','jp','cn','tw','th','vn','id','mn'];
        const langLabels = {'kr':'한국어', 'en':'영어', 'jp':'일어', 'cn':'중국어', 'tw':'대만어', 'th':'태국어', 'vn':'베트남', 'id':'인니', 'mn':'몽골'};
        const colors = ['#1D5C36', '#3498db', '#e74c3c', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#795548'];
        const langChartData = langs.map(l => langCounts[l]);
        const totalLangChart = langChartData.reduce((a,b)=>a+b,0);

        const ctxLang = document.getElementById('chartLangs').getContext('2d');
        if(window.langChart) window.langChart.destroy();

        if(totalLangChart === 0) {
            window.langChart = new Chart(ctxLang, { type: 'doughnut', data: { labels: ['데이터 없음'], datasets: [{ data: [1], backgroundColor: ['#e0e0e0'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false }, tooltip: { enabled: false } } } });
        } else {
            window.langChart = new Chart(ctxLang, {
                type: 'doughnut',
                data: { labels: langs.map(l => langLabels[l]), datasets: [{ data: langChartData, backgroundColor: colors, borderWidth: 0 }] },
                options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } }
            });
        }
        
        // 범례 생성
        const legendBox = document.getElementById('customLegend');
        legendBox.innerHTML = '';
        langs.forEach((l, index) => {
            const item = document.createElement('div');
            item.className = 'legend-item';
            item.innerHTML = `<div class="legend-color" style="background:${colors[index]}"></div> ${langLabels[l]}: ${langCounts[l]}`;
            legendBox.appendChild(item);
        });

        // 차트 3: 시간대별 (꺾은선) - 기존 유지
        const ctxHourly = document.getElementById('chartHourly').getContext('2d');
        if(window.hourChart) window.hourChart.destroy();
        window.hourChart = new Chart(ctxHourly, {
            type: 'line',
            data: {
                labels: Array.from({length:24}, (_,i) => i + "시"),
                datasets: [{
                    label: '방문수',
                    data: hourCounts,
                    borderColor: '#2980b9',
                    backgroundColor: 'rgba(41, 128, 185, 0.2)',
                    fill: true, tension: 0.3
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });

    } catch(e) {
        console.error(e);
        logList.innerHTML = '<div style="text-align:center; padding-top:20px; color:red;">데이터 로드 실패</div>';
    }
}
window.downloadExcel = function() {
    if(!allLogs || allLogs.length === 0) return alert("데이터 없음");
    const data = allLogs.map(l => { const d = l.timestamp ? new Date(l.timestamp.seconds*1000) : new Date(); return { "날짜": d.toLocaleDateString(), "시간": d.toLocaleTimeString(), "상품": l.productName, "행동": l.language==='cart_add'?'장바구니':l.language, "ID": l.productId }; });
    const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Logs"); XLSX.writeFile(wb, `Log_${new Date().toISOString().slice(0,10)}.xlsx`);
}
window.createPriceTag = async function(id, btn) {
    const product = allProducts.find(p => p.id === id); 
    if(!product) return alert("정보 없음");
    
    let bgUrl = "", layout = { ...DEFAULT_LAYOUT };
    try { 
        const s = await getDoc(doc(db, "settings", "config")); 
        if(s.exists()) { 
            const d = s.data(); 
            bgUrl = d.bgImage; 
            if(d.layout) Object.keys(d.layout).forEach(key => { if(d.layout[key]) layout[key] = d.layout[key]; }); 
        } 
    } catch(e) {}

    if(!bgUrl) return alert("❌ 배경 없음"); 
    if(!product.qrImage) return alert("❌ QR 없음");

    const originalText = btn.innerText; 
    btn.innerText = "⏳..."; 
    btn.disabled = true;

    try {
        const canvas = document.getElementById('priceTagCanvas'); 
        const ctx = canvas.getContext('2d');
        
        // 1. 배경 이미지 그리기
        const bgImg = await loadImage(bgUrl); 
        ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);

        // ✨ [수정됨] 텍스트 위치조정 (아래로 내리기) ✨
        // -------------------------------------------------------
        const topBarHeight = 160; 
        const leftMargin = 50;    // 왼쪽 여백

        const pName = product.name;
        let titleSize = 100; 
        const maxTitleW = canvas.width - (leftMargin * 2); 

        ctx.fillStyle = '#FFFFFF'; 
        ctx.textAlign = 'left';      
        ctx.textBaseline = 'middle'; 

        // 폰트 줄이기 루프
        do {
            ctx.font = `bold ${titleSize}px 'Noto Sans KR', sans-serif`;
            titleSize -= 2;
        } while (ctx.measureText(pName).width > maxTitleW && titleSize > 40);

        // 글자 그리기 
        // ★수정 포인트: + 20 (이 숫자를 키우면 더 아래로 내려갑니다)
        const textY = (topBarHeight / 2) + 40; 
        
        ctx.fillText(pName, leftMargin, textY);
        // -------------------------------------------------------


        // 2. 상품 이미지 그리기
        if(product.image) {
            const pImg = await loadImage(product.image);
            ctx.save();
            ctx.beginPath(); 
            ctx.rect(layout.prod_x, layout.prod_y, layout.prod_w, layout.prod_h); 
            ctx.clip();
            
            const scale = layout.prod_scale || 1.0;
            const ratio = Math.min(layout.prod_w / pImg.width, layout.prod_h / pImg.height) * scale;
            const w = pImg.width * ratio; 
            const h = pImg.height * ratio;
            const cx = (layout.prod_w - w) / 2; 
            const cy = (layout.prod_h - h) / 2;
            
            ctx.drawImage(pImg, layout.prod_x + cx, layout.prod_y + cy, w, h);
            ctx.restore();
        }

        // 3. QR 코드 그리기
        const qrImg = await loadImage(product.qrImage); 
        ctx.drawImage(qrImg, layout.qr_x, layout.qr_y, layout.qr_size, layout.qr_size);

        // 4. 가격 텍스트 그리기
        const priceText = "₩" + Number(product.price).toLocaleString();
        ctx.font = `bold ${layout.price_size}px 'Noto Sans KR', sans-serif`; 
        ctx.textAlign = "center"; 
        ctx.textBaseline = "top";
        
        ctx.strokeStyle = "white"; 
        ctx.lineWidth = 20; 
        ctx.strokeText(priceText, layout.price_x, layout.price_y);
        
        ctx.fillStyle = "black"; 
        ctx.fillText(priceText, layout.price_x, layout.price_y);

        // 5. 다운로드 실행
        canvas.toBlob(function(blob) {
            const link = document.createElement('a'); 
            link.download = `${product.name}_pricetag.jpg`; 
            link.href = URL.createObjectURL(blob); 
            link.click();
            btn.innerText = originalText; 
            btn.disabled = false;
        }, 'image/jpeg', 0.95);

    } catch(e) { 
        console.error(e); 
        alert("생성 실패: " + e.message); 
        btn.innerText = originalText; 
        btn.disabled = false; 
    }
}
function loadImage(src) { return new Promise((r, j) => { const i = new Image(); i.crossOrigin = "Anonymous"; i.src = src + (src.includes('?')?'&':'?') + 't=' + new Date().getTime(); i.onload = () => r(i); i.onerror = () => j(new Error("이미지 로드 실패")); }); }
window.deleteProduct = async function(id) { if(confirm('삭제?')) { await deleteDoc(doc(db, "products", id)); alert('삭제됨'); loadProductList(); } }
window.editProduct = async function(id) {
    const d = await getDoc(doc(db, "products", id));
    
    if(d.exists()) {
        const data = d.data();
        
        // 1. 기존 데이터 채우기
        document.getElementById('productId').value = id; 
        document.getElementById('productId').disabled = true; 
        document.getElementById('productId').style.backgroundColor = '#e0e0e0';
        document.getElementById('name').value = data.name; 
        document.getElementById('price').value = data.price;
        
        ['kr','en','cn','tw','jp','th','vn','id','mn'].forEach(l => document.getElementById('desc_'+l).value = data['desc_'+l] || '');
        
        if(data.image) { 
            document.getElementById('preview').src = data.image; 
            document.getElementById('preview').style.display = 'block'; 
        }
        
        if(data.qrImage) {
            document.getElementById('qrPreview').src = data.qrImage; 
            document.getElementById('qrPreview').style.display = 'block'; 
            document.getElementById('qrPlaceholder').style.display = 'none';
            const btn = document.getElementById('qrDownloadBtn'); 
            btn.href = data.qrImage; 
            btn.download = id + '_qr.jpg'; 
            btn.style.display = 'inline-block';
        }

        // ✨ [수정된 위치] 여기가 핵심입니다! if문 안으로 들어왔습니다.
        if(data.related_products) {
            currentRelatedIds = data.related_products; // DB 데이터 전역변수에 담기
        } else {
            currentRelatedIds = [];
        }
        renderRelatedTags(); // 화면에 태그 그리기

        // ✨ 미디어 필드 불러오기
        const arrToLines = (v) => Array.isArray(v) ? v.join('\n') : (v || '');
        document.getElementById('media_youtube').value = arrToLines(data.youtube);
        document.getElementById('media_mp4').value = arrToLines(data.video_mp4);
        document.getElementById('media_sns').value = arrToLines(data.sns_embed);
        // 갤러리: 저장된 URL들을 url 타입으로 복원
        currentGallery = Array.isArray(data.gallery) ? data.gallery.map(u => ({ type: 'url', url: u })) : [];
        renderGallery();

        document.getElementById('saveBtn').innerText = "수정 저장하기"; 
        window.scrollTo(0,0);
    }
}
document.getElementById('imageFile').addEventListener('change', e => { if(e.target.files[0]) { const r = new FileReader(); r.onload = ev => { document.getElementById('preview').src = ev.target.result; document.getElementById('preview').style.display='block'; }; r.readAsDataURL(e.target.files[0]); } });

// ✨ 연관상품 검색 함수
window.searchRelatedProducts = function() {
    const input = document.getElementById('relatedSearchInput');
    const resultBox = document.getElementById('relatedSearchResults');
    const keyword = input.value.toLowerCase().trim();

    if (keyword.length < 1) {
        resultBox.style.display = 'none';
        return;
    }

    // 나 자신과 이미 선택된 상품은 검색 결과에서 제외
    const currentId = document.getElementById('productId').value;
    const filtered = allProducts.filter(p => 
        p.id !== currentId && 
        !currentRelatedIds.includes(p.id) && 
        (p.name.toLowerCase().includes(keyword))
    );

    resultBox.innerHTML = '';
    if (filtered.length === 0) {
        resultBox.style.display = 'none';
        return;
    }

    filtered.forEach(p => {
        const div = document.createElement('div');
        div.style.padding = '10px';
        div.style.cursor = 'pointer';
        div.style.borderBottom = '1px solid #eee';
        div.innerHTML = `<span style="font-weight:bold;">${p.name}</span> <span style="font-size:0.8em; color:#888;">(${p.id})</span>`;
        div.onmouseover = () => div.style.backgroundColor = '#f0f0f0';
        div.onmouseout = () => div.style.backgroundColor = 'white';
        
        // 클릭 시 추가
        div.onclick = () => {
            addRelatedTag(p.id, p.name);
            input.value = '';
            resultBox.style.display = 'none';
        };
        resultBox.appendChild(div);
    });
    resultBox.style.display = 'block';
}

// ✨ 태그 추가 함수
window.addRelatedTag = function(id, name) {
    if (currentRelatedIds.includes(id)) return;
    currentRelatedIds.push(id);
    renderRelatedTags();
}

// ✨ 태그 삭제 함수
window.removeRelatedTag = function(id) {
    currentRelatedIds = currentRelatedIds.filter(itemId => itemId !== id);
    renderRelatedTags();
}

// ✨ 태그 화면 그리기 (렌더링)
window.renderRelatedTags = function() {
    const container = document.getElementById('relatedTagsContainer');
    container.innerHTML = '';

    currentRelatedIds.forEach(id => {
        // ID로 상품명 찾기 (혹시 목록에 없으면 ID만 표시)
        const product = allProducts.find(p => p.id === id);
        const name = product ? product.name : id;

        const tag = document.createElement('span');
        tag.style.background = '#e8f5e9';
        tag.style.color = '#1D5C36';
        tag.style.padding = '5px 10px';
        tag.style.borderRadius = '20px';
        tag.style.fontSize = '0.9rem';
        tag.style.display = 'flex';
        tag.style.alignItems = 'center';
        tag.style.gap = '5px';
        
        tag.innerHTML = `
            ${name} 
            <span onclick="removeRelatedTag('${id}')" style="cursor:pointer; font-weight:bold; color:#d32f2f;">&times;</span>
        `;
        container.appendChild(tag);
    });
}

// ============================================================
// ✨ 미디어 (영상 / SNS / 갤러리) 관리
// ============================================================

// 갤러리 미리보기 다시 그리기
window.renderGallery = function() {
    const box = document.getElementById('galleryPreview');
    if (!box) return;
    box.innerHTML = '';
    currentGallery.forEach((item, idx) => {
        const src = item.type === 'url' ? item.url : item.dataUrl;
        const label = item.type === 'url' ? 'URL' : (item.type === 'clipboard' ? '붙여넣기' : '파일');
        const thumb = document.createElement('div');
        thumb.className = 'gallery-thumb';
        thumb.innerHTML = `
            <img src="${src}" alt="">
            <span class="del" onclick="removeGalleryItem(${idx})">&times;</span>
            <span class="badge-src">${label}</span>
        `;
        box.appendChild(thumb);
    });
}

window.removeGalleryItem = function(idx) {
    currentGallery.splice(idx, 1);
    renderGallery();
}

// URL로 갤러리 추가
window.addGalleryUrl = function() {
    const input = document.getElementById('galleryUrlInput');
    const url = input.value.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) { alert("http(s):// 로 시작하는 이미지 주소를 넣어주세요."); return; }
    currentGallery.push({ type: 'url', url: url });
    input.value = '';
    renderGallery();
}

// 파일(File 객체)을 갤러리에 추가 (미리보기용 dataUrl 생성)
function addGalleryFile(file, sourceType) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            currentGallery.push({ type: sourceType || 'file', file: file, dataUrl: e.target.result });
            renderGallery();
            resolve();
        };
        reader.readAsDataURL(file);
    });
}

// 파일 선택 input
(function initGalleryInputs(){
    const fileInput = document.getElementById('galleryFileInput');
    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            for (const f of e.target.files) { await addGalleryFile(f, 'file'); }
            fileInput.value = ''; // 같은 파일 다시 선택 가능하도록
        });
    }

    const pasteZone = document.getElementById('galleryPasteZone');
    if (pasteZone) {
        // 클립보드 붙여넣기 (Ctrl+V)
        pasteZone.addEventListener('paste', async (e) => {
            const items = e.clipboardData?.items || [];
            let handled = false;
            for (const it of items) {
                if (it.type && it.type.startsWith('image/')) {
                    const blob = it.getAsFile();
                    if (blob) { await addGalleryFile(blob, 'clipboard'); handled = true; }
                }
            }
            if (handled) e.preventDefault();
        });
        // 포커스 시 안내
        pasteZone.addEventListener('click', () => pasteZone.focus());

        // 드래그 앤 드롭
        pasteZone.addEventListener('dragover', (e) => { e.preventDefault(); pasteZone.classList.add('dragover'); });
        pasteZone.addEventListener('dragleave', () => pasteZone.classList.remove('dragover'));
        pasteZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            pasteZone.classList.remove('dragover');
            const files = e.dataTransfer?.files || [];
            for (const f of files) { if (f.type.startsWith('image/')) await addGalleryFile(f, 'file'); }
        });
    }
})();

// 텍스트영역 값을 배열로 (줄바꿈 구분, 빈 줄 제거)
function linesToArray(text) {
    return (text || '').split('\n').map(s => s.trim()).filter(s => s.length > 0);
}

// 저장 시 갤러리의 File들을 Storage에 업로드하고 최종 URL 배열 반환
async function uploadGalleryAndGetUrls(productId) {
    const urls = [];
    let fileIndex = 0;
    for (const item of currentGallery) {
        if (item.type === 'url') {
            urls.push(item.url);
        } else {
            // file / clipboard → Storage 업로드
            let file = item.file;
            try { file = await imageCompression(file, { maxSizeMB: 1.5, maxWidthOrHeight: 2000 }); } catch(e) {}
            const ext = 'jpg';
            const path = `products/${productId}_gallery_${Date.now()}_${fileIndex}.${ext}`;
            const refG = ref(storage, path);
            await uploadBytes(refG, file);
            urls.push(await getDownloadURL(refG));
            fileIndex++;
        }
    }
    return urls;
}