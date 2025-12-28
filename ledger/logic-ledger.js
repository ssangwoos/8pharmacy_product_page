let currentPage = 1;
const itemsPerPage = 10;
let allData = []; // 필터링된 전체 데이터를 담을 변수

// [데이터 호출 함수] 거래처 선택 시 해당 데이터만 DB에서 쿼리하여 최적화
async function loadLedgerData() {
    const tableBody = document.getElementById('ledgerTableBody');
    const vendorFilter = document.getElementById('vendorFilter').value;

    if (!tableBody) return;
    
    // [변경] 거래처를 선택하지 않았을 때의 처리
    if (vendorFilter === 'none') {
        tableBody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding:50px; color:#666;">🔎 조회하실 <b>거래처를 선택</b>해 주세요.</td></tr>';
        return;
    }

    tableBody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding:20px;">데이터를 불러오는 중...</td></tr>';

    try {
        let query = db.collection("transactions");
        if (vendorFilter !== 'all') {
            query = query.where("vendor", "==", vendorFilter);
        }

        // 지금 생성 중인 색인이 완료되어야 이 부분이 에러 없이 작동합니다.
        const snapshot = await query.orderBy("date", "asc").orderBy("createdAt", "asc").get();
        allData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        currentPage = 1;
        renderLedger(); // 기존에 만든 렌더링 함수 호출

    } catch (e) {
        console.error("데이터 로드 오류:", e);
        tableBody.innerHTML = `<tr><td colspan="12" style="text-align:center; color:red; padding:20px;">데이터 로드 실패: 색인이 아직 생성 중일 수 있습니다. 5분 후 다시 시도해 주세요.</td></tr>`;
    }
}

// [화면 렌더링 함수] 10개씩 페이징하며 하단이 최신이게 정렬
function renderLedger() {
    const tableBody = document.getElementById('ledgerTableBody');
    const start = document.getElementById('startDate')?.value || '';
    const end = document.getElementById('endDate')?.value || '';

    // 기간 필터링
    let filtered = allData.filter(item => (!start || item.date >= start) && (!end || item.date <= end));

    // 페이징 계산 (최신 10개가 1페이지)
    const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
    const reversed = [...filtered].reverse(); 
    const startIndex = (currentPage - 1) * itemsPerPage;
    const pageItems = reversed.slice(startIndex, startIndex + itemsPerPage);
    const finalDisplayItems = pageItems.reverse(); // 하단이 최신이게 재정렬

    let html = '';
    let totalBuy = 0, totalPay = 0, runningBalance = 0;

    // 잔액은 전체 데이터를 기준으로 순차 계산
    filtered.forEach(item => {
        const amount = Number(item.total) || 0;
        const isBuy = (item.type === 'buy');
        if (isBuy) { totalBuy += amount; runningBalance += amount; }
        else { totalPay += amount; runningBalance -= amount; }

        if (finalDisplayItems.some(p => p.id === item.id)) {
            html += `
                <tr class="ledger-row">
                    <td style="text-align:center;">${item.date}</td>
                    <td style="text-align:center;">${getBadgeHtml(item.type)}</td>
                    <td style="text-align:center;">${item.vendor}</td>
                    <td style="text-align:left; padding-left:10px;">${item.memo || ''}</td>
                    <td style="text-align:center;">${item.qty || 0}</td>
                    <td style="text-align:right;">${(Number(item.supply) || 0).toLocaleString()}</td>
                    <td style="text-align:right;">${(Number(item.vat) || 0).toLocaleString()}</td>
                    <td style="color:#2563eb; font-weight:bold; text-align:right;">${isBuy ? amount.toLocaleString() : ''}</td>
                    <td style="color:#dc2626; font-weight:bold; text-align:right;">${!isBuy ? amount.toLocaleString() : ''}</td>
                    <td style="font-weight:700; text-align:right; background:#f9fafb;">${runningBalance.toLocaleString()}</td>
                    <td style="text-align:center;">${item.img ? `<a href="${item.img}" target="_blank">📄</a>` : '-'}</td>

                   <td style="text-align:center; white-space:nowrap; width:80px;">
                        <div style="display: flex; justify-content: center; gap: 12px; align-items: center;">
                            <button onclick="openEditModal('${item.id}')" 
                                    title="수정"
                                    style="color:#2563eb; border:none; background:none; cursor:pointer; font-size:1.1rem; padding:0;">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button onclick="deleteEntry('${item.id}')" 
                                    title="삭제"
                                    style="color:#ef4444; border:none; background:none; cursor:pointer; font-size:1.1rem; padding:0;">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                    </td>
                </tr>`;
        }
    });

    tableBody.innerHTML = html || '<tr><td colspan="12" style="text-align:center; padding:30px;">내역이 없습니다.</td></tr>';
    
    // 요약 및 페이지 버튼 업데이트
    if(document.getElementById('sumBuy')) document.getElementById('sumBuy').innerText = totalBuy.toLocaleString();
    if(document.getElementById('sumPay')) document.getElementById('sumPay').innerText = totalPay.toLocaleString();
    if(document.getElementById('sumBalance')) document.getElementById('sumBalance').innerText = (totalBuy - totalPay).toLocaleString();
    renderPaginationUI(totalPages);
}

