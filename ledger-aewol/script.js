/* script.js - 최종 통합본 (양방향 계산 기능 복구 + 그리드 입력) */

// ▼▼▼ [1] Firebase 설정 (본인 키로 변경 필수!) ▼▼▼
const firebaseConfig = {
  apiKey: "AIzaSyBcMCqu39hwSw1Osm8Kd4GS5KMTG6BEgYA",
  authDomain: "pharmacy-ledger-fbca7.firebaseapp.com",
  projectId: "pharmacy-ledger-fbca7",
  storageBucket: "pharmacy-ledger-fbca7.firebasestorage.app",
  messagingSenderId: "243652172908",
  appId: "1:243652172908:web:a801ea5d71cdfec01fcc49"
};


if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
} else {
    firebase.app();
}

const db = firebase.firestore();
const storage = firebase.storage();

const COL_PENDING = "pending_uploads";
const COL_LEDGER = "transactions";

// 전역 변수
let pendingList = [];
let ledgerData = [];
let tempItems = []; // [NEW] write.html용 임시 품목 리스트
let currentSelectedId = null;
let currentScale = 1;

/* script.js - 모달 기능 & 거래처 자동완성 기능 */

// 1. 거래처 콤보박스(Filter) 자동 채우기
function updateVendorFilterOptions() {
    const select = document.getElementById('vendorFilter');
    if(!select) return;

    // 현재 선택된 값 기억 (새로고침해도 유지되게)
    const currentVal = select.value;

    // 데이터에서 중복 없이 거래처명 추출
    const vendors = new Set();
    ledgerData.forEach(item => {
        if(item.vendor) vendors.add(item.vendor);
    });

    // 옵션 초기화 (전체 거래처는 남김)
    select.innerHTML = '<option value="all">전체 거래처</option>';

    // 옵션 추가
    vendors.forEach(v => {
        const option = document.createElement('option');
        value = v;
        option.innerText = v;
        select.appendChild(option);
    });

    // 값 복구
    select.value = currentVal;
}
// =========================================
// [2] 초기화 및 리스너
// =========================================
document.addEventListener('DOMContentLoaded', function() {
    // 1. [NEW] 장부 페이지용: 현재 년월(YYYY-MM) 자동 설정
    const monthFilter = document.getElementById('monthFilter');
    if (monthFilter) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0'); // 01, 02... 형태로 변환
        monthFilter.value = `${year}-${month}`;
    }
    const dateInputs = document.querySelectorAll('input[type="date"]');
    dateInputs.forEach(input => { if(!input.value) input.valueAsDate = new Date(); });

    // A. 대기열 실시간 감시
    db.collection(COL_PENDING).orderBy("createdAt", "desc").onSnapshot((snapshot) => {
        pendingList = [];
        snapshot.forEach((doc) => pendingList.push({ id: doc.id, ...doc.data() }));
        updateDashboardCount();
        if(document.getElementById('queueList')) renderQueueList();
    });

    // B. 장부 데이터 실시간 감시
    db.collection(COL_LEDGER).orderBy("date", "asc").onSnapshot((snapshot) => {
        ledgerData = [];
        snapshot.forEach((doc) => ledgerData.push({ id: doc.id, ...doc.data() }));
        
        // 정렬: 날짜 오름차순 -> 등록순
        ledgerData.sort((a, b) => {
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            if (dateA - dateB !== 0) return dateA - dateB;
            const timeA = a.createdAt ? a.createdAt.seconds : 0;
            const timeB = b.createdAt ? b.createdAt.seconds : 0;
            return timeA - timeB;
        });

        if(document.getElementById('ledgerTableBody')) initLedgerPage();
        if(document.querySelector('.dashboard-body')) updateDashboardStats();

        updateVendorFilterOptions();
    });
});


// =========================================
// [3] write.html: 명세서 입력 로직
// =========================================
/* script.js의 renderQueueList 함수 교체 및 deleteQueueItem 추가 */

// 3-1. 대기열 표시 (삭제 버튼 추가됨)
function renderQueueList() {
    const listEl = document.getElementById('queueList');
    if(!listEl) return;
    listEl.innerHTML = '';

    if (pendingList.length === 0) {
        listEl.innerHTML = '<li style="padding:20px; text-align:center; color:#999;">대기 중인 명세서가 없습니다.</li>';
        return;
    }
    
    pendingList.forEach((item) => {
        const li = document.createElement('li');
        li.className = (item.id === currentSelectedId) ? 'queue-item active' : 'queue-item';
        
        // [구조 변경] 텍스트 영역(클릭 시 선택) + 삭제 버튼(클릭 시 삭제)
        const sub = item.fileName ? (item.fileName.length > 12 ? item.fileName.substr(0,10)+"..." : item.fileName) : '미확인';
        
        li.innerHTML = `
            <div class="q-info-area" onclick="selectItem('${item.id}')">
                <span class="q-title">명세서 <span style="font-size:0.8em;color:#aaa">#${item.id.substr(0,4)}</span></span>
                <span class="q-date">${item.date} • ${sub}</span>
            </div>
            <button class="btn-q-del" onclick="deleteQueueItem(event, '${item.id}')" title="목록에서 삭제">
                <i class="fas fa-trash-alt"></i>
            </button>
        `;
        listEl.appendChild(li);
    });
}

