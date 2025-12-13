/* ==========================================================================
   [1] Import & Config
   ========================================================================== */
import { SHOP_ID, SHOP_NAME,MANAGER_NAME, firebaseConfig } from './config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc, deleteDoc, updateDoc, doc, query, where, orderBy, onSnapshot, limit, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
console.log(`🔥 Connected: ${SHOP_NAME} (${SHOP_ID})`);

// [수정] 상호명 줄바꿈 처리 로직
const displayName = SHOP_NAME.replace(/\\n|\n/g, '<br>'); // 화면용 (줄바꿈 O)
const titleName = SHOP_NAME.replace(/\\n|\n/g, ' ');      // 브라우저 탭용 (줄바꿈 X, 공백 치환)

// 1. 헤더 (한 줄로 표시하되 공백으로 구분)
//document.getElementById('header-shop-name').textContent = `[${titleName}]`;

// 2. 사이드바 (두 줄 허용) -> innerHTML 사용 중요!
document.getElementById('sidebar-brand-name').innerHTML = displayName;
document.getElementById('header-manager-name').textContent = MANAGER_NAME;
// 3. 브라우저 탭 제목 (줄바꿈 불가하므로 공백 처리)
document.title = `${titleName} - PharmaOrder`;

/* ==========================================================================
   [2] 전역 변수
   ========================================================================== */
let currentProduct = null;      
let currentQty = 1;             
let currentOptionPrice = 0;     
let currentOptionId = null;     
let cartItems = [];             

let deletedItemBackup = null;   
let undoTimeout = null;         

let calDate = new Date(); 
let selectedDateStr = null; 

let currentSupplierId = null;
let editingProductId = null; 
let allProductsData = []; 
let allSuppliersData = [];

let currentPhotoReqId = null; 
let tempUploadFile = null;
// 반품용 사진 파일
window.retTempFile = null; 

/* ==========================================================================
   [3] 초기화 및 유틸리티
   ========================================================================== */
// 모달 닫기
document.querySelectorAll('[id^="btn-close"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const modal = e.target.closest('[id$="-modal"]');
        if(modal) modal.style.display = 'none';
    });
});

// 사진 뷰어 닫기
const viewerModal = document.getElementById('photo-viewer-modal');
if(viewerModal) {
    viewerModal.addEventListener('click', (e) => { 
        if(e.target === viewerModal) viewerModal.style.display = 'none'; 
    });
    const closeBtn = viewerModal.querySelector('#viewer-close');
    if(closeBtn) closeBtn.addEventListener('click', () => viewerModal.style.display = 'none');
}

// 시간 포맷
function formatShortTime(timestamp) {
    if(!timestamp) return "";
    const d = timestamp.toDate();
    return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// SMS 보내기 (PC/모바일 분기)
window.handleSmsClick = function(phoneNumber) {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
        window.location.href = `sms:${phoneNumber}`;
    } else {
        navigator.clipboard.writeText(phoneNumber).then(() => {
            alert(`번호(${phoneNumber})가 복사되었습니다.`);
        }).catch(() => alert("복사 실패"));
    }
};

// 태그 클릭 시 주문 탭 이동
window.triggerTagAction = function(productId) {
    const orderTab = document.querySelector('.menu-item[data-target="order-mgmt"]');
    if(orderTab) orderTab.click();

    setTimeout(() => {
        const targetNode = document.querySelector(`.tree-node[data-id="${productId}"]`);
        if(targetNode) {
            let parent = targetNode.parentElement;
            while(parent) {
                if(parent.id === 'product-list') break;
                if(parent.style.display === 'none') {
                    parent.style.display = 'block';
                    const toggleBtn = parent.previousElementSibling;
                    if(toggleBtn && toggleBtn.classList.contains('tree-toggle')) toggleBtn.classList.add('open');
                }
                parent = parent.parentElement;
            }
            targetNode.click(); 
            targetNode.scrollIntoView({behavior: "smooth", block: "center"});
        }
    }, 200);
};

/* ==========================================================================
   [4] 데이터 로드 (상품 & 거래처 공유데이터)
   ========================================================================== */
async function loadProducts() {
    const listContainer = document.getElementById('product-list');
    if(listContainer) listContainer.innerHTML = "<div style='padding:20px; text-align:center'>로딩중...</div>";
    try {
        const q = query(collection(db, "products"));
        const snapshot = await getDocs(q);
        let products = [];
        snapshot.forEach(doc => products.push({ id: doc.id, ...doc.data() }));
        allProductsData = products; 
        renderMainTree(products); renderAdminList(products); 
    } catch (e) { console.error(e); }
}

function renderMainTree(productsToRender) {
    const listContainer = document.getElementById('product-list');
    if(!listContainer) return;
    const tree = {};
    productsToRender.forEach(p => {
        const cat = p.category || "기타"; const comp = p.company || "미지정";
        if (!tree[cat]) tree[cat] = {}; if (!tree[cat][comp]) tree[cat][comp] = [];
        tree[cat][comp].push(p);
    });
    listContainer.innerHTML = ""; 
    const isSearchMode = (productsToRender.length < allProductsData.length) && (productsToRender.length > 0);
    const fixedOrder = ["전문의약품", "일반의약품", "의약외품"];
    const sortedCategories = [ ...fixedOrder.filter(k => tree[k]), ...Object.keys(tree).filter(k => !fixedOrder.includes(k)).sort() ];

    if(productsToRender.length === 0) { listContainer.innerHTML = "<div style='padding:20px; text-align:center;'>결과 없음</div>"; return; }

    sortedCategories.forEach(categoryName => {
        const catDiv = document.createElement("div");
        catDiv.className = "tree-node tree-depth-0 tree-toggle"; catDiv.textContent = categoryName;
        const catChildContainer = document.createElement("div");
        catChildContainer.style.display = isSearchMode ? "block" : "none"; if(isSearchMode) catDiv.classList.add('open');
        catDiv.addEventListener("click", () => { catDiv.classList.toggle("open"); catChildContainer.style.display = catChildContainer.style.display === "none" ? "block" : "none"; });
        listContainer.appendChild(catDiv); listContainer.appendChild(catChildContainer);

        Object.keys(tree[categoryName]).sort().forEach(companyName => {
            const compDiv = document.createElement("div");
            compDiv.className = "tree-node tree-depth-1 tree-toggle"; compDiv.textContent = companyName;
            const compChildContainer = document.createElement("div");
            compChildContainer.style.display = isSearchMode ? "block" : "none"; if(isSearchMode) compDiv.classList.add('open');
            compDiv.addEventListener("click", (e) => { e.stopPropagation(); compDiv.classList.toggle("open"); compChildContainer.style.display = compChildContainer.style.display === "none" ? "block" : "none"; });
            catChildContainer.appendChild(compDiv); catChildContainer.appendChild(compChildContainer);

            tree[categoryName][companyName].sort((a,b)=>a.name.localeCompare(b.name)).forEach(item => {
                const itemDiv = document.createElement("div");
                itemDiv.className = "tree-node tree-depth-2"; itemDiv.setAttribute("data-id", item.id);
                itemDiv.innerHTML = item.stock === false ? `<span style="color:red">[품절]</span> ${item.name}` : item.name;
                itemDiv.addEventListener("click", () => focusProductInTree(item));
                compChildContainer.appendChild(itemDiv);
            });
        });
    });
}

/* ==========================================================================
   [수정] 메인 검색창 로직 (X 버튼 기능 추가)
   ========================================================================== */
const mainSearchInput = document.getElementById('main-search-input');
const mainClearBtn = document.getElementById('btn-clear-main-search');