// [도움 함수들]
// [보조 3] 구분(Type) 뱃지 생성 함수
function getBadgeHtml(type) {
    const styles = {
        buy: "background:#eef2ff; color:#4338ca; border:1px solid #c7d2fe;",
        pay: "background:#fff1f2; color:#be123c; border:1px solid #fecdd3;",
        return: "background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0;"
    };
    const labels = { buy: "입고", pay: "결제", return: "반품" };
    const style = styles[type] || "background:#f3f4f6; color:#374151;";
    const label = labels[type] || "기타";
    
    return `<span style="${style} padding:2px 8px; border-radius:4px; font-size:0.75rem; font-weight:700;">${label}</span>`;
}

function updateSummaryUI(buy, pay) {
    if (document.getElementById('sumBuy')) document.getElementById('sumBuy').innerText = buy.toLocaleString();
    if (document.getElementById('sumPay')) document.getElementById('sumPay').innerText = pay.toLocaleString();
    if (document.getElementById('sumBalance')) document.getElementById('sumBalance').innerText = (buy - pay).toLocaleString();
}

// [보조 1] 페이지네이션 버튼 UI 생성 함수
function renderPaginationUI(totalPages) {
    const container = document.getElementById('paginationControls');
    if (!container) return;
    
    let html = '';
    for (let i = 1; i <= totalPages; i++) {
        // 현재 페이지는 파란색으로 강조
        const activeStyle = i === currentPage 
            ? 'background:#2563eb; color:#fff;' 
            : 'background:#fff; color:#333;';
            
        html += `
            <button onclick="goToPage(${i})" 
                    style="margin:0 3px; padding:5px 12px; cursor:pointer; border:1px solid #ddd; border-radius:4px; ${activeStyle}">
                ${i}
            </button>`;
    }
    container.innerHTML = html;
}

// [보조 2] 페이지 이동 함수
function goToPage(p) { 
    currentPage = p; 
    renderLedger(); 
    window.scrollTo(0, 0); // 페이지 이동 시 상단으로 스크롤
}

function updateVendorFilter(data) {
    const vendorSelect = document.getElementById('vendorFilter');
    if (!vendorSelect) return;
    const vendors = new Set(data.map(item => item.vendor).filter(v => v));
    const current = vendorSelect.value;
    vendorSelect.innerHTML = '<option value="all">전체 거래처</option>';
    Array.from(vendors).sort().forEach(v => {
        vendorSelect.innerHTML += `<option value="${v}">${v}</option>`;
    });
    vendorSelect.value = current || "all";
}