// [NEW] 대기열 항목 삭제 함수
async function deleteQueueItem(event, id) {
    // [중요] 부모의 onclick(선택) 이벤트가 실행되지 않도록 막음
    event.stopPropagation(); 

    if(!confirm("이 명세서를 대기 목록에서 삭제하시겠습니까?\n(복구할 수 없습니다)")) return;

    try {
        // Firestore 문서 삭제
        await db.collection(COL_PENDING).doc(id).delete();
        
        // 만약 현재 화면에 띄워져 있던 명세서를 삭제했다면? -> 화면 초기화
        if (id === currentSelectedId) {
            currentSelectedId = null;
            tempItems = [];
            document.getElementById('docImage').style.display = 'none';
            document.getElementById('docImage').src = '';
            document.getElementById('noSelectionMsg').style.display = 'block';
            
            // 입력 폼들도 싹 비워줌
            document.getElementById('inMemo').value = '';
            document.getElementById('inQty').value = '';
            document.getElementById('inSupply').value = '';
            document.getElementById('inVat').value = '';
            document.getElementById('inTotal').value = '';
            document.getElementById('itemTableBody').innerHTML = '';
            document.getElementById('sumSupply').innerText = '0';
            document.getElementById('sumVat').innerText = '0';
            document.getElementById('sumTotal').innerText = '0';
        }

        // 목록은 onSnapshot에 의해 자동 갱신됨
        // alert("삭제되었습니다."); // (선택사항) 너무 자주 뜨면 귀찮을 수 있어 생략 가능

    } catch(error) {
        console.error("삭제 실패:", error);
        alert("삭제 중 오류가 발생했습니다.");
    }
}

// 3-2. 명세서 선택
function selectItem(id) {
    currentSelectedId = id;
    const item = pendingList.find(p => p.id === id);
    if(!item) return;
    renderQueueList();

    const imgEl = document.getElementById('docImage');
    imgEl.src = item.img;
    imgEl.style.display = 'block';
    document.getElementById('noSelectionMsg').style.display = 'none';
    
    document.getElementById('dateInput').value = item.date;
    if(item.vendor) document.getElementById('vendorInput').value = item.vendor;
    
    // 리스트 초기화
    tempItems = [];
    renderItemTable();
    resetZoom();
    
    // 입력창 초기화
    document.getElementById('inMemo').value = '';
    document.getElementById('inQty').value = '';
    document.getElementById('inSupply').value = '';
    document.getElementById('inVat').value = '';
    document.getElementById('inTotal').value = '';
}

// 3-3. [추가] 버튼 클릭
function addItem() {
    if (!currentSelectedId) { alert("먼저 대기 목록에서 명세서를 선택해주세요."); return; }

    const memoEl = document.getElementById('inMemo');
    const qtyEl = document.getElementById('inQty');
    
    // [중요] 화면에 계산된 공급가/세액/합계 값을 그대로 가져옵니다.
    const supplyEl = document.getElementById('inSupply');
    const vatEl = document.getElementById('inVat');
    const totalEl = document.getElementById('inTotal');
    
    const total = parseInt(totalEl.value.replace(/,/g, '')) || 0;
    const supply = parseInt(supplyEl.value.replace(/,/g, '')) || 0;
    const vat = parseInt(vatEl.value.replace(/,/g, '')) || 0;
    
    if (total === 0) { alert("금액을 입력해주세요."); totalEl.focus(); return; }

    const qty = parseInt(qtyEl.value) || null;
    const memo = memoEl.value;

    tempItems.push({
        memo: memo,
        qty: qty,
        supply: supply,
        vat: vat,
        total: total
    });

    renderItemTable();
    
    // 초기화 및 포커스
    memoEl.value = '';
    qtyEl.value = '';
    supplyEl.value = '';
    vatEl.value = '';
    totalEl.value = '';
    memoEl.focus();
}

// 3-4. 리스트 렌더링
/* script.js의 renderItemTable 함수 교체 */