if(mainSearchInput && mainClearBtn) {
    // 1. 입력 이벤트 (oninput 덮어쓰기)
    mainSearchInput.oninput = (e) => {
        const keyword = e.target.value.toLowerCase().trim();
        
        // 버튼 보이기/숨기기
        mainClearBtn.style.display = keyword.length > 0 ? 'block' : 'none';

        if(keyword.length > 0) { 
            // 검색어가 있으면 주문 관리 탭으로 이동
            const orderTab = document.querySelector('.menu-item[data-target="order-mgmt"]'); 
            if(orderTab) orderTab.click(); 
            
            // 필터링
            const filtered = allProductsData.filter(p => 
                (p.name && p.name.toLowerCase().includes(keyword)) || 
                (p.company && p.company.toLowerCase().includes(keyword)) || 
                (p.category && p.category.toLowerCase().includes(keyword))
            );
            renderMainTree(filtered);
        } else { 
            // 검색어 없으면 전체 목록
            renderMainTree(allProductsData); 
        }
    };

    // 2. X 버튼 클릭 이벤트
    mainClearBtn.onclick = () => {
        mainSearchInput.value = '';         // 내용 지움
        mainSearchInput.focus();            // 포커스 유지
        mainClearBtn.style.display = 'none'; // 버튼 숨김
        renderMainTree(allProductsData);     // 목록 초기화
    };
}

function focusProductInTree(product, optionId = null) {
    if(currentPhotoReqId) {
        if(confirm(`선택한 사진 요청을 '${product.name}' 상품과 매칭하시겠습니까?`)) {
            displayOrderForm(product, optionId, currentPhotoReqId);
            return;
        }
    }
    displayOrderForm(product, optionId);
    // 트리 강조 로직은 생략 (이미 위에서 구현됨)
}

/* ==========================================================================
   [5] 상세 화면 & 장바구니 (단가 계산 포함)
   ========================================================================== */
function displayOrderForm(item, targetOptionId = null, photoReqId = null) {
    currentProduct = item; currentQty = 1; 
    document.getElementById('detail-empty').style.display = 'none';
    document.getElementById('detail-content').style.display = 'flex'; 
    document.getElementById('detail-category').textContent = item.category;
    document.getElementById('detail-name').textContent = item.name;
    document.getElementById('detail-company').textContent = item.company;

    const header = document.querySelector('.order-header');
    if(photoReqId) {
        header.style.backgroundColor = "#fff8e1"; header.style.border = "1px solid #f39c12"; header.style.padding = "10px";
        header.setAttribute('data-photo-req-id', photoReqId); 
        document.getElementById('detail-name').innerHTML = `${item.name} <span style="font-size:0.8rem; color:#e67e22;">(사진 매칭중)</span>`;
    } else {
        header.style.backgroundColor = "transparent"; header.style.border = "none"; header.removeAttribute('data-photo-req-id');
    }

    const optionContainer = document.getElementById('option-list-container');
    optionContainer.innerHTML = ""; 
    const options = item.options || []; 
    if(options.length === 0) { optionContainer.innerHTML = "<div style='padding:20px; color:#aaa; text-align:center;'>옵션 없음</div>"; document.getElementById('order-total-price').textContent = "0원"; return; }

    options.forEach((opt, index) => {
        const card = document.createElement('div'); card.className = 'option-card';
        const count = opt.count || 1; 
        const unitPrice = opt.price / count;
        
        card.innerHTML = `<div style="flex:1;"><div class="option-name">${opt.name}</div></div><div style="text-align:right;"><div class="option-price">${Number(opt.price).toLocaleString()}원</div>${count > 1 ? `<div style="font-size:0.8rem; color:#3498db;">(@ ${Math.round(unitPrice).toLocaleString()}원)</div>` : ''}</div>`;
        
        let isSelected = false;
        if(targetOptionId) { if(opt.id === targetOptionId) isSelected = true; } else { if(index === 0) isSelected = true; }
        if(isSelected) { card.classList.add('selected'); currentOptionPrice = Number(opt.price); currentOptionId = opt.id; }
        
        card.addEventListener('click', () => {
            document.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            currentQty = 1; document.getElementById('order-qty').value = 1;
            currentOptionPrice = Number(opt.price); currentOptionId = opt.id; updateTotalPrice();
        });
        optionContainer.appendChild(card);
    });
    if(options.length > 0 && !targetOptionId) { currentOptionPrice = Number(options[0].price); currentOptionId = options[0].id; }
    document.getElementById('order-qty').value = 1; updateTotalPrice();
}

function updateTotalPrice() {
    const total = currentOptionPrice * currentQty;
    document.getElementById('order-total-price').textContent = total.toLocaleString() + "원";
}
document.getElementById('qty-plus').addEventListener('click', () => { currentQty++; document.getElementById('order-qty').value = currentQty; updateTotalPrice(); });
document.getElementById('qty-minus').addEventListener('click', () => { if(currentQty > 1) currentQty--; document.getElementById('order-qty').value = currentQty; updateTotalPrice(); });
document.getElementById('order-qty').addEventListener('input', function() { let val = parseInt(this.value); if(isNaN(val) || val < 1) val = 1; currentQty = val; updateTotalPrice(); });

// 장바구니 담기
const btnAddCart = document.getElementById('btn-add-cart');
if(btnAddCart) btnAddCart.addEventListener('click', async () => {
    if(!currentProduct || !currentOptionId) return;
    const selectedOptionEl = document.querySelector('.option-card.selected');
    const optionName = selectedOptionEl ? selectedOptionEl.querySelector('.option-name').textContent : "기본옵션";
    const header = document.querySelector('.order-header');
    const photoReqId = header.getAttribute('data-photo-req-id'); 
    
    const newItem = { 
        cartId: Date.now(), 
        optionId: currentOptionId, 
        product: currentProduct, 
        optionName: optionName, 
        qty: currentQty, 
        unitPrice: currentOptionPrice, 
        totalPrice: currentOptionPrice * currentQty, 
        photoReqId: photoReqId 
    };

    const existingIndex = cartItems.findIndex(i => i.optionId === currentOptionId && i.photoReqId === photoReqId);
    if(existingIndex !== -1) { cartItems[existingIndex].qty += currentQty; cartItems[existingIndex].totalPrice = cartItems[existingIndex].unitPrice * cartItems[existingIndex].qty; } 
    else { cartItems.push(newItem); }
    
    renderCart(currentOptionId);

    if(photoReqId) {
        try {
            await updateDoc(doc(db, "photo_requests", photoReqId), { status: "processed", matchedProduct: currentProduct.name, completedAt: new Date() });
            currentPhotoReqId = null; header.style.backgroundColor = "transparent"; header.style.border = "none"; header.removeAttribute('data-photo-req-id');
            document.getElementById('detail-name').textContent = currentProduct.name;
            alert("사진 요청 처리됨");
        } catch(e) { console.error(e); }
    }
});

function resetOrderDetail() {
    document.getElementById('detail-empty').style.display = 'block';
    document.getElementById('detail-content').style.display = 'none';
    currentProduct = null; currentQty = 1; currentOptionPrice = 0; currentOptionId = null;
    const header = document.querySelector('.order-header');
    if(header) { header.style.backgroundColor = "transparent"; header.style.border = "none"; header.removeAttribute('data-photo-req-id'); }
}

function renderCart(highlightId = null) {
    const cartList = document.getElementById('cart-list');
    cartList.innerHTML = ""; let totalAmount = 0;
    if(cartItems.length === 0) cartList.innerHTML = "<div style='padding:40px 20px; text-align:center; color:#ccc;'>비어있음</div>";
    
    cartItems.forEach((item, index) => {
        totalAmount += item.totalPrice;
        const div = document.createElement('div'); div.className = 'cart-item-card';
        if(highlightId && item.optionId === highlightId) div.classList.add('highlight');
        div.addEventListener('dblclick', () => { document.querySelector('.menu-item[data-target="order-mgmt"]').click(); focusProductInTree(item.product, item.optionId); });
        const photoIcon = item.photoReqId ? '<span style="font-size:0.8rem;">📷</span>' : '';
        div.innerHTML = `<div class="cart-item-left"><div class="cart-item-title">${item.product.name} ${photoIcon}</div><div class="cart-item-desc">${item.optionName}</div></div><div class="cart-item-right"><div class="cart-item-price">${item.totalPrice.toLocaleString()}원</div><div class="cart-item-qty">${item.qty}개</div></div><button class="cart-delete-btn" onclick="window.deleteCartItem(${index})">&times;</button>`;
        cartList.appendChild(div);
    });
    document.getElementById('cart-total-price').textContent = totalAmount.toLocaleString() + "원";
    document.getElementById('cart-count').textContent = cartItems.length;
}

