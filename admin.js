// admin.js (좌표값 프리로드 및 조절 기능 개선)

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

// ✨ [핵심] 기본 레이아웃 값 정의 (여기만 고치면 기본값이 바뀝니다)
const DEFAULT_LAYOUT = {
    prod_x: 100, prod_y: 200, prod_w: 1000, prod_h: 850,
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
    } catch (e) { console.error(e); alert("로그인 오류"); }
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
        let superPw = null; if (docSnap.exists()) superPw = docSnap.data().password;
        if (superPw && pw === superPw) {
            document.getElementById('settingsAuthBox').style.display = 'none';
            document.getElementById('settingsConfigBox').style.display = 'block';
            loadConfig();
        } else { alert("슈퍼바이저 비밀번호 오류"); }
    } catch (e) { alert("인증 오류"); }
}

// ✨ 설정 불러오기 (값이 없으면 기본값 채워넣기)
async function loadConfig() {
    try {
        const configSnap = await getDoc(doc(db, "settings", "config"));
        
        // 기본값으로 초기화 (혹시 DB에 없더라도 입력칸이 비어있지 않게)
        let layout = { ...DEFAULT_LAYOUT };
        let apiKey = "";
        let bgImage = "";

        if(configSnap.exists()) {
            const data = configSnap.data();
            if(data.openai_key) apiKey = data.openai_key;
            if(data.bgImage) bgImage = data.bgImage;
            
            // 저장된 레이아웃이 있으면 덮어씌움
            if(data.layout) {
                Object.keys(data.layout).forEach(key => {
                    if(data.layout[key] !== undefined && data.layout[key] !== null) {
                        layout[key] = data.layout[key];
                    }
                });
            }
        }

        // 화면에 값 채우기
        document.getElementById('configApiKey').value = apiKey;
        
        const bgStatus = document.getElementById('bgStatus');
        if(bgImage) { bgStatus.innerText = "✅ 배경 등록됨"; bgStatus.style.color = "green"; } 
        else { bgStatus.innerText = "❌ 배경 없음"; bgStatus.style.color = "red"; }

        // ✨ 입력칸에 숫자 채워넣기 (이제 조절 버튼 누르면 여기서부터 움직임)
        document.getElementById('layout_prod_x').value = layout.prod_x;
        document.getElementById('layout_prod_y').value = layout.prod_y;
        document.getElementById('layout_prod_w').value = layout.prod_w;
        document.getElementById('layout_prod_h').value = layout.prod_h;
        
        document.getElementById('layout_qr_x').value = layout.qr_x;
        document.getElementById('layout_qr_y').value = layout.qr_y;
        document.getElementById('layout_qr_size').value = layout.qr_size;
        
        document.getElementById('layout_price_x').value = layout.price_x;
        document.getElementById('layout_price_y').value = layout.price_y;
        document.getElementById('layout_price_size').value = layout.price_size;

    } catch(e) { console.error("설정 로드 실패", e); }

    try {
        const adminSnap = await getDoc(doc(db, "settings", "admin"));
        if(adminSnap.exists()) document.getElementById('configAdminPw').value = adminSnap.data().password;
    } catch(e) {}
}

// ✨ 설정 저장하기
window.saveSettings = async function() {
    const newKey = document.getElementById('configApiKey').value.trim();
    const newAdminPw = document.getElementById('configAdminPw').value.trim();
    const bgFile = document.getElementById('bgFileInput').files[0];
    if(!newAdminPw) return alert("관리자 비번 필수");

    try {
        const configData = { openai_key: newKey };
        if(bgFile) {
            const bgRef = ref(storage, 'settings/pricetag_bg.jpg');
            await uploadBytes(bgRef, bgFile);
            configData.bgImage = await getDownloadURL(bgRef);
        }

        // 입력된 좌표값 저장
        const layout = {
            prod_x: Number(document.getElementById('layout_prod_x').value),
            prod_y: Number(document.getElementById('layout_prod_y').value),
            prod_w: Number(document.getElementById('layout_prod_w').value),
            prod_h: Number(document.getElementById('layout_prod_h').value),
            qr_x: Number(document.getElementById('layout_qr_x').value),
            qr_y: Number(document.getElementById('layout_qr_y').value),
            qr_size: Number(document.getElementById('layout_qr_size').value),
            price_x: Number(document.getElementById('layout_price_x').value),
            price_y: Number(document.getElementById('layout_price_y').value),
            price_size: Number(document.getElementById('layout_price_size').value)
        };
        configData.layout = layout;

        await setDoc(doc(db, "settings", "config"), configData, { merge: true });
        await setDoc(doc(db, "settings", "admin"), { password: newAdminPw }, { merge: true });
        alert("✅ 설정 저장 완료"); closeSettings();
    } catch(e) { alert("저장 실패: " + e.message); }
}
document.getElementById('adminPassword').addEventListener("keypress", (e) => { if(e.key==="Enter") checkLogin(); });
document.getElementById('supervisorPassword').addEventListener("keypress", (e) => { if(e.key==="Enter") checkSupervisorLogin(); });