function renderItemTable() {
    const tbody = document.getElementById('itemTableBody');
    if(!tbody) return;

    // 1. 기존의 "입력 행(.input-row)"을 찾아서 따로 저장해둡니다.
    const inputRow = tbody.querySelector('.input-row');
    
    // 2. tbody를 비우되...
    tbody.innerHTML = '';
    
    // 3. 저장해둔 입력 행을 다시 맨 위에 붙입니다. (입력창 유지)
    if(inputRow) tbody.appendChild(inputRow);

    let sumSupply = 0, sumVat = 0, sumTotal = 0;

    // 4. 데이터 행들 추가 (입력 행 아래로 쌓임)
    tempItems.forEach((item, index) => {
        sumSupply += item.supply;
        sumVat += item.vat;
        sumTotal += item.total;

        const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding:0 10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${item.memo}">
                    ${item.memo || '-'}
                </td>
                
                <td class="text-right" style="padding-right:10px;">${item.qty ? item.qty.toLocaleString() : '-'}</td>
                <td class="text-right" style="padding-right:10px; color:#666;">${item.supply.toLocaleString()}</td>
                <td class="text-right" style="padding-right:10px; color:#666;">${item.vat.toLocaleString()}</td>
                <td class="text-right" style="padding-right:10px; font-weight:bold; color:#2563eb;">${item.total.toLocaleString()}</td>
                
                <td class="text-center">
                    <i class="fas fa-trash-alt" style="color:#ff6b6b; cursor:pointer;" onclick="removeItem(${index})"></i>
                </td>
            `;
            tbody.appendChild(tr);
    });

    // 합계 업데이트
    document.getElementById('sumSupply').innerText = sumSupply.toLocaleString();
    document.getElementById('sumVat').innerText = sumVat.toLocaleString();
    document.getElementById('sumTotal').innerText = sumTotal.toLocaleString();
}

// 3-5. 삭제 및 저장
function removeItem(index) {
    tempItems.splice(index, 1);
    renderItemTable();
}

async function saveAllItems() {
    if (tempItems.length === 0) { alert("저장할 품목이 없습니다."); return; }
    if (!confirm(`총 ${tempItems.length}건을 저장하시겠습니까?`)) return;

    const date = document.getElementById('dateInput').value;
    const type = document.getElementById('typeSelect').value;
    const vendor = document.getElementById('vendorInput').value;
    const pendingItem = pendingList.find(p => p.id === currentSelectedId);
    const imgUrl = pendingItem ? pendingItem.img : null;

    try {
        const batchPromises = [];
        tempItems.forEach(item => {
            const promise = db.collection(COL_LEDGER).add({
                date: date, type: type, vendor: vendor,
                memo: item.memo, qty: item.qty,
                supply: item.supply, vat: item.vat, total: item.total,
                img: imgUrl,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            batchPromises.push(promise);
        });
        await Promise.all(batchPromises);
        await db.collection(COL_PENDING).doc(currentSelectedId).delete();

        alert("저장되었습니다!");
        currentSelectedId = null;
        tempItems = [];
        document.getElementById('docImage').style.display = 'none';
        document.getElementById('noSelectionMsg').style.display = 'block';
        renderItemTable();
    } catch (e) { console.error(e); alert("오류 발생"); }
}


// =========================================
// [4] 양방향 자동 계산 함수 (여기가 안 되셨던 부분!)
// =========================================

// A. 합계 입력 시 -> 공급가, 세액 자동 계산
function calcInTotal() {
    const totalInput = document.getElementById('inTotal');
    const val = parseInt(totalInput.value.replace(/,/g, '')) || 0;
    
    if(val === 0) {
        document.getElementById('inSupply').value = '';
        document.getElementById('inVat').value = '';
        return;
    }
    const supply = Math.round(val / 1.1);
    const vat = val - supply;
    document.getElementById('inSupply').value = supply.toLocaleString();
    document.getElementById('inVat').value = vat.toLocaleString();
}

// B. 공급가 입력 시 -> 세액, 합계 자동 계산
function calcInSupply() {
    const supplyInput = document.getElementById('inSupply');
    const val = parseInt(supplyInput.value.replace(/,/g, '')) || 0;
    
    if(val === 0) return;
    const vat = Math.floor(val * 0.1);
    const total = val + vat;
    document.getElementById('inVat').value = vat.toLocaleString();
    document.getElementById('inTotal').value = total.toLocaleString();
}

// C. 세액 입력 시 -> 합계만 갱신 (공급가는 그대로 -> 단수 조정용)
function calcInVat() {
    const supplyInput = document.getElementById('inSupply');
    const vatInput = document.getElementById('inVat');
    
    const s = parseInt(supplyInput.value.replace(/,/g, '')) || 0;
    const v = parseInt(vatInput.value.replace(/,/g, '')) || 0;
    document.getElementById('inTotal').value = (s + v).toLocaleString();
}


// =========================================
// [5] ledger.html & index.html 공통 로직
// =========================================

function initLedgerPage() { 
    filterLedger(); 
    setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 100);
}

/* script.js - 페이징 기능이 포함된 장부 로직 */

// 전역 변수 추가
let currentPage = 1;
const itemsPerPage = 7; // 한 페이지당 7개씩

function filterLedger() {
    const vendorFilter = document.getElementById('vendorFilter').value;
    const monthFilter = document.getElementById('monthFilter').value;
    const tableBody = document.getElementById('ledgerTableBody');
    if (!tableBody) return;

    // 1. 전체 데이터 필터링 (날짜 & 거래처)
    let filteredData = ledgerData.filter(item => {
        const dateMatch = monthFilter ? item.date.startsWith(monthFilter) : true;
        const vendorMatch = vendorFilter === 'all' || item.vendor === vendorFilter;
        return dateMatch && vendorMatch;
    });

    // 2. 상단 요약(합계) 계산 - *페이지 상관없이 전체 합계*
    let sumBuy=0, sumPay=0, sumReturn=0;
    filteredData.forEach(item => {
        if (item.type === 'buy') sumBuy += item.total;
        else if (item.type === 'pay') sumPay += Math.abs(item.total);
        else if (item.type === 'return') sumReturn += Math.abs(item.total);
    });
    const totalBalance = sumBuy - sumReturn - sumPay;

    document.getElementById('sumBuy').innerText = (sumBuy - sumReturn).toLocaleString();
    document.getElementById('sumPay').innerText = sumPay.toLocaleString();
    document.getElementById('sumBalance').innerText = totalBalance.toLocaleString();


    // 3. 페이지네이션 처리 (데이터 자르기)
    const totalPages = Math.ceil(filteredData.length / itemsPerPage);
    
    // 현재 페이지가 범위 벗어나지 않게 조정
    if (currentPage > totalPages) currentPage = totalPages || 1; 
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedItems = filteredData.slice(startIndex, endIndex);


    // 4. 테이블 그리기 (잘린 데이터만)
    tableBody.innerHTML = '';
    
    if (filteredData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding:50px; color:#999;">내역이 없습니다.</td></tr>';
        renderPagination(0); // 페이지 버튼 숨김
        return;
    }

    // 잔액 계산용 (화면에 보이는 리스트의 잔액은 전체 누적잔액을 따라가야 함)
    // -> 이 부분은 조금 복잡한데, 편의상 '단순 리스트'만 보여주거나, 
    //    정확한 회계 잔액을 위해서는 전체 데이터를 순회하며 잔액을 계산한 뒤 잘라야 함.
    //    여기서는 '필터링된 전체 데이터' 기준으로 잔액을 미리 계산해두고 자르겠습니다.

    let runningBalance = 0;
    // 전체 데이터를 돌면서 잔액을 미리 계산해둠
    const dataWithBalance = filteredData.map(item => {
        let amt = 0;
        if (item.type === 'buy') amt = item.total;
        else if (item.type === 'pay') amt = -Math.abs(item.total);
        else if (item.type === 'return') amt = -Math.abs(item.total);
        runningBalance += amt;
        return { ...item, currentBalance: runningBalance }; // 잔액 포함된 객체
    });

    // 계산된 데이터에서 페이지 분량만큼 자름
    const displayData = dataWithBalance.slice(startIndex, endIndex);

    displayData.forEach(item => {
        // ... (기존 테이블 렌더링 로직 동일) ...
        let displayIn = item.type === 'buy' ? `<span style="color:#2563eb; font-weight:bold;">${Math.abs(item.total).toLocaleString()}</span>` : '<span style="color:#eee;">-</span>';
        let displayOut = item.type !== 'buy' ? `<span style="color:#dc2626; font-weight:bold;">${Math.abs(item.total).toLocaleString()}</span>` : '<span style="color:#eee;">-</span>';
        // ▼▼▼ [수정] 구분(Type)에 뱃지 적용 ▼▼▼
        let typeBadge = '';
        if (item.type === 'buy') {
            typeBadge = '<span class="badge buy">입고</span>';
        } else if (item.type === 'pay') {
            typeBadge = '<span class="badge pay">결제</span>';
        } else if (item.type === 'return') {
            typeBadge = '<span class="badge return">반품</span>';
        }
        let imgIcon = item.img ? `<a href="${item.img}" target="_blank"><i class="fas fa-image" style="cursor:pointer; color:#555;"></i></a>` : '<span style="color:#eee">-</span>';

        const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.date}</td>
                
                <td style="text-align:center;">${typeBadge}</td>
                
                <td>${item.vendor}</td>
                <td title="${item.memo || ''}">${item.memo || ''}</td>
                <td class="text-right">${item.qty ? item.qty.toLocaleString() : '-'}</td>
                <td class="text-right" style="color:#888">${item.supply ? item.supply.toLocaleString() : '-'}</td>
                <td class="text-right" style="color:#888">${item.vat ? item.vat.toLocaleString() : '-'}</td>
                <td class="text-right" style="background:#f0f9ff;">${displayIn}</td>
                <td class="text-right" style="background:#fffcfc;">${displayOut}</td>
                <td class="text-right" style="font-weight:bold; color:#333;">${item.currentBalance.toLocaleString()}</td>
                <td style="text-align:center;">${imgIcon}</td>
                <td style="text-align:center;">
                    <button class="btn-xs" onclick="openEditModal('${item.id}')">
                        수정
                    </button>
                </td>
            `;
            tableBody.appendChild(tr);
});

    // 5. 페이지네이션 버튼 그리기
    renderPagination(totalPages);
}