window.deleteCartItem = function(index) {
    const card = document.querySelectorAll('.cart-item-card')[index];
    deletedItemBackup = { item: cartItems[index], optionId: cartItems[index].optionId };
    if(card) card.classList.add('deleting');
    setTimeout(() => { cartItems.splice(index, 1); renderCart(); showUndoNotification(); }, 200);
};

function showUndoNotification() {
    const undoArea = document.getElementById('undo-area');
    undoArea.style.display = 'block';
    if(undoTimeout) clearTimeout(undoTimeout);
    undoTimeout = setTimeout(() => { undoArea.style.display = 'none'; deletedItemBackup = null; }, 5000);
}
if(document.getElementById('btn-undo')) document.getElementById('btn-undo').addEventListener('click', () => { if(deletedItemBackup) { cartItems.push(deletedItemBackup.item); renderCart(deletedItemBackup.optionId); document.getElementById('undo-area').style.display = 'none'; } });

// 주문 완료 (shopId 포함 저장)
if(document.getElementById('btn-order-complete')) {
    document.getElementById('btn-order-complete').addEventListener('click', async () => {
        if(cartItems.length === 0) return;
        if(!confirm(`총 ${cartItems.length}건 주문완료?`)) return;
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
        try { 
            await addDoc(collection(db, "order_history"), { 
                date: dateStr, timestamp: now, items: cartItems, shopId: SHOP_ID 
            }); 
            cartItems = []; renderCart(); resetOrderDetail(); 
        } catch(e) { console.error(e); alert("저장 실패"); }
    });
}

/* ==========================================================================
   [6] 사진 업로드 & 주문장 (내 것만 보기)
   ========================================================================== */
const btnCamera = document.getElementById('btn-camera-floating');
const cameraInput = document.getElementById('file-input-camera'); 
const inputGallery = document.getElementById('file-input-gallery');
const loadingSpinner = document.getElementById('loading-spinner');
const sourceModal = document.getElementById('source-select-modal');

function openSourceModal() { if(sourceModal) sourceModal.style.display = 'flex'; }
if(btnCamera) btnCamera.addEventListener('click', openSourceModal);
if(document.getElementById('btn-select-camera')) document.getElementById('btn-select-camera').onclick = () => { sourceModal.style.display = 'none'; if(cameraInput) cameraInput.click(); };
if(document.getElementById('btn-select-gallery')) document.getElementById('btn-select-gallery').onclick = () => { sourceModal.style.display = 'none'; if(inputGallery) inputGallery.click(); };
if(document.getElementById('btn-select-cancel')) document.getElementById('btn-select-cancel').onclick = () => { sourceModal.style.display = 'none'; };

async function handleFileUpload(e) {
    const file = e.target.files[0]; if(!file) return;
    window.tempUploadFile = file; 
    const reader = new FileReader();
    reader.onload = (event) => { const img = document.getElementById('upload-preview-img'); if(img) img.src = event.target.result; };
    reader.readAsDataURL(file);
    document.getElementById('upload-note').value = "";
    document.getElementById('upload-confirm-modal').style.display = 'flex';
    e.target.value = '';
}
if(cameraInput) cameraInput.addEventListener('change', handleFileUpload);
if(inputGallery) inputGallery.addEventListener('change', handleFileUpload);
if(document.getElementById('btn-upload-cancel')) document.getElementById('btn-upload-cancel').addEventListener('click', () => { document.getElementById('upload-confirm-modal').style.display = 'none'; window.tempUploadFile = null; });