/* [수정] 거래처/날짜 필터 변경 시 실행되는 함수 */
function filterLedger() {
    // 1. 페이지를 1페이지로 초기화합니다.
    currentPage = 1; 

    // 2. 단순히 화면을 가리는 게 아니라, DB에서 해당 거래처 데이터를 새로 가져옵니다.
    // 이렇게 해야 선택된 거래처의 '전체 기간' 잔액이 정확히 계산됩니다.
    loadLedgerData(); 
}

document.addEventListener('DOMContentLoaded', async () => {
    // 날짜 자동 세팅 로직 (기존 유지)
    const now = new Date();
    const today = new Date(now.getTime() + (9 * 60 * 60 * 1000)).toISOString().split('T')[0];
    if(document.getElementById('startDate')) document.getElementById('startDate').value = today.substring(0, 7) + "-01";
    if(document.getElementById('endDate')) document.getElementById('endDate').value = today;

    // [변경] 바로 데이터를 부르지 않고, 거래처 목록만 먼저 가져와서 필터를 채웁니다.
    await fillVendorFilterOnly(); 
    await loadPharmacyName();
    
    const tableBody = document.getElementById('ledgerTableBody');
    tableBody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding:50px; color:#666;">🔎 조회하실 <b>거래처를 선택</b>해 주세요.</td></tr>';
});

async function loadPharmacyName() {
    const doc = await db.collection("settings").doc("pharmacy_info").get();
    if (doc.exists) {
        const name = doc.data().pharmacyName;
        document.querySelectorAll('.pharmacy-name-display').forEach(el => el.innerText = name);
        document.title = name + " - 장부";
    }
}

// 거래처 목록만 미리 가져오는 함수
async function fillVendorFilterOnly() {
    const vendorSelect = document.getElementById('vendorFilter');
    if (!vendorSelect) return;

    try {
        // 모든 거래처명을 가져오기 위해 최소한의 필드만 가져오거나 전용 컬렉션이 없다면 요약본 활용
        const snapshot = await db.collection("transactions").get(); 
        const vendors = new Set(snapshot.docs.map(doc => doc.data().vendor).filter(v => v));
        
        vendorSelect.innerHTML = '<option value="none">--- 거래처 선택 ---</option>';
        vendorSelect.innerHTML += '<option value="all">전체 거래처 (주의: 로딩 지연)</option>';
        Array.from(vendors).sort().forEach(v => {
            vendorSelect.innerHTML += `<option value="${v}">${v}</option>`;
        });
    } catch (e) {
        console.error("거래처 목록 로드 실패:", e);
    }
}