// 2. AI & QR
// ==========================================
// ✨ 2. AI 번역 (업그레이드: 요약 금지 + gpt-4o-mini 적용)
// ==========================================
window.translateContent = async function() {
    const krDesc = document.getElementById('desc_kr').value;
    const btn = document.querySelector('.ai-btn');

    if(!krDesc) return alert("한국어 설명을 먼저 작성해주세요!");

    let apiKey = "";
    try { const docSnap = await getDoc(doc(db, "settings", "config")); if(docSnap.exists()) apiKey = docSnap.data().openai_key; } catch(e) {}
    if(!apiKey) return alert("❌ API Key가 없습니다. 설정창에서 등록하세요.");

    try {
        btn.disabled = true;
        btn.innerText = "🤖 꼼꼼하게 번역 중... (요약 없이 전체 번역)";

        // ✨ [핵심 수정 1] 프롬프트(명령어)를 아주 구체적으로 변경
        const prompt = `
            Role: Professional Medical Translator for a Pharmacy.
            Task: Translate the provided Korean text into 7 languages: English, Chinese(Simplified), Japanese, Thai, Vietnamese, Indonesian, and Mongolian.
            
            🚨 IMPORTANT RULES:
            1. Translate the **FULL TEXT** completely. Do NOT summarize or shorten.
            2. Maintain the original tone (friendly & professional).
            3. Preserve line breaks and formatting.
            4. Output MUST be a pure JSON object ONLY. Do not use Markdown code blocks (like \`\`\`json).
            
            JSON Keys: en, cn, jp, th, vn, id, mn
            
            Source Text:
            "${krDesc}"
        `;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${apiKey}` 
            },
            body: JSON.stringify({
                // ✨ [핵심 수정 2] 모델 변경: gpt-3.5-turbo -> gpt-4o-mini (더 똑똑하고 쌈)
                model: "gpt-4o-mini", 
                messages: [{ role: "system", content: "You are a strict JSON output machine." }, { role: "user", content: prompt }],
                temperature: 0.2 // 창의성 낮춤 (정확한 번역 위해)
            })
        });

        const data = await response.json();
        
        if(data.error) {
            console.error("OpenAI Error:", data.error);
            throw new Error(data.error.message);
        }

        // ✨ [핵심 수정 3] 답변에서 잡동사니 제거하고 순수 JSON만 추출
        let rawContent = data.choices[0].message.content;
        // 혹시 모를 마크다운(```json ... ```) 제거
        rawContent = rawContent.replace(/```json/g, "").replace(/```/g, "").trim();
        
        const content = JSON.parse(rawContent);

        ['en','cn','jp','th','vn','id','mn'].forEach(lang => {
            document.getElementById('desc_' + lang).value = content[lang] || "";
        });

        alert("✅ 전체 내용 번역 완료! (내용이 잘리지 않았는지 확인하세요)");

    } catch (error) {
        console.error("번역 에러 상세:", error);
        alert("번역 실패: " + error.message + "\n(잠시 후 다시 시도해보세요)");
    } finally {
        btn.disabled = false;
        btn.innerText = "✨ 한국어 내용을 7개국어로 자동 번역하기";
    }
}
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
// ==========================================
// ✨ [신규] 랜덤 ID 생성기 (알파벳 대소문자 6자리)
// ==========================================
function generateRandomId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result; // 예: "aBgXyZ"
}

// ==========================================
// 4. 저장 함수 (ID 자동 생성 및 중복 체크 로직 탑재)
// ==========================================
window.saveProduct = async function() {
    const btn = document.getElementById('saveBtn');
    let id = document.getElementById('productId').value.trim(); // 현재 ID 칸 값 확인
    const name = document.getElementById('name').value;
    const fileInput = document.getElementById('imageFile');
    
    if(!name) return alert("상품명은 필수입니다!");

    try {
        btn.disabled = true;
        btn.innerText = "🔍 ID 생성 및 중복 확인 중...";

        // 1. ID가 비어있다면(신규 등록), 랜덤 ID 생성 및 중복 검사
        if (!id) {
            let isUnique = false;
            while (!isUnique) {
                const tempId = generateRandomId();
                // DB에 이 ID가 있는지 찔러봄
                const checkDoc = await getDoc(doc(db, "products", tempId));
                
                if (!checkDoc.exists()) {
                    // 중복 아님! 통과!
                    id = tempId;
                    isUnique = true;
                } else {
                    console.log("ID 중복 발생 (로또 당첨급 확률)! 다시 생성합니다: " + tempId);
                    // 다시 while문 처음으로 돌아가서 새 ID 만듦
                }
            }
            // 확정된 ID를 입력창에 보여줌
            document.getElementById('productId').value = id;
        }

        btn.innerText = "⏳ 이미지 및 데이터 저장 중...";

        // 2. 이미지 업로드 (기존 로직 동일)
        let imageUrl = "", qrImageUrl = "";
        if (fileInput.files.length > 0) {
            let file = fileInput.files[0];
            try { file = await imageCompression(file, { maxSizeMB: 0.5, maxWidthOrHeight: 1200 }); } catch (e) {}
            const refImg = ref(storage, 'products/' + id + '.jpg');
            await uploadBytes(refImg, file);
            imageUrl = await getDownloadURL(refImg);
        }

        // 3. QR 생성 (기존 로직 동일)
        const hasQr = document.getElementById('qrPreview').style.display !== 'none';
        if (!hasQr) {
            try { qrImageUrl = await generateAndUploadQR(id); } catch(e){} 
        }

        // 4. 데이터 준비
        const data = { 
            name: name, 
            price: Number(document.getElementById('price').value), 
            updatedAt: new Date() 
        };
        ['kr','en','cn','jp','th','vn','id','mn'].forEach(l => data['desc_'+l] = document.getElementById('desc_'+l).value);
        if(imageUrl) data.image = imageUrl;
        if(qrImageUrl) data.qrImage = qrImageUrl;

        // 5. 최종 저장
        await setDoc(doc(db, "products", id), data, { merge: true });

        alert(`✅ 저장 완료!\n생성된 ID: [ ${id} ]`);
        
        window.resetForm(true); 
        loadProductList();

    } catch (e) {
        alert("오류: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerText = "상품 및 QR 자동 저장하기";
    }
}
window.downloadQR = async function(url, filename) {
    try {
        const response = await fetch(url); const blob = await response.blob();
        const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = filename;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    } catch (error) { window.open(url, '_blank'); }
}

// 3. 목록 조회 & ✨ 가격표 생성 (좌표 적용)
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

// 🔥 [핵심] 가격표 생성 (저장된 좌표 사용)
window.createPriceTag = async function(id, btn) {
    const product = allProducts.find(p => p.id === id);
    if(!product) return alert("정보 없음");
    
    let bgUrl = "";
    // 기본값으로 시작
    let layout = { ...DEFAULT_LAYOUT };

    try { 
        const s = await getDoc(doc(db, "settings", "config")); 
        if(s.exists()) {
            const d = s.data();
            bgUrl = d.bgImage;
            // 저장된 값이 있으면 덮어씌움
            if(d.layout) {
                Object.keys(d.layout).forEach(key => {
                    if(d.layout[key]) layout[key] = d.layout[key];
                });
            }
        } 
    } catch(e) {}

    if(!bgUrl) return alert("❌ 배경 이미지가 없습니다. [설정]에서 등록해주세요.");
    if(!product.qrImage) return alert("❌ QR이 없습니다.");

    const originalText = btn.innerText;
    btn.innerText = "⏳...";
    btn.disabled = true;

    try {
        const canvas = document.getElementById('priceTagCanvas');
        const ctx = canvas.getContext('2d');

        const bgImg = await loadImage(bgUrl);
        ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);

        // 상품 (비율 유지, 중앙 정렬)
        if(product.image) {
            const pImg = await loadImage(product.image);
            const ratio = Math.min(layout.prod_w / pImg.width, layout.prod_h / pImg.height);
            const w = pImg.width * ratio; 
            const h = pImg.height * ratio;
            const centerOffsetX = (layout.prod_w - w) / 2;
            const centerOffsetY = (layout.prod_h - h) / 2;
            ctx.drawImage(pImg, layout.prod_x + centerOffsetX, layout.prod_y + centerOffsetY, w, h);
        }

        // QR
        const qrImg = await loadImage(product.qrImage);
        ctx.drawImage(qrImg, layout.qr_x, layout.qr_y, layout.qr_size, layout.qr_size);

        // 가격
        const priceText = "₩" + Number(product.price).toLocaleString();
        ctx.font = `bold ${layout.price_size}px 'Noto Sans KR', sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.strokeStyle = "white"; 
        ctx.lineWidth = 20; 
        ctx.strokeText(priceText, layout.price_x, layout.price_y);
        ctx.fillStyle = "black"; 
        ctx.fillText(priceText, layout.price_x, layout.price_y);

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

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        const cacheBuster = src.includes('?') ? '&' : '?';
        img.src = src + cacheBuster + 't=' + new Date().getTime();
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(new Error("이미지 로드 실패"));
    });
}

const searchInput = document.getElementById('searchInput');
if(searchInput) {
    searchInput.addEventListener('keyup', function() {
        const k = this.value.toLowerCase().trim();
        renderProductList(allProducts.filter(i => i.name.toLowerCase().includes(k) || i.id.toLowerCase().includes(k)));
    });
}
window.deleteProduct = async function(id) { if(confirm('삭제?')) { await deleteDoc(doc(db, "products", id)); alert('삭제됨'); loadProductList(); } }
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