if(document.getElementById('btn-upload-confirm')) {
    const btn = document.getElementById('btn-upload-confirm');
    const newBtn = btn.cloneNode(true); btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', async () => {
        const file = window.tempUploadFile; if(!file) return;
        const note = document.getElementById('upload-note').value;
        document.getElementById('upload-confirm-modal').style.display = 'none';
        
        try {
            if(loadingSpinner) loadingSpinner.style.display = 'flex';
            const options = { maxSizeMB: 0.3, maxWidthOrHeight: 800, useWebWorker: true };
            const compressedFile = await imageCompression(file, options);
            const storageRef = ref(storage, `photo_requests/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, compressedFile);
            const downloadURL = await getDownloadURL(storageRef);
            
            await addDoc(collection(db, "photo_requests"), { 
                imageUrl: downloadURL, timestamp: new Date(), status: 'pending', note: note, shopId: SHOP_ID 
            });
            if(loadingSpinner) loadingSpinner.style.display = 'none';
            alert("전송 완료");
        } catch(error) { console.error(error); if(loadingSpinner) loadingSpinner.style.display = 'none'; alert("오류"); }
    });
}

/* ==========================================================================
   [수정] 사진 요청 구독 (72시간 필터링 복구)
   ========================================================================== */
function subscribeToPhotoRequests() {
    const queueContainer = document.getElementById('photo-grid');
    if(!queueContainer) return;
    
    // 1. 기준 시간 설정 (현재로부터 72시간 전)
    const timeLimit = new Date();
    timeLimit.setHours(timeLimit.getHours() - 72);

    // 2. 쿼리 (일단 최신순으로 가져옴)
    const q = query(collection(db, "photo_requests"), orderBy("timestamp", "desc"));
    
    onSnapshot(q, (snapshot) => {
        queueContainer.innerHTML = "";
        let list = [];
        
        snapshot.forEach(doc => {
            const d = doc.data();
            const itemDate = d.timestamp ? d.timestamp.toDate() : new Date(0); // 날짜 변환

            // [조건 1] 내 약국 데이터인가? (또는 본점이고 식별자 없는 옛날 데이터인가?)
            const isMine = (d.shopId === SHOP_ID) || (SHOP_ID === 'main' && !d.shopId);
            
            // [조건 2] ★ 3일(72시간) 이내의 데이터인가?
            const isRecent = itemDate > timeLimit;

            // 두 조건 모두 만족할 때만 리스트에 추가
            if (isMine && isRecent) {
                list.push({ id: doc.id, ...d });
            }
        });
        
        if(list.length === 0) { 
            queueContainer.innerHTML = "<div style='grid-column:1/-1; text-align:center; padding:50px; color:#aaa;'>최근 3일간 요청 내역이 없습니다.</div>"; 
            return; 
        }
        
        // 정렬 (대기중 우선, 그 다음 시간순)
        list.sort((a, b) => {
            const statusOrder = { 'pending': 1, 'hold': 2, 'processed': 3 };
            if (statusOrder[a.status] !== statusOrder[b.status]) return statusOrder[a.status] - statusOrder[b.status];
            return b.timestamp.seconds - a.timestamp.seconds; 
        });

        // 화면 그리기
        list.forEach(data => {
            const div = document.createElement('div');
            let statusClass = 'pending'; 
            if(data.status === 'hold') statusClass = 'hold'; 
            if(data.status === 'processed') statusClass = 'done';
            
            div.className = `order-book-item ${statusClass}`;
            div.innerHTML = `<img src="${data.imageUrl}"><div class="photo-time-label time-top">${formatShortTime(data.timestamp)}</div>${data.note ? `<div class="photo-note-label">${data.note}</div>` : ''}`;
            div.addEventListener('click', () => showPhotoViewer(data.id, data.imageUrl, data.status, data.note));
            queueContainer.appendChild(div);
        });
    });
}

function showPhotoViewer(docId, imageUrl, currentStatus, note) {
    let viewer = document.getElementById('photo-viewer-modal');
    viewer.innerHTML = `<div style="position:relative; max-width:90%; max-height:70%;"><img id="viewer-img" src="${imageUrl}" style="max-width:100%; max-height:70vh; border-radius:8px;"><button id="viewer-close" style="position:absolute; top:-40px; right:0; background:none; border:none; color:white; font-size:2.5rem; cursor:pointer;">&times;</button></div><div id="viewer-note" style="background:rgba(255,255,255,0.9); padding:10px 20px; border-radius:20px; margin-top:15px; font-weight:bold; color:#333; max-width:90%; text-align:center; display:${note ? 'block' : 'none'}">📝 ${note || ''}</div><div id="viewer-buttons" style="margin-top:15px; display:flex; gap:10px; flex-wrap:wrap; justify-content:center;"></div>`;
    
    const btnContainer = viewer.querySelector('#viewer-buttons');
    const createBtn = (text, color, action) => { const btn = document.createElement('button'); btn.textContent = text; btn.style.cssText = `padding:12px 25px; border-radius:30px; border:none; font-weight:bold; color:white; background-color:${color}; cursor:pointer;`; btn.onclick = action; return btn; };
    const update = async (newStatus, reqReason) => {
        let up = { status: newStatus };
        if(reqReason) { const r = prompt("보류 사유"); if(!r) return; up.note = r; }
        if(newStatus === 'processed') up.completedAt = new Date();
        await updateDoc(doc(db, "photo_requests", docId), up);
        viewer.style.display = 'none';
    };

    if(currentStatus === 'pending') { btnContainer.appendChild(createBtn('✅ 주문완료', '#27ae60', ()=>update('processed'))); btnContainer.appendChild(createBtn('🟠 보류', '#f39c12', ()=>update('hold', true))); } 
    else if(currentStatus === 'hold') { btnContainer.appendChild(createBtn('✅ 주문완료', '#27ae60', ()=>update('processed'))); btnContainer.appendChild(createBtn('↩️ 대기', '#34495e', ()=>update('pending'))); }
    else { btnContainer.appendChild(createBtn('↩️ 복구', '#e74c3c', ()=>update('pending'))); }

    viewer.querySelector('#viewer-close').onclick = () => viewer.style.display = 'none';
    viewer.onclick = (e) => { if(e.target === viewer) viewer.style.display = 'none'; };
    viewer.style.display = 'flex';
}

/* ==========================================================================
   [7] 거래처 관리 (공유/개별)
   ========================================================================== */
/* ==========================================================================
   [수정] 거래처 목록 로드 (검색용 데이터 저장 강화)
   ========================================================================== */
async function loadSuppliers() {
    const listContainer = document.getElementById('supplier-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = "<div style='text-align:center;'>로딩중...</div>";
    
    try {
        const supSnapshot = await getDocs(collection(db, "suppliers"));
        let suppliers = []; 
        supSnapshot.forEach(doc => suppliers.push({ id: doc.id, ...doc.data() }));
        
        const prodSnapshot = await getDocs(collection(db, "products"));
        const companyProductMap = {}; 
        
        prodSnapshot.forEach(doc => { 
            const p = { id: doc.id, ...doc.data() }; 
            const comp = p.company || "미지정"; 
            if (!companyProductMap[comp]) companyProductMap[comp] = []; 
            companyProductMap[comp].push(p); 
        });
        
        suppliers.forEach(sup => { sup.products = companyProductMap[sup.name] || []; });
        
        // 전역 변수에 저장
        allSuppliersData = suppliers; 
        
        document.getElementById('sup-total-count').textContent = suppliers.length;
        renderSupplierList(suppliers);
        
        // [핵심] 데이터 로드 후 검색 기능 켜기!
        setupSupplierSearch();

    } catch (e) { console.error(e); }
}

/* ==========================================================================
   [추가] 신규 거래처 등록 버튼 (입력창 초기화)
   ========================================================================== */
const btnNewSupplier = document.getElementById('btn-new-supplier');

if (btnNewSupplier) {
    const newBtn = btnNewSupplier.cloneNode(true);
    btnNewSupplier.parentNode.replaceChild(newBtn, btnNewSupplier);

    newBtn.addEventListener('click', () => {
        // 1. 현재 선택된 거래처 ID 초기화 (새로 만들기 모드)
        currentSupplierId = null;

        // 2. 리스트 선택 효과 제거
        document.querySelectorAll('.supplier-card').forEach(c => c.classList.remove('active'));

        // 3. 입력 폼 비우기
        document.getElementById('supplier-form-title').textContent = "새 거래처 등록";
        document.getElementById('sup-name').value = "";
        
        const fields = ['sup-website', 'sup-site-id', 'sup-site-pw', 'sup-cur-manager', 'sup-cur-phone', 'sup-prev-manager', 'sup-prev-phone'];
        fields.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.value = "";
        });

        // 4. 문자 버튼 숨기기
        updateSmsButton(null);

        // 5. 이름 입력칸으로 포커스 이동
        document.getElementById('sup-name').focus();
    });
}

/* ==========================================================================
   [수정] 거래처 검색 이벤트 연결 함수
   ========================================================================== */
/* ==========================================================================
   [수정] 거래처 검색 및 초기화(X) 버튼 기능
   ========================================================================== */
/* ==========================================================================
   [수정] 검색창 입력 감지 (oninput 방식)
   ========================================================================== */
function setupSupplierSearch() {
    const searchInput = document.getElementById('supplier-search');
    const clearBtn = document.getElementById('btn-clear-sup-search');
    
    // 요소가 없으면 중단
    if (!searchInput || !clearBtn) return;

    // 1. 입력 이벤트 (덮어쓰기 방식)
    searchInput.oninput = (e) => {
        const keyword = e.target.value.toLowerCase().trim();
        
        // 글자가 있으면 X 버튼 보이기, 없으면 숨기기
        clearBtn.style.display = keyword.length > 0 ? 'block' : 'none';

        if (!allSuppliersData) return;

        const filtered = allSuppliersData.filter(sup => {
            const name = sup.name ? sup.name.toLowerCase() : '';
            return name.includes(keyword) || 
                   (sup.products && sup.products.some(p => p.name.toLowerCase().includes(keyword)));
        });
        
        renderSupplierList(filtered);
    };

    // 2. X 버튼 클릭 이벤트 (덮어쓰기 방식)
    clearBtn.onclick = () => {
        searchInput.value = '';        // 내용 지움
        searchInput.focus();           // 포커스 유지
        clearBtn.style.display = 'none'; // 버튼 숨김
        renderSupplierList(allSuppliersData); // 전체 목록 복구
    };
}

/* ==========================================================================
   [수정] 거래처 리스트 렌더링 (상품 태그 & 이동 기능 복구)
   ========================================================================== */
function renderSupplierList(suppliersToRender) {
    const listContainer = document.getElementById('supplier-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = "";
    
    if(suppliersToRender.length === 0) { 
        listContainer.innerHTML = "<div style='text-align:center; padding:20px; color:#aaa;'>결과 없음</div>"; 
        return; 
    }
    
    // 가나다순 정렬
    suppliersToRender.sort((a, b) => a.name.localeCompare(b.name));
    
    suppliersToRender.forEach(sup => {
        const div = document.createElement('div'); 
        div.className = 'supplier-card';
        
        // 1. 상품 태그 HTML 생성
        let tagsHtml = "";
        const products = sup.products || []; // loadSuppliers에서 미리 매칭해둔 상품들
        
        // 너무 많으면 10개만 표시하고 '...' 처리 (성능 최적화)
        products.slice(0, 10).forEach(p => {
            // [중요] event.stopPropagation() : 태그 눌렀을 때 거래처 상세정보가 열리는 것 방지
            tagsHtml += `<span class="product-tag-chip" onclick="event.stopPropagation(); window.triggerTagAction('${p.id}')">#${p.name}</span>`;
        });
        
        if(products.length > 10) {
            tagsHtml += `<span style="font-size:0.7rem; color:#888; margin-left:5px;">+${products.length - 10}개 더있음</span>`;
        }
        if(products.length === 0) {
            tagsHtml = `<span style="font-size:0.75rem; color:#ccc;">등록된 상품 없음</span>`;
        }

        // 2. 카드 화면 구성
        div.innerHTML = `
            <div class="sup-header">
                <div class="sup-name">${sup.name}</div>
            </div>
            <div class="sup-manager-info" style="font-size:0.8rem; color:#999; margin-bottom:8px;">
                클릭하여 담당자 정보 및 ID/PW 확인
            </div>
            <div class="sup-product-tags" style="display:flex; flex-wrap:wrap; gap:4px;">
                ${tagsHtml}
            </div>
        `;
        
        // 3. 카드 클릭 이벤트 (상세정보 로드)
        div.addEventListener('click', () => {
            document.querySelectorAll('.supplier-card').forEach(c => c.classList.remove('active'));
            div.classList.add('active');
            fillSupplierForm(sup); 
        });
        
        listContainer.appendChild(div);
    });
}