// 숫자에 콤마를 찍어주는 함수
function formatCurrency(input) {
    // 숫자 이외의 문자는 제거
    let value = input.value.replace(/[^0-9]/g, '');
    // 천 단위 콤마 추가
    input.value = value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// 1. 숫자만 추출하는 함수 (이게 정확해야 계산이 됩니다)
function getNumberValue(id) {
    const el = document.getElementById(id);
    if (!el || !el.value) return 0;
    // 콤마와 기타 문자를 모두 제거하고 순수 숫자만 추출
    return Number(el.value.replace(/[^0-9]/g, '')) || 0;
}

// 4. 합계 계산 실행 함수
// 1. 공급가 입력 시: 세액(10%)과 합계(공급가+세액)를 자동 계산
function calcQuickSupply() {
    const supply = getNumberValue('qSupply');
    const vatField = document.getElementById('qVat');
    const totalField = document.getElementById('qTotal');
    
    const vat = Math.floor(supply * 0.1);
    const total = supply + vat;

    // 세액과 합계 칸을 업데이트
    vatField.value = vat.toLocaleString();
    totalField.value = total.toLocaleString();
}

// 2. 세액 입력 시: 합계(공급가+세액)만 갱신 (공급가는 건드리지 않음)
function calcQuickVat() {
    const supply = getNumberValue('qSupply');
    const vat = getNumberValue('qVat');
    const totalField = document.getElementById('qTotal');

    const total = supply + vat;
    totalField.value = total.toLocaleString();
}

// 3. 합계 입력 시 (리버스): 공급가(10/11)와 세액(1/11)으로 쪼개기
function calcQuickTotalReverse() {
    const total = getNumberValue('qTotal');
    const supplyField = document.getElementById('qSupply');
    const vatField = document.getElementById('qVat');

    if (total > 0) {
        const supply = Math.round(total / 1.1);
        const vat = total - supply;

        // 공급가와 세액 칸을 업데이트
        supplyField.value = supply.toLocaleString();
        vatField.value = vat.toLocaleString();
    }
}

async function addQuickItem() {
    // 1. 필수 요소 확인
    const qDate = document.getElementById('qDate').value;
    const qType = document.getElementById('qType').value;
    const qVendor = document.getElementById('qVendor').value;
    const qMemo = document.getElementById('qMemo').value;
    const qQty = Number(document.getElementById('qQty').value) || 0;

    // 2. 숫자로 변환 (콤마 제거 로직 포함된 getNumberValue 사용)
    const qSupply = getNumberValue('qSupply');
    const qVat = getNumberValue('qVat');
    const qTotal = getNumberValue('qTotal');

    // 필수값 검증
    if (!qDate || !qVendor || qTotal === 0) {
        alert("날짜, 거래처, 금액을 확인해 주세요.");
        return;
    }

    try {
        // 3. Firebase에 직접 객체 형태로 저장
        // (따로 finalData 변수를 선언하지 않고 바로 넣는 방식입니다)
        await db.collection("transactions").add({
            date: qDate,
            type: qType,
            vendor: qVendor,
            memo: qMemo,
            qty: qQty,
            supply: qSupply,   // 숫자로 저장됨
            vat: qVat,         // 숫자로 저장됨
            total: qTotal,     // 숫자로 저장됨
            createdAt: firebase.firestore.FieldValue.serverTimestamp() // 색인 정렬용
        });

        // 4. 입력창 비우기
        document.getElementById('qVendor').value = "";
        document.getElementById('qMemo').value = "";
        document.getElementById('qQty').value = "";
        document.getElementById('qSupply').value = "";
        document.getElementById('qVat').value = "";
        document.getElementById('qTotal').value = "";

        alert("등록되었습니다!");
        loadLedgerData(); // 목록 갱신

    } catch (e) {
        console.error("저장 오류:", e);
        alert("저장에 실패했습니다: " + e.message);
    }
}

// logic-ledger.js

// 삭제 처리 함수
// logic-ledger.js

// logic-ledger.js

// logic-ledger.js

async function deleteEntry(id) {
    if (!id) return;
    if (!confirm("정말 삭제하시겠습니까?")) return;

    // [수정] 이미지 확인 결과, 컬렉션 이름은 'transactions' 입니다!
    const COLLECTION_NAME = "transactions"; 

    try {
        await db.collection(COLLECTION_NAME).doc(id).delete();
        
        alert("DB에서 영구 삭제되었습니다.");
        
        // 다시 목록 불러오기
        if (typeof loadLedgerData === 'function') {
            await loadLedgerData(); 
        } else {
            location.reload(); 
        }

    } catch (error) {
        console.error("삭제 실패:", error);
        alert("삭제 실패: " + error.message);
    }
}

// [1] 수정 모달 열기
// [1] 수정 모달 열기
// [1] 수정 팝업 내 실시간 합계 계산
function calcEditTotal() {
    const supplyInput = document.getElementById('editSupply');
    const vatInput = document.getElementById('editVat');
    const totalDisplay = document.getElementById('editTotalDisplay');

    // 1. 공급가 가져오기
    let supply = Number(supplyInput.value) || 0;

    // 2. 세액 자동 계산 (공급가의 10%, 소수점 제거)
    let vat = Math.floor(supply * 0.1);
    vatInput.value = vat;

    // 3. 합계 계산 및 표시
    let total = supply + vat;
    totalDisplay.value = total.toLocaleString();
}
function updateEditTotalOnly() {
    const supply = Number(document.getElementById('editSupply').value) || 0;
    const vat = Number(document.getElementById('editVat').value) || 0;
    const total = supply + vat;
    document.getElementById('editTotalDisplay').value = total.toLocaleString();
}
// [2] 수정 모달 열 때 모든 항목 채우기
function openEditModal(docId) {
    const item = allData.find(p => p.id === docId);
    if (!item) return;

    // 기본 정보 채우기
    document.getElementById('editDocId').value = docId;
    document.getElementById('editDate').value = item.date;
    document.getElementById('editType').value = item.type;
    document.getElementById('editVendor').value = item.vendor;
    document.getElementById('editMemo').value = item.memo || '';
    document.getElementById('editQty').value = item.qty || 0;
    
    // 금액 항목은 콤마를 찍어서 표시 (그래야 계산기가 작동함)
    document.getElementById('editSupply').value = (item.supply || 0).toLocaleString();
    document.getElementById('editVat').value = (item.vat || 0).toLocaleString();
    document.getElementById('editTotalDisplay').value = (item.total || 0).toLocaleString();

    document.getElementById('editModal').style.display = 'flex';
}
// [2] 수정 내용 저장 (DB 경로: transactions)
// logic-ledger.js

// [3] 수정 내용 저장 (transactions 컬렉션)
async function saveEdit() {
    const docId = document.getElementById('editDocId').value;
    
    // 저장 전 콤마 제거
    const supply = unformatNum(document.getElementById('editSupply').value);
    const vat = unformatNum(document.getElementById('editVat').value);
    const total = unformatNum(document.getElementById('editTotalDisplay').value);

    const updateData = {
        date: document.getElementById('editDate').value,
        type: document.getElementById('editType').value,
        vendor: document.getElementById('editVendor').value,
        memo: document.getElementById('editMemo').value,
        qty: Number(document.getElementById('editQty').value) || 0,
        supply: supply,
        vat: vat,
        total: total
    };

    try {
        await db.collection("transactions").doc(docId).update(updateData);
        alert("수정되었습니다.");
        closeEditModal();
        loadLedgerData(); 
    } catch (e) {
        alert("수정 실패: " + e.message);
    }
}
function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
}