// 페이지네이션 버튼 렌더링 함수
function renderPagination(totalPages) {
    const container = document.getElementById('paginationControls');
    if (!container) return;
    container.innerHTML = '';

    if (totalPages <= 1) return; // 1페이지뿐이면 버튼 안 보여줌

    // 이전 버튼
    const prevBtn = document.createElement('button');
    prevBtn.className = 'page-btn';
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => changePage(currentPage - 1);
    container.appendChild(prevBtn);

    // 페이지 번호
    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
        btn.innerText = i;
        btn.onclick = () => changePage(i);
        container.appendChild(btn);
    }

    // 다음 버튼
    const nextBtn = document.createElement('button');
    nextBtn.className = 'page-btn';
    nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => changePage(currentPage + 1);
    container.appendChild(nextBtn);
}

// 페이지 변경 함수
function changePage(page) {
    currentPage = page;
    filterLedger(); // 다시 그리기
}

// 수정 모달 기능 (생략 없이 전체 포함)
/* script.js - 모달 관련 함수 */

// 모달 열기
function openEditModal(id) {
    const item = ledgerData.find(d => d.id === id);
    if(!item) return;

    // 데이터 채우기
    document.getElementById('editId').value = item.id;
    document.getElementById('editDate').value = item.date;
    document.getElementById('editType').value = item.type;
    document.getElementById('editVendor').value = item.vendor;
    document.getElementById('editMemo').value = item.memo || '';
    document.getElementById('editQty').value = item.qty || '';
    document.getElementById('editTotal').value = item.total.toLocaleString();
    document.getElementById('editSupply').value = item.supply ? item.supply.toLocaleString() : '';
    document.getElementById('editVat').value = item.vat ? item.vat.toLocaleString() : '';

    // 사진 처리
    const imgArea = document.getElementById('currentImgArea');
    const imgLink = document.getElementById('currentImgLink');
    const imgThumb = document.getElementById('currentImgThumb');
    
    if(item.img) {
        imgArea.style.display = 'block';
        imgLink.href = item.img;
        imgThumb.src = item.img;
    } else {
        imgArea.style.display = 'none';
    }

    // ★★★ [핵심] display: none을 flex로 바꿔서 보이게 함 ★★★
    const modal = document.getElementById('editModal');
    modal.style.display = 'flex'; 
}