function fillSupplierForm(sup) {
    currentSupplierId = sup.id;
    document.getElementById('supplier-form-title').textContent = `${sup.name} 상세`;
    document.getElementById('sup-name').value = sup.name; 
    
    const fields = ['sup-website', 'sup-site-id', 'sup-site-pw', 'sup-cur-manager', 'sup-cur-phone', 'sup-prev-manager', 'sup-prev-phone'];
    fields.forEach(id => document.getElementById(id).value = "");
    
    // Private Data 가져오기
    const privateDocId = `${sup.id}_${SHOP_ID}`;
    getDoc(doc(db, "supplier_details", privateDocId)).then(docSnap => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById('sup-website').value = data.website || "";
            document.getElementById('sup-site-id').value = data.siteId || "";
            document.getElementById('sup-site-pw').value = data.sitePw || "";
            document.getElementById('sup-cur-manager').value = data.curManagerName || "";
            document.getElementById('sup-cur-phone').value = data.curManagerPhone || "";
            document.getElementById('sup-prev-manager').value = data.prevManagerName || "";
            document.getElementById('sup-prev-phone').value = data.prevManagerPhone || "";
            updateSmsButton(data.curManagerPhone);
        } else {
            // 본점 레거시 데이터 확인
            if(SHOP_ID === 'main' && sup.siteId) {
                document.getElementById('sup-website').value = sup.website || "";
                document.getElementById('sup-site-id').value = sup.siteId || "";
                document.getElementById('sup-site-pw').value = sup.sitePw || "";
                document.getElementById('sup-cur-manager').value = sup.curManagerName || "";
                document.getElementById('sup-cur-phone').value = sup.curManagerPhone || "";
                updateSmsButton(sup.curManagerPhone);
            } else { updateSmsButton(null); }
        }
    });
}

function updateSmsButton(phone) {
    let smsBtn = document.getElementById('btn-sms-cur');
    if(!smsBtn) {
        const container = document.getElementById('sup-cur-phone').parentNode;
        smsBtn = document.createElement('a'); smsBtn.id = 'btn-sms-cur';
        smsBtn.style.cssText = "display:none; align-items:center; justify-content:center; width:40px; background:#2ecc71; border-radius:4px; text-decoration:none; font-size:1.2rem; cursor:pointer;";
        smsBtn.innerText = "✉️";
        container.appendChild(smsBtn);
    }
    if(phone) { 
        smsBtn.style.display = 'flex'; 
        smsBtn.onclick = (e) => { e.preventDefault(); handleSmsClick(phone); }; 
    } else { smsBtn.style.display = 'none'; }
}

const btnSaveSupplier = document.getElementById('btn-save-supplier');
if(btnSaveSupplier) {
    const newBtn = btnSaveSupplier.cloneNode(true);
    btnSaveSupplier.parentNode.replaceChild(newBtn, btnSaveSupplier);
    newBtn.addEventListener('click', async () => {
        const name = document.getElementById('sup-name').value;
        if(!name) return;
        
        let sharedId = currentSupplierId;
        if (!sharedId) {
            const docRef = await addDoc(collection(db, "suppliers"), { name: name });
            sharedId = docRef.id;
        } else { await updateDoc(doc(db, "suppliers", sharedId), { name: name }); }

        const privateData = {
            website: document.getElementById('sup-website').value,
            siteId: document.getElementById('sup-site-id').value,
            sitePw: document.getElementById('sup-site-pw').value,
            curManagerName: document.getElementById('sup-cur-manager').value,
            curManagerPhone: document.getElementById('sup-cur-phone').value,
            prevManagerName: document.getElementById('sup-prev-manager').value,
            prevManagerPhone: document.getElementById('sup-prev-phone').value,
            shopId: SHOP_ID 
        };
        await setDoc(doc(db, "supplier_details", `${sharedId}_${SHOP_ID}`), privateData);
        alert("저장되었습니다."); loadSuppliers();
    });
}

/* ==========================================================================
   [추가] 거래처 삭제 버튼 연결
   ========================================================================== */
const btnDeleteSupplier = document.getElementById('btn-delete-supplier');

if (btnDeleteSupplier) {
    // 중복 방지를 위해 버튼 재생성 (기존 리스너 제거)
    const newBtn = btnDeleteSupplier.cloneNode(true);
    btnDeleteSupplier.parentNode.replaceChild(newBtn, btnDeleteSupplier);

    newBtn.addEventListener('click', async () => {
        if (!currentSupplierId) {
            alert("삭제할 거래처를 먼저 리스트에서 선택해주세요.");
            return;
        }

        // 경고 메시지 (공유 데이터 삭제 알림)
        if (confirm("정말 이 거래처를 삭제하시겠습니까?\n(삭제 시 모든 지점의 목록에서도 사라집니다)")) {
            try {
                // 1. 공유 목록(suppliers)에서 삭제
                await deleteDoc(doc(db, "suppliers", currentSupplierId));

                // 2. 내 약국의 상세 정보(supplier_details)도 삭제
                const privateDocId = `${currentSupplierId}_${SHOP_ID}`;
                try {
                    await deleteDoc(doc(db, "supplier_details", privateDocId));
                } catch(e) { /* 상세 정보가 없을 수도 있음 */ }

                alert("삭제되었습니다.");

                // 3. 입력창 초기화
                currentSupplierId = null;
                document.getElementById('sup-name').value = "";
                const fields = ['sup-website', 'sup-site-id', 'sup-site-pw', 'sup-cur-manager', 'sup-cur-phone', 'sup-prev-manager', 'sup-prev-phone'];
                fields.forEach(id => {
                    const el = document.getElementById(id);
                    if(el) el.value = "";
                });

                // 4. 목록 새로고침
                await loadSuppliers();        // 거래처 관리 리스트 갱신
                await loadSupplierDropdown(); // 상품 등록창 드롭다운 갱신

            } catch (e) {
                console.error("삭제 실패:", e);
                alert("삭제 중 오류가 발생했습니다.");
            }
        }
    });
}

/* ==========================================================================
   [8] 반품 관리
   ========================================================================== */
const btnOpenRetModal = document.getElementById('btn-open-return-modal');
const retModal = document.getElementById('return-register-modal');
const btnRetSave = document.getElementById('btn-ret-save');
const btnRetCancel = document.getElementById('btn-ret-cancel');
const retImgInput = document.getElementById('ret-img-input');
const retImgPreview = document.getElementById('ret-img-preview');
const btnRetImgClear = document.getElementById('btn-ret-img-clear');