// [1] 숫자에 콤마 넣고 빼는 유틸리티
function formatNum(n) { return n.toLocaleString(); }
function unformatNum(s) { return Number(s.replace(/,/g, '')) || 0; }

// [2] 공급가 입력 시 -> 세액(10%) & 합계 계산
function onEditSupplyInput(el) {
    let supply = unformatNum(el.value);
    el.value = formatNum(supply); // 실시간 콤마

    let vat = Math.floor(supply * 0.1);
    let total = supply + vat;

    document.getElementById('editVat').value = formatNum(vat);
    document.getElementById('editTotalDisplay').value = formatNum(total);
}

// [3] 세액 수동 수정 시 -> 합계만 갱신
function onEditVatInput(el) {
    let vat = unformatNum(el.value);
    el.value = formatNum(vat); // 실시간 콤마

    let supply = unformatNum(document.getElementById('editSupply').value);
    let total = supply + vat;

    document.getElementById('editTotalDisplay').value = formatNum(total);
}

// [4] 합계(입고액) 입력 시 -> 공급가(1/1.1) & 세액 역산 (리버스)
function onEditTotalInput(el) {
    let total = unformatNum(el.value);
    el.value = formatNum(total); // 실시간 콤마

    let supply = Math.round(total / 1.1);
    let vat = total - supply;

    document.getElementById('editSupply').value = formatNum(supply);
    document.getElementById('editVat').value = formatNum(vat);
}