// 모달 닫기
function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
}

// 배경 클릭 시 닫기
window.onclick = function(event) {
    const modal = document.getElementById('editModal');
    if (event.target == modal) {
        modal.style.display = "none";
    }
}
async function updateItem() {
    const id = document.getElementById('editId').value;
    const date = document.getElementById('editDate').value;
    const type = document.getElementById('editType').value;
    const vendor = document.getElementById('editVendor').value;
    const memo = document.getElementById('editMemo').value;
    const qty = parseInt(document.getElementById('editQty').value) || null;
    const total = parseInt(document.getElementById('editTotal').value.replace(/,/g, '')) || 0;
    const supply = parseInt(document.getElementById('editSupply').value.replace(/,/g, '')) || 0;
    const vat = parseInt(document.getElementById('editVat').value.replace(/,/g, '')) || 0;
    
    const fileInput = document.getElementById('editFileInput');
    let imgUrl = null;
    if(fileInput.files.length > 0) {
        if(!confirm("새 사진을 업로드하시겠습니까?")) return;
        try {
            let file = fileInput.files[0];
            const options = { maxSizeMB: 0.2, maxWidthOrHeight: 1280, useWebWorker: true, fileType: 'image/jpeg' };
            try { if(typeof imageCompression !== 'undefined') file = await imageCompression(file, options); } catch(e) {}
            const fileName = `invoices/${Date.now()}_edited.jpg`;
            const snapshot = await storage.ref().child(fileName).put(file);
            imgUrl = await snapshot.ref.getDownloadURL();
        } catch(e) { console.error(e); alert("실패"); return; }
    }
    const updateData = { date, type, vendor, memo, qty, supply, vat, total };
    if(imgUrl) updateData.img = imgUrl;
    db.collection(COL_LEDGER).doc(id).update(updateData).then(() => { alert("수정 완료"); closeEditModal(); });
}
function deleteItem() {
    if(!confirm("삭제하시겠습니까?")) return;
    db.collection(COL_LEDGER).doc(document.getElementById('editId').value).delete().then(() => { alert("삭제 완료"); closeEditModal(); });
}
function calcEditTotal() {
    const val = parseInt(document.getElementById('editTotal').value.replace(/,/g, '')) || 0;
    if(val===0) return;
    document.getElementById('editSupply').value = Math.round(val/1.1).toLocaleString();
    document.getElementById('editVat').value = (val - Math.round(val/1.1)).toLocaleString();
}
function calcEditSupply() {
    const val = parseInt(document.getElementById('editSupply').value.replace(/,/g, '')) || 0;
    if(val===0) return;
    const vat = Math.floor(val*0.1);
    document.getElementById('editVat').value = vat.toLocaleString();
    document.getElementById('editTotal').value = (val+vat).toLocaleString();
}
function calcEditVat() {
    const s = parseInt(document.getElementById('editSupply').value.replace(/,/g, '')) || 0;
    const v = parseInt(document.getElementById('editVat').value.replace(/,/g, '')) || 0;
    document.getElementById('editTotal').value = (s+v).toLocaleString();
}

// [5] 유틸 및 대시보드
// [script.js] updateDashboardStats 함수 (한 줄 출력 + 수량 강조)

function updateDashboardStats() {
    // 1. 상단 통계 박스 계산 (기존 로직 유지)
    let sumBuy = 0, sumPay = 0, sumReturn = 0;
    ledgerData.forEach(item => {
        if (item.type === 'buy') sumBuy += item.total;
        else if (item.type === 'pay') sumPay += Math.abs(item.total);
        else if (item.type === 'return') sumReturn += Math.abs(item.total);
    });
    const balance = sumBuy - sumReturn - sumPay;
    const boxes = document.querySelectorAll('.stat-box h2');
    if(boxes.length >= 3) {
        boxes[0].innerText = (sumBuy - sumReturn).toLocaleString();
        boxes[1].innerText = sumPay.toLocaleString();
        boxes[2].innerText = balance.toLocaleString();
    }

    // 2. 하단 리스트 그리기 (한 줄 레이아웃 적용)
    const recentListEl = document.getElementById('recentList');
    if(recentListEl) {
        recentListEl.innerHTML = '';
        const recentItems = ledgerData.slice().reverse().slice(0, 5); // 최신 5개
        
        if(recentItems.length === 0) {
            recentListEl.innerHTML = '<li style="padding:30px; text-align:center; color:#999;">최근 거래 내역이 없습니다.</li>';
        }

        recentItems.forEach(item => {
            // 색상 및 부호
            let sign = item.type === 'buy' ? '+' : '-';
            let colorStyle = item.type === 'buy' ? 'color:#2563eb' : 'color:#dc2626';
            
            // 데이터 준비
            const vendor = item.vendor || '-';
            const memo = item.memo || ''; // 적요 없으면 공란
            
            // 수량 표시 (값이 있을 때만 뱃지 생성)
            let qtyHtml = '';
            if(item.qty && item.qty > 0) {
                // 뱃지 디자인 적용
                qtyHtml = `<span class="qty-badge">${item.qty}개</span>`;
            }

            const li = document.createElement('li');
            li.className = 't-item';
            
            // ▼▼▼ [핵심] 한 줄(Flex) 구조로 HTML 생성 ▼▼▼
            li.innerHTML = `
                <div class="t-date">${item.date.substr(5)}</div>
                <div class="t-vendor">${vendor}</div>
                <div class="t-desc">${memo}</div>
                ${qtyHtml} <div class="t-amount" style="${colorStyle}">${sign}${Math.abs(item.total).toLocaleString()}</div>
            `;
            recentListEl.appendChild(li);
        });
    }
}
function updateDashboardCount() {
    const c = pendingList.length;
    const el = document.querySelector('.alert-info strong'); if(el) el.innerText = `${c}건`;
    const el2 = document.getElementById('queueCount'); if(el2) el2.innerText = c;
}
/* script.js - index.html 파일 업로드 함수 (전문적인 멘트 + 이동 선택) */