if (btnOpenRetModal) {
    const newBtn = btnOpenRetModal.cloneNode(true);
    btnOpenRetModal.parentNode.replaceChild(newBtn, btnOpenRetModal);
    newBtn.addEventListener('click', async () => {
        const select = document.getElementById('ret-supplier');
        try {
            const snap = await getDocs(collection(db, "suppliers"));
            let suppliers = [];
            snap.forEach(doc => suppliers.push(doc.data().name));
            suppliers.sort((a, b) => a.localeCompare(b));
            let html = '<option value="">거래처 선택</option>';
            suppliers.forEach(name => html += `<option value="${name}">${name}</option>`);
            select.innerHTML = html;
        } catch (e) {}
        document.getElementById('ret-name').value = '';
        document.getElementById('ret-maker').value = '';
        document.getElementById('ret-qty').value = '1';
        window.retTempFile = null; retImgInput.value = ""; retImgPreview.style.display = 'none'; btnRetImgClear.style.display = 'none';
        retModal.style.display = 'flex';
    });
}
if(retImgInput) {
    retImgInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if(file) {
            window.retTempFile = file;
            const reader = new FileReader();
            reader.onload = (ev) => { retImgPreview.src = ev.target.result; retImgPreview.style.display = 'block'; btnRetImgClear.style.display = 'block'; };
            reader.readAsDataURL(file);
        }
    });
}
if(btnRetImgClear) btnRetImgClear.addEventListener('click', () => { window.retTempFile = null; retImgInput.value = ""; retImgPreview.style.display = 'none'; btnRetImgClear.style.display = 'none'; });
if(document.getElementById('btn-ret-quick-sup')) document.getElementById('btn-ret-quick-sup').addEventListener('click', () => document.getElementById('btn-quick-sup-open').click());
if(btnRetCancel) btnRetCancel.addEventListener('click', () => retModal.style.display = 'none');

if (btnRetSave) {
    const newSaveBtn = btnRetSave.cloneNode(true);
    btnRetSave.parentNode.replaceChild(newSaveBtn, btnRetSave);
    newSaveBtn.addEventListener('click', async () => {
        const name = document.getElementById('ret-name').value;
        const supplier = document.getElementById('ret-supplier').value;
        if (!name || !supplier) { alert("필수항목 누락"); return; }
        
        const maker = document.getElementById('ret-maker').value;
        const qty = document.getElementById('ret-qty').value;
        const pkgType = document.getElementById('ret-pkg-type').value;
        const reason = document.getElementById('ret-reason').value;
        
        let downloadURL = null;
        if (window.retTempFile) {
             const storageRef = ref(storage, `returns/${Date.now()}_${window.retTempFile.name}`);
             await uploadBytes(storageRef, window.retTempFile);
             downloadURL = await getDownloadURL(storageRef);
        }
        await addDoc(collection(db, "returns"), {
            productName: name, manufacturer: maker, supplier: supplier, qty: Number(qty),
            pkgType: pkgType, reason: reason, imageUrl: downloadURL, status: 'requested',
            dates: { requested: new Date() }, shopId: SHOP_ID
        });
        alert("등록됨"); retModal.style.display = 'none';
    });
}

function subscribeToReturns() {
    setupReturnListeners(); fetchReturns();
}
function setupReturnListeners() {
    const btnSearch = document.getElementById('btn-ret-search');
    const btnReset = document.getElementById('btn-ret-reset');
    if (btnSearch) {
        const newSearch = btnSearch.cloneNode(true);
        btnSearch.parentNode.replaceChild(newSearch, btnSearch);
        newSearch.addEventListener('click', () => fetchReturns(true));
    }
    if (btnReset) {
        const newReset = btnReset.cloneNode(true);
        btnReset.parentNode.replaceChild(newReset, btnReset);
        newReset.addEventListener('click', () => {
            document.getElementById('ret-search-start').value = '';
            document.getElementById('ret-search-end').value = '';
            document.getElementById('ret-search-keyword').value = '';
            fetchReturns(false);
        });
    }
}
let returnUnsubscribe = null;
function fetchReturns(isSearch = false) {
    const listContainer = document.getElementById('return-list-container');
    if (!listContainer) return;
    if (returnUnsubscribe) returnUnsubscribe();

    let q = query(collection(db, "returns"), orderBy("dates.requested", "desc"));
    if (isSearch) {
        const startVal = document.getElementById('ret-search-start').value;
        const endVal = document.getElementById('ret-search-end').value;
        if (startVal) q = query(q, where("dates.requested", ">=", new Date(startVal)));
        if (endVal) { const endDate = new Date(endVal); endDate.setHours(23, 59, 59); q = query(q, where("dates.requested", "<=", endDate)); }
    } else { q = query(q, limit(50)); }

    returnUnsubscribe = onSnapshot(q, (snapshot) => {
        listContainer.innerHTML = "";
        let docs = [];
        const keyword = isSearch ? document.getElementById('ret-search-keyword').value.toLowerCase() : "";
        snapshot.forEach(doc => {
            const d = doc.data();
            if (d.shopId === SHOP_ID || (SHOP_ID === 'main' && !d.shopId)) {
                if (!keyword || d.productName.toLowerCase().includes(keyword) || d.supplier.toLowerCase().includes(keyword)) docs.push({ id: doc.id, ...d });
            }
        });
        document.getElementById('return-total-count').textContent = docs.length;
        if (docs.length === 0) { listContainer.innerHTML = "<div style='grid-column:1/-1; text-align:center; padding:50px;'>내역 없음</div>"; return; }

        docs.forEach(data => {
            const div = document.createElement('div');
            div.className = `return-card status-${data.status}`;
            
            const formatDate = (ts) => ts ? new Date(ts.toDate()).toLocaleDateString() : '-';
            const dReq = data.dates?.requested ? formatDate(data.dates.requested) : '-';
            const dCol = data.dates?.collected ? formatDate(data.dates.collected) : '-';
            const dCom = data.dates?.completed ? formatDate(data.dates.completed) : '-';

            let statusText = "🔴 반품요청";
            let dateDisplay = `신청일: ${dReq}`;
            let btnHtml = `<button class="ret-status-btn" style="background:#f1c40f;">수거완료 처리</button>`;
            let undoHtml = "";

            if (data.status === 'collected') {
                statusText = "🟡 수거완료";
                dateDisplay = `<span style="color:#999;">신청: ${dReq}</span><br><strong>🚚 수거: ${dCol}</strong>`;
                btnHtml = `<button class="ret-status-btn" style="background:#27ae60;">정산완료 처리</button>`;
                undoHtml = `<button class="btn-ret-undo" data-action="undo-collected">↩ 수거 취소</button>`;
            } else if (data.status === 'completed') {
                statusText = "🟢 정산완료";
                dateDisplay = `<span style="color:#999;">수거: ${dCol}</span><br><strong style="color:#27ae60;">💰 정산: ${dCom}</strong>`;
                btnHtml = `<button class="ret-status-btn" style="background:#95a5a6; cursor:default;" disabled>처리완료됨</button>`;
                undoHtml = `<button class="btn-ret-undo" data-action="undo-completed">↩ 정산 취소</button>`;
            }
            const imgIcon = data.imageUrl ? `<a href="${data.imageUrl}" target="_blank">📷</a>` : '';

            div.innerHTML = `
                <div class="ret-header"><div><div class="ret-name">${data.productName} ${imgIcon}</div><div class="ret-maker">${data.manufacturer||'-'}</div></div><div style="font-weight:bold; color:#e74c3c;">${data.supplier}</div></div>
                <div><span class="ret-badge">${data.pkgType==='box'?'📦 완통':'💊 낱알'}</span><span class="ret-badge">${data.qty}개</span><span class="ret-badge" style="background:#fff3cd;">${data.reason}</span></div>
                <div style="margin-top:10px; font-size:0.85rem; color:#555; line-height:1.4;">${dateDisplay}<div style="margin-top:5px; border-top:1px dashed #eee; padding-top:5px;">상태: ${statusText}</div></div>
                ${btnHtml}${undoHtml}
                <div style="text-align:right; margin-top:5px;"><button class="btn-delete-return" style="background:none; border:none; color:#ccc; cursor:pointer;">삭제</button></div>
            `;
            
            const nextBtn = div.querySelector('.ret-status-btn');
            if (!nextBtn.disabled) {
                nextBtn.onclick = async () => {
                    let next = data.status === 'requested' ? 'collected' : 'completed';
                    if (confirm("다음 단계로?")) {
                        const up = { status: next }; up[`dates.${next}`] = new Date();
                        await updateDoc(doc(db, "returns", data.id), up);
                    }
                };
            }
            const undoBtn = div.querySelector('.btn-ret-undo');
            if(undoBtn) undoBtn.onclick = async (e) => {
                const act = e.target.getAttribute('data-action');
                const prev = act === 'undo-collected' ? 'requested' : 'collected';
                if(confirm("되돌리시겠습니까?")) await updateDoc(doc(db, "returns", data.id), { status: prev });
            };
            div.querySelector('.btn-delete-return').onclick = async () => { if(confirm("삭제?")) await deleteDoc(doc(db, "returns", data.id)); };
            listContainer.appendChild(div);
        });
    });
}

/* ==========================================================================
   [9] 관리자 (상품 관리 - 단가/입수량 포함)
   ========================================================================== */
function renderAdminList(productsToRender) {
    const adminListContainer = document.getElementById('admin-product-list');
    const countEl = document.getElementById('admin-list-count');
    if(!adminListContainer) return;
    adminListContainer.innerHTML = ""; 
    if(countEl) countEl.textContent = `(${productsToRender.length}개)`;
    if(productsToRender.length === 0) { adminListContainer.innerHTML = "<li style='padding:20px; text-align:center;'>결과 없음</li>"; return; }
    productsToRender.sort((a, b) => a.name.localeCompare(b.name));
    productsToRender.forEach(item => {
        const li = document.createElement("li");
        li.style.padding = "15px"; li.style.borderBottom = "1px solid #eee"; li.style.display = "flex"; li.style.justifyContent = "space-between";
        let optionsHtml = item.options ? item.options.map(opt => `<span class="admin-option-tag">#${opt.name}</span>`).join("") : "";
        li.innerHTML = `<div style="flex:1;"><div style="font-weight:bold; color:#333; margin-bottom:5px;">[${item.category}] ${item.company} / ${item.name}</div><div>${optionsHtml}</div></div><div style="display:flex; gap:5px;"><button class="btn-edit-product" style="background:#f39c12; color:white; border:none; padding:5px; border-radius:4px;">수정</button><button class="btn-real-delete" data-id="${item.id}" style="background:#e74c3c; color:white; border:none; padding:5px; border-radius:4px;">삭제</button></div>`;
        li.querySelector('.btn-edit-product').onclick = () => { document.querySelector('.menu-item[data-target="product-mgmt"]').click(); startEditMode(item); };
        adminListContainer.appendChild(li);
    });
    document.querySelectorAll('.btn-real-delete').forEach(btn => btn.onclick = async (e) => { if(confirm("삭제?")) { await deleteDoc(doc(db, "products", e.target.dataset.id)); loadProducts(); } });
}
const adminSearchInput = document.getElementById('admin-product-search');
if(adminSearchInput) {
    adminSearchInput.addEventListener('input', (e) => {
        const k = e.target.value.toLowerCase();
        renderAdminList(allProductsData.filter(p => p.name.toLowerCase().includes(k) || p.company.toLowerCase().includes(k)));
    });
}
async function startEditMode(item) {
    editingProductId = item.id; 
    await loadSupplierDropdown();
    document.getElementById('reg-category').value = item.category;
    document.getElementById('reg-company').value = item.company;
    document.getElementById('reg-name').value = item.name;
    const container = document.getElementById('reg-options-container');
    container.innerHTML = ""; 
    if(item.options) item.options.forEach(opt => {
        const count = Number(opt.count) || 1;
        const unitPrice = Math.round(Number(opt.price) / count);
        window.addOptionRow(opt.name, count, unitPrice);
    }); else window.addOptionRow(); 
    document.getElementById('btn-register').textContent = "수정완료"; 
    document.getElementById('btn-cancel-edit').style.display = "inline-block";
    document.getElementById('product-form-body').scrollTop = 0;
}
document.getElementById('btn-cancel-edit').onclick = () => {
    editingProductId = null; document.getElementById('reg-name').value = "";
    document.getElementById('reg-options-container').innerHTML = ""; window.addOptionRow();
    document.getElementById('btn-register').textContent = "등록하기"; document.getElementById('btn-cancel-edit').style.display = "none";
};
const btnRegister = document.getElementById('btn-register');
if(btnRegister) {
    const newBtn = btnRegister.cloneNode(true);
    btnRegister.parentNode.replaceChild(newBtn, btnRegister);
    newBtn.addEventListener('click', async () => {
        const cat = document.getElementById('reg-category').value;
        const comp = document.getElementById('reg-company').value;
        const name = document.getElementById('reg-name').value;
        if(!cat || !comp || !name) { alert("기본 정보 입력 필요"); return; }
        const options = [];
        document.querySelectorAll('.option-input-row').forEach(row => {
            const optName = row.querySelector('.opt-name').value;
            const optCount = Number(row.querySelector('.opt-count').value) || 1;
            const unitPrice = Number(row.querySelector('.opt-price').value.replace(/,/g, ''));
            if(optName && unitPrice) options.push({ id: Date.now()+Math.random().toString(36).substr(2,5), name: optName, price: unitPrice*optCount, count: optCount });
        });
        if(options.length===0) { alert("옵션 입력 필요"); return; }
        const data = { category: cat, company: comp, name: name, options: options, code: Date.now().toString() };
        if(editingProductId) { await updateDoc(doc(db, "products", editingProductId), data); alert("수정됨"); editingProductId=null; newBtn.textContent="등록하기"; document.getElementById('btn-cancel-edit').style.display="none"; }
        else { await addDoc(collection(db, "products"), data); alert("등록됨"); }
        document.getElementById('reg-name').value = ""; document.getElementById('reg-options-container').innerHTML = ""; window.addOptionRow(); loadProducts();
    });
}
/* ==========================================================================
   [수정] 상품 등록용 거래처 드롭다운 (가나다 정렬 복구)
   ========================================================================== */
async function loadSupplierDropdown() {
    const select = document.getElementById('reg-company');
    if(!select) return;

    try {
        const snap = await getDocs(collection(db, "suppliers"));
        let suppliers = [];
        
        // 1. 데이터 가져오기
        snap.forEach(doc => suppliers.push(doc.data().name));

        // 2. [Fix] 가나다 순서 정렬 (여기가 핵심!)
        suppliers.sort((a, b) => a.localeCompare(b));

        // 3. HTML 생성
        let html = '<option value="">선택</option>';
        suppliers.forEach(name => html += `<option value="${name}">${name}</option>`);
        select.innerHTML = html;
        
    } catch(e) {
        console.error("거래처 목록 로드 실패:", e);
    }
}
// 옵션 행 추가 (Global)
window.addOptionRow = function(name="", count=1, price="") {
    const container = document.getElementById('reg-options-container');
    const div = document.createElement('div'); div.className = 'option-input-row';
    let displayPrice = price ? Number(price).toLocaleString() : "";
    div.innerHTML = `<input type="text" class="opt-name" placeholder="옵션명" value="${name}" style="flex:2;"><input type="number" class="opt-count" placeholder="입수" value="${count}" style="flex:1; text-align:center;"><input type="text" class="opt-price" placeholder="단가" value="${displayPrice}" style="flex:1.5; text-align:right;"><button class="btn-remove-row" onclick="this.parentElement.remove()">-</button>`;
    div.querySelector('.opt-price').addEventListener('input', function(e) { 
        let val = e.target.value.replace(/[^0-9]/g, ''); e.target.value = val ? Number(val).toLocaleString() : ""; 
    });
    container.appendChild(div);
};
document.getElementById('btn-add-option-row').onclick = () => window.addOptionRow();