async function handleFileUpload(input) {
    const files = input.files;
    if (files.length === 0) return;

    // [수정 1] 정중한 업로드 확인 멘트
    const msg = `선택하신 ${files.length}장의 영수증 이미지를 업로드하시겠습니까?\n(이미지 압축 과정이 포함됩니다)`;
    if(!confirm(msg)) {
        input.value = ''; // 취소 시 파일 선택 초기화
        return;
    }

    const btnLabel = document.querySelector('.fab-btn');
    const originalIcon = btnLabel.innerHTML;
    
    // 로딩 표시도 좀 더 있어 보이게
    btnLabel.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 처리 중...'; 
    btnLabel.style.fontSize = "0.9rem";

    try {
        const today = new Date().toISOString().split('T')[0];
        const promises = [];
        // ▼▼▼ [수정 설정] 1MB로 완화 + 해상도는 FHD급 유지 ▼▼▼
        const options = { 
            maxSizeMB: 1.0,          // 1MB 이하로 (속도 대폭 향상)
            maxWidthOrHeight: 1920,  // 해상도는 조금 더 좋게 (글씨 선명도 확보)
            useWebWorker: true,      // 별도 스레드 사용 (화면 멈춤 방지)
            fileType: 'image/jpeg'
        };

        for (let i = 0; i < files.length; i++) {
            let file = files[i];
            
            // 이미지 압축 시도
            try { 
                if(typeof imageCompression !== 'undefined') {
                    file = await imageCompression(file, options);
                }
            } catch (e) {
                console.warn("압축 건너뜀:", e);
            }

            const fileName = `invoices/${Date.now()}_${i}.jpg`;
            
            // Storage 업로드 -> Firestore 등록
            const uploadTask = storage.ref().child(fileName).put(file)
                .then(snapshot => snapshot.ref.getDownloadURL())
                .then(url => {
                    return db.collection(COL_PENDING).add({
                        date: today, 
                        vendor: '', 
                        img: url, 
                        fileName: `scan_${i+1}.jpg`, 
                        isNew: true, 
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                });
            promises.push(uploadTask);
        }

        await Promise.all(promises);

        // [수정 2] 완료 후 이동 여부 묻기 (가장 중요한 UX 개선)
        const nextAction = confirm(
            "✅ 업로드가 정상적으로 완료되었습니다.\n\n" +
            "바로 [상세 입력 화면]으로 이동하시겠습니까?\n" +
            "(취소를 누르면 현재 화면에 머물러 추가 업로드를 할 수 있습니다.)"
        );

        if(nextAction) {
            location.href = 'write.html';
        } else {
            // 안 이동할 거면 파일 입력창만 비워줌 (연속 업로드 가능하게)
            input.value = '';
            // 대시보드 숫자 갱신을 위해(혹시 모르니) 잠시 대기 후 리로드 없이 카운트만 갱신되면 좋겠지만,
            // 현재 구조상 자동 갱신되므로 input만 비우면 됨.
        }

    } catch (error) {
        console.error(error);
        alert("죄송합니다. 업로드 처리 중 오류가 발생했습니다.\n잠시 후 다시 시도해 주세요.");
    } finally {
        // 버튼 상태 복구
        btnLabel.innerHTML = originalIcon;
        btnLabel.style.fontSize = "";
    }
}
function formatCurrency(input) { let v = input.value.replace(/,/g, ''); if(!isNaN(v) && v!=="") input.value = parseInt(v).toLocaleString(); }
function togglePaymentField() { document.getElementById('paymentMethodGroup').style.display = document.getElementById('typeSelect').value === 'pay' ? 'block' : 'none'; }
/* script.js 맨 하단 줌 관련 함수 교체 */

function zoomIn() { 
    currentScale += 0.5; // 한 번 누를 때마다 50%씩 팍팍 커지게 (기존 0.2는 답답함)
    applyZoom(); 
}

function zoomOut() { 
    if (currentScale > 1) { // 1배율(기본)보다 작아지지는 않게
        currentScale -= 0.5; 
        if(currentScale < 1) currentScale = 1;
    }
    applyZoom(); 
}

function resetZoom() { 
    currentScale = 1; 
    applyZoom(); 
}

function applyZoom() { 
    const img = document.getElementById('docImage'); 
    if(!img) return;
    
    // [핵심 변경] transform 대신 실제 height 값을 변경합니다.
    // scale 1.0 -> height: 100% (화면에 딱 맞음)
    // scale 1.5 -> height: 150% (화면보다 1.5배 길어짐 -> 스크롤 생김)
    
    if (currentScale === 1) {
        img.style.height = '100%';
        img.style.width = 'auto';
        img.style.maxWidth = '100%'; // 가로가 너무 넓은 사진 방지
        img.style.transform = 'none'; // 기존 transform 제거
    } else {
        img.style.height = (currentScale * 100) + '%'; 
        img.style.width = 'auto';
        img.style.maxWidth = 'none'; // 확대했을 땐 제한 해제
        img.style.transform = 'none'; // 기존 transform 제거
    }
}

/* script.js - 퀵등록 및 자동계산 로직 */

// 1. 퀵등록 추가 함수 (버튼 클릭 시 실행)
async function addQuickItem() {
    const date = document.getElementById('qDate').value;
    const type = document.getElementById('qType').value;
    const vendor = document.getElementById('qVendor').value;
    const memo = document.getElementById('qMemo').value;
    const qty = parseInt(document.getElementById('qQty').value) || null;
    
    // 금액 관련 (콤마 제거 후 정수 변환)
    const supply = parseInt(document.getElementById('qSupply').value.replace(/,/g, '')) || 0;
    const vat = parseInt(document.getElementById('qVat').value.replace(/,/g, '')) || 0;
    const total = parseInt(document.getElementById('qTotal').value.replace(/,/g, '')) || 0;

    if (!date || !vendor || total === 0) {
        alert("날짜, 거래처, 금액은 필수입니다.");
        return;
    }

    try {
        await db.collection(COL_LEDGER).add({
            date: date,
            type: type,
            vendor: vendor,
            memo: memo,
            qty: qty,
            supply: supply,
            vat: vat,
            total: total,
            img: null, // 퀵등록은 사진 없음
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // 입력창 초기화
        document.getElementById('qVendor').value = '';
        document.getElementById('qMemo').value = '';
        document.getElementById('qQty').value = '';
        document.getElementById('qSupply').value = '';
        document.getElementById('qVat').value = '';
        document.getElementById('qTotal').value = '';
        document.getElementById('qVendor').focus(); // 연속 입력을 위해 포커스

        alert("추가되었습니다."); // 필요 없으면 삭제 가능

    } catch (e) {
        console.error(e);
        alert("저장 실패");
    }
}

// 2. 퀵등록 자동 계산 로직 (write.html과 동일한 방식)
function calcQuickTotal() {
    const val = parseInt(document.getElementById('qTotal').value.replace(/,/g, '')) || 0;
    if(val === 0) return;
    const supply = Math.round(val / 1.1);
    const vat = val - supply;
    document.getElementById('qSupply').value = supply.toLocaleString();
    document.getElementById('qVat').value = vat.toLocaleString();
}

function calcQuickSupply() {
    const val = parseInt(document.getElementById('qSupply').value.replace(/,/g, '')) || 0;
    if(val === 0) return;
    const vat = Math.floor(val * 0.1);
    const total = val + vat;
    document.getElementById('qVat').value = vat.toLocaleString();
    document.getElementById('qTotal').value = total.toLocaleString();
}

function calcQuickVat() {
    const s = parseInt(document.getElementById('qSupply').value.replace(/,/g, '')) || 0;
    const v = parseInt(document.getElementById('qVat').value.replace(/,/g, '')) || 0;
    document.getElementById('qTotal').value = (s + v).toLocaleString();
}

// 3. 결제/반품 선택 시 스타일 변경 (선택 사항)
function toggleQuickPayment() {
    const type = document.getElementById('qType').value;
    const totalInput = document.getElementById('qTotal');
    if(type === 'pay' || type === 'return') {
        totalInput.style.color = '#dc2626'; // 빨강
    } else {
        totalInput.style.color = '#2563eb'; // 파랑
    }
}
// script.js - loadQueueList 함수 부분
/**
 * 대기 목록을 불러오고 클릭 시 이미지를 표시하는 메인 함수
 */
/**
 * 대기 목록 로드 (중복 실행 및 데이터 증발 방지 버전)
 */
function loadQueueList() {
    const queueList = document.getElementById('queueList');
    const countBadge = document.getElementById('queueCount');
    if (!queueList) return;

    // 기존 리스너가 있다면 중복 방지를 위해 초기화 (onSnapshot은 실시간이라 한 번만 걸면 됩니다)
    if (window.queueListener) window.queueListener(); 

    window.queueListener = db.collection('queues')
        .orderBy('timestamp', 'desc')
        .onSnapshot((snapshot) => {
            // 데이터가 들어왔을 때만 화면을 비우고 다시 그립니다.
            if (snapshot.empty) {
                queueList.innerHTML = '<li style="padding:20px; text-align:center; color:#999;">대기 중인 명세서가 없습니다.</li>';
                if (countBadge) countBadge.innerText = '0';
                return;
            }

            // 목록 그리기 시작
            let listHtml = '';
            snapshot.forEach((doc) => {
                const item = doc.data();
                const id = doc.id;
                
                // HTML을 일단 문자열로 다 만든 뒤 한 번에 박아야 깜빡임이 적습니다.
                listHtml += `
                    <li class="queue-item" data-id="${id}">
                        <div class="q-info-area">
                            <span class="q-title">명세서 #${id.substring(0,4)}</span>
                            <span class="q-date">${item.date || '날짜 없음'}</span>
                        </div>
                        <button class="btn-q-del" onclick="deleteQueue('${id}', event)">
                            <i class="fas fa-trash"></i>
                        </button>
                    </li>
                `;
            });
            
            queueList.innerHTML = listHtml;
            if (countBadge) countBadge.innerText = snapshot.size;

            // 각 아이템에 클릭 이벤트 바인딩
            document.querySelectorAll('.queue-item').forEach(li => {
                li.addEventListener('click', () => {
                    const docId = li.getAttribute('data-id');
                    const selectedDoc = snapshot.docs.find(d => d.id === docId);
                    if (selectedDoc) {
                        selectItem(selectedDoc.data(), li);
                    }
                });
            });
        }, (error) => {
            console.error("Firebase Snapshot Error:", error);
        });
}

/**
 * 아이템 선택 및 이미지 표시 (중복 제거를 위해 분리)
 */
function selectItem(item, li) {
    document.querySelectorAll('.queue-item').forEach(el => el.classList.remove('active'));
    li.classList.add('active');

    const imgTag = document.getElementById('scanImageWide');
    const noImgText = document.getElementById('noImageText');

    if (imgTag) {
        if (item.img) {
            imgTag.src = item.img;
            imgTag.style.display = 'block';
            if (noImgText) noImgText.style.display = 'none';
        } else {
            imgTag.src = "";
            imgTag.style.display = 'none';
            if (noImgText) noImgText.style.display = 'flex';
        }
    }

    // 날짜 입력
    const dateInput = document.getElementById('writeDate');
    if (dateInput) dateInput.value = item.date || "";

    // 테이블 초기화 및 첫 줄 추가
    const tbody = document.getElementById('itemListBody');
    if (tbody) {
        tbody.innerHTML = '';
        addTableRow();
    }
}
// 아이템 선택 시 실행되는 함수
function selectItem(item, targetLi) {
    // 1. 모든 아이템에서 active 클래스 제거 후 선택된 것에만 추가
    document.querySelectorAll('.queue-item').forEach(el => el.classList.remove('active'));
    if (targetLi) targetLi.classList.add('active');

    // 2. 이미지 태그 찾기 (ID를 다시 한번 확인하세요)
    const imgTag = document.getElementById('scanImageWide');
    const noImgText = document.getElementById('noImageText');

    if (!imgTag) {
        console.error("ID가 'scanImageWide'인 이미지 태그를 찾을 수 없습니다.");
        return;
    }

    if (item.img) {
        // 이미지가 있을 때
        imgTag.src = item.img;
        imgTag.style.display = 'block';
        if (noImgText) noImgText.style.display = 'none';
    } else {
        // 이미지가 없을 때
        imgTag.src = '';
        imgTag.style.display = 'none';
        if (noImgText) noImgText.style.display = 'flex';
    }

    // 3. 날짜 등 기본 정보 채우기
    if(document.getElementById('writeDate')) {
        document.getElementById('writeDate').value = item.date || "";
    }
}


/**
 * 품목 입력 테이블에 새로운 행을 추가하는 함수
 */
function addTableRow() {
    const tbody = document.getElementById('itemListBody');
    if (!tbody) return;

    const tr = document.createElement('tr');
    tr.className = 'input-row';
    
    // 행 구조 정의 (적요, 수량, 공급가, 세액, 합계, 삭제버튼)
    tr.innerHTML = `
        <td><input type="text" class="item-memo text-left" placeholder="품목명 또는 적요 입력"></td>
        <td><input type="number" class="item-qty" value="1" oninput="calculateRow(this)"></td>
        <td><input type="text" class="item-supply money-input" placeholder="0" oninput="formatAndCalculate(this)"></td>
        <td><input type="text" class="item-vat money-input" placeholder="0" oninput="formatAndCalculate(this)"></td>
        <td><input type="text" class="item-total money-input" placeholder="0" readonly></td>
        <td class="text-center">
            <button type="button" class="btn-xs" onclick="removeTableRow(this)" style="color:#dc2626;">
                <i class="fas fa-minus-circle"></i>
            </button>
        </td>
    `;
    
    tbody.appendChild(tr);
}

/**
 * 행 삭제 함수
 */
function removeTableRow(btn) {
    const tr = btn.closest('tr');
    if (tr) {
        tr.remove();
        updateGrandTotal(); // 삭제 후 전체 합계 재계산
    }
}

/**
 * 금액 포맷팅 및 계산 트리거
 */
function formatAndCalculate(input) {
    // 숫자 외 제거 및 콤마 포맷팅
    let val = input.value.replace(/[^0-9]/g, "");
    if (val) {
        input.value = Number(val).toLocaleString();
    }
    calculateRow(input);
}

/**
 * 개별 행 합계 계산
 */
function calculateRow(element) {
    const tr = element.closest('tr');
    const qty = parseFloat(tr.querySelector('.item-qty').value) || 0;
    const supply = parseInt(tr.querySelector('.item-supply').value.replace(/,/g, "")) || 0;
    const vat = parseInt(tr.querySelector('.item-vat').value.replace(/,/g, "")) || 0;
    
    const total = supply + vat;
    tr.querySelector('.item-total').value = total.toLocaleString();
    
    updateGrandTotal(); // 전체 합계 업데이트
}

/**
 * 테이블 전체 합계 계산 (화면 하단 요약 업데이트)
 */
function updateGrandTotal() {
    let totalSupply = 0;
    let totalVat = 0;

    document.querySelectorAll('.input-row').forEach(row => {
        const supply = parseInt(row.querySelector('.item-supply').value.replace(/,/g, "")) || 0;
        const vat = parseInt(row.querySelector('.item-vat').value.replace(/,/g, "")) || 0;
        totalSupply += supply;
        totalVat += vat;
    });

    const grandTotal = totalSupply + totalVat;

    // 화면 업데이트
    if (document.getElementById('totalSupply')) document.getElementById('totalSupply').innerText = totalSupply.toLocaleString();
    if (document.getElementById('totalVat')) document.getElementById('totalVat').innerText = totalVat.toLocaleString();
    if (document.getElementById('grandTotal')) document.getElementById('grandTotal').innerText = grandTotal.toLocaleString();
}