const btnQuickSupOpen = document.getElementById('btn-quick-sup-open');
const quickSupModal = document.getElementById('quick-sup-modal');
const btnQuickSupSave = document.getElementById('btn-quick-sup-save');
if(btnQuickSupOpen) btnQuickSupOpen.onclick = (e) => { e.preventDefault(); quickSupModal.style.display='flex'; document.getElementById('quick-sup-name').value=''; };
document.getElementById('btn-quick-sup-cancel').onclick = () => quickSupModal.style.display='none';
if(btnQuickSupSave) {
    const newQBtn = btnQuickSupSave.cloneNode(true);
    btnQuickSupSave.parentNode.replaceChild(newQBtn, btnQuickSupSave);
    newQBtn.onclick = async () => {
        const name = document.getElementById('quick-sup-name').value.trim();
        if(!name) return;
        await addDoc(collection(db, "suppliers"), { name: name });
        alert("거래처 등록됨"); quickSupModal.style.display='none';
        await loadSupplierDropdown(); await loadSuppliers();
        // 반품창도 갱신
        const retSelect = document.getElementById('ret-supplier');
        if(retSelect) {
             const snap = await getDocs(collection(db, "suppliers"));
             let html = '<option value="">선택</option>';
             snap.forEach(doc => html += `<option value="${doc.data().name}">${doc.data().name}</option>`);
             retSelect.innerHTML = html;
             retSelect.value = name;
        }
        document.getElementById('reg-company').value = name;
    };
}

// [10] 달력 & 로그
function renderCalendar() {
    const grid = document.getElementById('calendar-grid'); const monthEl = document.getElementById('cal-current-month');
    if(!grid || !monthEl) return;
    grid.innerHTML = "";
    const year = calDate.getFullYear(); const month = calDate.getMonth(); 
    monthEl.textContent = `${year}.${String(month + 1).padStart(2, '0')}`;
    const firstDay = new Date(year, month, 1).getDay(); const lastDate = new Date(year, month + 1, 0).getDate(); 
    const today = new Date();
    
    for(let i=0; i<firstDay; i++) { const div = document.createElement('div'); div.className = 'calendar-date empty'; grid.appendChild(div); }
    for(let i=1; i<=lastDate; i++) {
        const div = document.createElement('div'); div.className = 'calendar-date'; div.textContent = i;
        const dateStr = `${year}-${String(month+1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        div.setAttribute('data-date', dateStr);
        if(today.getFullYear()===year && today.getMonth()===month && today.getDate()===i) div.classList.add('today');
        div.onclick = () => {
            document.querySelectorAll('.calendar-date').forEach(d => d.classList.remove('selected'));
            div.classList.add('selected'); selectedDateStr = dateStr; loadHistoryByDate(dateStr);
        };
        grid.appendChild(div);
    }
    // 데이터 점 찍기 (내 샵만)
    const startStr = `${year}-${String(month+1).padStart(2,'0')}-01`;
    const endStr = `${year}-${String(month+1).padStart(2,'0')}-31`;
    const q = query(collection(db, "order_history"), where("date", ">=", startStr), where("date", "<=", endStr));
    getDocs(q).then(snap => {
        const dates = new Set();
        snap.forEach(d => { if(d.data().shopId === SHOP_ID || (SHOP_ID==='main' && !d.data().shopId)) dates.add(d.data().date); });
        document.querySelectorAll('.calendar-date').forEach(el => { if(dates.has(el.getAttribute('data-date'))) el.classList.add('has-data'); });
    });
}
document.getElementById('cal-prev').onclick = () => { calDate.setMonth(calDate.getMonth()-1); renderCalendar(); };
document.getElementById('cal-next').onclick = () => { calDate.setMonth(calDate.getMonth()+1); renderCalendar(); };

async function loadHistoryByDate(dateStr) {
    const listContainer = document.getElementById('history-list');
    document.getElementById('history-title').textContent = `${dateStr} 주문 내역`;
    listContainer.innerHTML = "<div style='text-align:center;'>로딩중...</div>";
    const q = query(collection(db, "order_history"), where("date", "==", dateStr));
    const snapshot = await getDocs(q);
    listContainer.innerHTML = "";
    let docs = [];
    snapshot.forEach(doc => {
        if(doc.data().shopId === SHOP_ID || (SHOP_ID==='main' && !doc.data().shopId)) docs.push(doc.data());
    });
    if(docs.length===0) { listContainer.innerHTML = "<div style='text-align:center; padding:50px;'>기록 없음</div>"; return; }
    
    docs.sort((a,b)=>b.timestamp.seconds - a.timestamp.seconds);
    docs.forEach(data => {
        const div = document.createElement('div'); div.className = 'history-card';
        const time = formatShortTime(data.timestamp);
        let itemsHtml = "";
        data.items.forEach(i => itemsHtml += `<div>- ${i.product.name} (${i.product.company}) / ${i.optionName} x ${i.qty}</div>`);
        div.innerHTML = `<div class="history-time">⏰ ${time}</div><div style="font-size:0.9rem; color:#555;">${itemsHtml}</div>`;
        listContainer.appendChild(div);
    });
}

function subscribeToRecentLogs() {
    const logContainer = document.getElementById('completed-order-list');
    const q = query(collection(db, "order_history"), orderBy("timestamp", "desc"), limit(50));
    onSnapshot(q, (snapshot) => {
        logContainer.innerHTML = "";
        let list = [];
        snapshot.forEach(doc => { if(doc.data().shopId === SHOP_ID || (SHOP_ID==='main' && !doc.data().shopId)) list.push({id:doc.id, ...doc.data()}); });
        if(list.length===0) { logContainer.innerHTML = "<div style='padding:10px; color:#aaa;'>기록 없음</div>"; return; }
        
        list.forEach(data => {
            data.items.forEach(item => {
                const div = document.createElement('div'); div.className = 'log-item';
                div.innerHTML = `<div style="display:flex; align-items:center;"><span class="log-time">[${formatShortTime(data.timestamp)}]</span><strong>${item.product.name}</strong><span style="color:#666; margin-left:5px;">(${item.optionName} x ${item.qty})</span></div><div><span class="log-status">완료</span><button class="btn-log-restore">취소</button></div>`;
                div.querySelector('.btn-log-restore').onclick = async () => { if(confirm("취소?")) { cartItems.push(item); renderCart(item.optionId); await deleteDoc(doc(db, "order_history", data.id)); } };
                logContainer.appendChild(div);
            });
        });
    });
}

/* ==========================================================================
   [수정] 탭 전환 (상품관리 탭 초기화 버그 수정)
   ========================================================================== */
const menuItems = document.querySelectorAll('.menu-item');
const pages = document.querySelectorAll('.content-group');

menuItems.forEach(item => {
    item.addEventListener('click', () => {
        // 1. 메뉴 활성화 표시
        menuItems.forEach(menu => menu.classList.remove('active'));
        item.classList.add('active');
        
        // 2. 페이지 전환
        const targetId = item.getAttribute('data-target');
        pages.forEach(page => page.style.display = 'none');
        const targetPage = document.getElementById(`page-${targetId}`);
        if (targetPage) {
            const isFlex = ['order-book','order-mgmt','history-mgmt','supplier-mgmt','return-mgmt','product-mgmt'].includes(targetId);
            targetPage.style.display = isFlex ? 'flex' : 'block';
            if(targetId !== 'order-mgmt' && isFlex) targetPage.style.flexDirection = 'column';
        }
        
        // 3. 탭별 초기화 데이터 로드
        if(targetId === 'supplier-mgmt') loadSuppliers();
        
        if(targetId === 'history-mgmt') { 
            calDate = new Date(); 
            setTimeout(() => { 
                renderCalendar(); 
                loadHistoryByDate(`${calDate.getFullYear()}-${String(calDate.getMonth()+1).padStart(2,'0')}-${String(calDate.getDate()).padStart(2,'0')}`); 
            }, 100); 
        }
        
        // [핵심 수정] 상품 관리 탭 클릭 시 초기화
        if(targetId === 'product-mgmt') { 
            loadSupplierDropdown(); 
            // 수정 모드(`editingProductId`가 있음)가 아닐 때만 초기화
            if(!editingProductId) {
                document.getElementById('reg-name').value = ""; // 상품명 초기화
                document.getElementById('reg-options-container').innerHTML = ""; // [중요] 기존 옵션창 싹 비우기
                window.addOptionRow(); // 깨끗한 새 입력창 하나 추가
            }
        }
        
        window.scrollTo(0, 0); 
    });
});
// 초기 실행
loadProducts();
subscribeToRecentLogs();
subscribeToPhotoRequests();
subscribeToReturns();