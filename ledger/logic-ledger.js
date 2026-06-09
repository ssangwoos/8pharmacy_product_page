let currentPage = 1;
const itemsPerPage = 10;
let allData = []; // 필터링된 전체 데이터를 담을 변수

// [데이터 호출 함수] 거래처 선택 시 해당 데이터만 DB에서 쿼리하여 최적화
async function loadLedgerData(page = false) {
    const tableBody = document.getElementById('ledgerTableBody');
    const vendorFilter = document.getElementById('vendorFilter').value;

    if (!tableBody) return;

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

        const snapshot = await query.orderBy("date", "asc").orderBy("createdAt", "asc").get();
        allData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // [페이지 고정] 수정 후 현재 페이지 유지 로직
        if (page) {
            currentPage = page; 
        } else {
            currentPage = 1;
        }

        renderLedger(); 

    } catch (e) {
        console.error("데이터 로드 오류:", e);
        tableBody.innerHTML = `<tr><td colspan="12" style="text-align:center; color:red; padding:20px;">데이터 로드 실패: 색인이 생성 중일 수 있습니다.</td></tr>`;
    }
}

/* logic-ledger.js - 품목별 나열 및 Hover 기능 추가 버전 */
function renderLedger() {
    const tableBody = document.getElementById('ledgerTableBody');
    if (!tableBody) return;

    // 1. 필터 및 체크박스 상태 가져오기
    const start = document.getElementById('startDate')?.value || '';
    const end = document.getElementById('endDate')?.value || '';
    const searchKeyword = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const isFullMode = document.getElementById('totalBalanceFullMode')?.checked || false;

    // 2. 누적 계산용 변수 (전체용/기간용 분리)
    let runningGrandTotal = 0;  // 내부 계산용 (태초부터 지금까지 전체 잔액)
    let runningPeriodTotal = 0; // 표 표시용 (현재 선택된 기간 내 잔액)
    let totalBuy = 0;           // 하단 Summary용 (입고 합계)
    let totalPay = 0;           // 하단 Summary용 (결제 합계)
    let displayList = [];

    // 3. 전체 데이터 순회하며 잔액 계산 및 검색 필터링
    allData.forEach(item => {
        const rowItems = (item.items && item.items.length > 0) 
            ? item.items 
            : [{ memo: item.memo, qty: item.qty || 1, supply: item.supply, vat: item.vat, total: item.total }];

        rowItems.forEach((subItem) => {
            const amount = Number(subItem.total) || 0;
            const isBuy = (item.type === 'buy' || item.type === '입고');

            // [A] 전체 누적 잔액 계산 (상단 서머리용)
            if (isBuy) runningGrandTotal += amount;
            else runningGrandTotal -= amount;

            // 필터링 조건 (날짜 및 검색어)
            const dateMatch = (!start || item.date >= start) && (!end || item.date <= end);
            const searchMatch = !searchKeyword || 
                                item.vendor.toLowerCase().includes(searchKeyword) || 
                                (subItem.memo && subItem.memo.toLowerCase().includes(searchKeyword));

            if (dateMatch && searchMatch) {
                // [B] 기간 내 잔액 및 서머리 합산 (표 표시용)
                if (isBuy) {
                    runningPeriodTotal += amount;
                    totalBuy += amount;
                } else {
                    runningPeriodTotal -= amount;
                    totalPay += amount;
                }

                displayList.push({
                    ...item,
                    subItem,
                    currentBalance: runningPeriodTotal, 
                    isBuy: isBuy,
                    amount: amount
                });
            }
        });
    });

    // 4. 🔥 [완벽 복구] 약사님 오리지널 페이지네이션 계산 로직! ㅡㅡ^
    const totalItems = displayList.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const endIdx = totalItems - (currentPage - 1) * itemsPerPage;
    const startIdx = Math.max(0, endIdx - itemsPerPage);
    const currentPageData = displayList.slice(startIdx, endIdx);

    // 5. HTML 테이블 생성 (10개씩만 가볍게 출력)
    let html = '';
    currentPageData.forEach((row) => {
        const isRealImg = row.img && row.img.startsWith('http') && !row.img.includes('write.html');
        const groupId = isRealImg ? row.img : row.id;
        
        const proofIcon = isRealImg 
            ? `<button type="button" onclick="openProofViewer('${row.img}', ${row.rotation || 0}, '${row.id}')" style="border:none; background:none; cursor:pointer; font-size:1.2rem;">📄</button>` 
            : '-';
        const typeBadge = row.isBuy ? '<span class="badge buy">입고</span>' : '<span class="badge pay">결제</span>';

        // 🔥 [적요 칸 커스텀] 마우스가 적요 칸에 정확히 들어왔을 때만 가벼운 단가 연산 툴팁 호출 ㅡㅡ^
        // 🔥 [수정] 네 번째 인자로 자기 자신(this)의 텍스트를 던지도록 수정하여 따옴표 오류를 차단합니다!
        html += `
            <tr class="ledger-row" data-parent-id="${groupId}" onmouseover="highlightGroup('${groupId}')" onmouseout="removeHighlight()">
                <td style="text-align:center;">${row.date}</td>
                <td style="text-align:center;">${typeBadge}</td>
                <td style="text-align:center;">${row.vendor}</td>
                <td style="text-align:left; padding-left:10px; cursor:pointer; font-weight:500;"
                    onclick="showUnitPriceTooltip(event, ${row.amount}, ${row.subItem.qty || 0}, this.innerText)"
                    onmousemove="hideUnitPriceTooltipOnMove(event)">
                    ${row.subItem.memo || ''}
                </td>
                <td style="text-align:center;">${row.subItem.qty || 0}</td>
                <td style="text-align:right;">${(Number(row.subItem.supply) || 0).toLocaleString()}</td>
                <td style="text-align:right;">${(Number(row.subItem.vat) || 0).toLocaleString()}</td>
                <td style="color:#2563eb; font-weight:bold; text-align:right;">${row.isBuy ? row.amount.toLocaleString() : ''}</td>
                <td style="color:#dc2626; font-weight:bold; text-align:right;">${!row.isBuy ? row.amount.toLocaleString() : ''}</td>
                <td style="font-weight:700; text-align:right; background:#f9fafb;">${row.currentBalance.toLocaleString()}</td>
                <td style="text-align:center;">${proofIcon}</td>
                <td style="text-align:center;">
                    <div style="display: flex; justify-content: center; gap: 8px;">
                        <button onclick="openEditModal('${row.id}')" style="color:#2563eb; border:none; background:none; cursor:pointer;"><i class="fas fa-edit"></i></button>
                        <button onclick="deleteEntry('${row.id}')" style="color:#ef4444; border:none; background:none; cursor:pointer;"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </td>
            </tr>`;
    });

    tableBody.innerHTML = html || '<tr><td colspan="12" style="text-align:center; padding:30px;">결과가 없습니다.</td></tr>';
    
    // 6. UI 업데이트 (페이지네이션 및 서머리)
    if(typeof renderPaginationUI === 'function') renderPaginationUI(totalPages);

    // 상단 서머리 업데이트
    if(document.getElementById('sumBuy')) document.getElementById('sumBuy').innerText = totalBuy.toLocaleString();
    if(document.getElementById('sumPay')) document.getElementById('sumPay').innerText = totalPay.toLocaleString();
    
    if(document.getElementById('sumBalance')) {
        const finalSumBalance = isFullMode ? runningGrandTotal : (totalBuy - totalPay);
        document.getElementById('sumBalance').innerText = finalSumBalance.toLocaleString();
    }
}

// [그룹 명세서 합계 툴팁 기능] ㅡㅡ^
function highlightGroup(groupId) {
    if (!groupId) return;
    const safeId = CSS.escape(groupId);
    // 화면상의 10개 행 중에서만 클래스를 추가하므로 오버헤드가 매우 적음
    document.querySelectorAll(`tr[data-parent-id="${safeId}"]`).forEach(el => el.classList.add('group-active'));

    const groupItems = allData.filter(d => (d.img || d.id) === groupId);
    if (groupItems.length > 0) {
        const groupTotal = groupItems.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
        const vendorName = groupItems[0].vendor;

        const tooltip = document.getElementById('groupTooltip');
        if (tooltip) {
            tooltip.innerHTML = `
                <div style="margin-bottom:4px; border-bottom:1px solid #475569; padding-bottom:4px;">
                    <span style="color:#94a3b8;">거래처:</span> ${vendorName}
                </div>
                <div>
                    <span style="color:#94a3b8;">명세서 총 합계:</span> 
                    <span style="color:#60a5fa; font-size:1.1em; margin-left:5px;">${groupTotal.toLocaleString()}원</span>
                </div>
                <div style="font-size:11px; color:#94a3b8; margin-top:2px;">
                    (총 ${groupItems.length}개 품목)
                </div>
            `;
            tooltip.style.display = 'block';
        }
    }
}

// 🔥 [초고속 전용 단가 계산 툴팁] 화면 렌더링을 건드리지 않아 다운 현상 100% 방지 ㅡㅡ^
// 🔥 [수정] 적요 글자까지 풍선팁에 함께 노출하는 초고속 단가 계산식 ㅡㅡ^
// 🔥 [최적화 핵심] 마우스 고속 이동 시 연산 폭탄을 막기 위한 전역 타이머 변수 ㅡㅡ^
// 🔥 [최적화 핵심] 마우스 고속 이동 시 연산 폭탄을 막기 위한 전역 타이머 변수 ㅡㅡ^
let tooltipTimeout = null;

// 🔥 [진짜 최종] 파란색 번짐 잔상 버그를 완벽하게 도려낸 함수 3개 ㅡㅡ^
// 🔥 [변경] 클릭했을 때 시차(Timeout) 없이 즉시 단가 팝업을 띄우는 함수 ㅡㅡ^
function showUnitPriceTooltip(event, totalAmount, qty, memoText) {
    event.stopPropagation(); // 클릭 이벤트가 위로 퍼져서 tr을 건드리지 않게 방어

    const tooltip = document.getElementById('groupTooltip');
    if (!tooltip) return;

    let unitPriceText = "수량 0개 (계산 불가)";
    if (qty > 0) {
        const unitPrice = Math.round(totalAmount / qty);
        unitPriceText = `<span style="color:#22c55e; font-size:1.2em; font-weight:bold;">${unitPrice.toLocaleString()}원</span>`;
    }

    // 클릭하는 순간 딜레이 없이 즉시 화면 주입
    tooltip.innerHTML = `
        <div style="margin-bottom:6px; border-bottom:1px solid #475569; padding-bottom:4px; color:#94a3b8; font-size:11px;">
            🔎 선택 품목 사입 원가 계산
        </div>
        <div style="margin-bottom:6px; font-weight:700; color:#f8fafc; font-size:0.95rem; line-height:1.3; max-width:250px; word-break:keep-all;">
            📌 ${memoText || '품목명 없음'}
        </div>
        <div style="margin-bottom:4px; padding-top:2px; border-top:1px dashed #334155;">
            <span style="color:#94a3b8;">사입 단가:</span> ${unitPriceText}
        </div>
        <div style="font-size:11px; color:#cbd5e1; margin-top:2px;">
            (품목 입고액: ${totalAmount.toLocaleString()}원 / 수량: ${qty}개)
        </div>
    `;
    
    tooltip.style.left = (event.clientX + 15) + 'px'; 
    tooltip.style.top = (event.clientY + 15) + 'px';  
    tooltip.style.display = 'block';
}

// 🔥 [신규 추가] 클릭 후 마우스를 1px이라도 움직이면 단가 팝업만 즉시 꺼버리는 함수 ㅡㅡ^
function hideUnitPriceTooltipOnMove(event) {
    const tooltip = document.getElementById('groupTooltip');
    // 현재 단가 팝업 띄우기 창 모드일 때만 작동 (🔎 글자가 포함되어 있는지 체크)
    if (tooltip && tooltip.style.display === 'block' && tooltip.innerHTML.includes('🔎')) {
        tooltip.style.display = 'none';
        tooltip.innerHTML = '';
    }
}

// 🔥 [버그 수정 핵심] 적요 칸에서 마우스가 조금이라도 흔들리거나 빠져나갈 때 
// 예약된 단가 타이머를 '즉시 취소'하여 잔상이 생기는 타이밍을 원천 차단합니다!


// 행(tr) 전체를 완전히 벗어났을 때만 모든 파란 불을 일괄 소등합니다.
function removeHighlight() {
    if (tooltipTimeout) clearTimeout(tooltipTimeout);
    
    document.querySelectorAll('.ledger-row').forEach(el => el.classList.remove('group-active'));
    const tooltip = document.getElementById('groupTooltip');
    if (tooltip) {
        tooltip.style.display = 'none';
        tooltip.innerHTML = '';
    }
}

// [최적화 버전] 적요 칸에서 벗어났을 때 처리
function restoreGroupTooltip(event, groupId) {
    event.stopPropagation();
    if (tooltipTimeout) clearTimeout(tooltipTimeout); // 대기 중인 단가 계산 취소
    highlightGroup(groupId); 
}

// [최적화 버전] 행 전체에서 벗어났을 때 처리
function removeHighlight() {
    if (tooltipTimeout) clearTimeout(tooltipTimeout); // 대기 중인 모든 작업 전면 취소
    
    document.querySelectorAll('.ledger-row').forEach(el => el.classList.remove('group-active'));
    const tooltip = document.getElementById('groupTooltip');
    if (tooltip) {
        tooltip.style.display = 'none';
        tooltip.innerHTML = ''; // 찌꺼기 제거
    }
}

document.addEventListener('mousemove', function(e) {
    const tooltip = document.getElementById('groupTooltip');
    if (tooltip && tooltip.style.display === 'block') {
        tooltip.style.left = (e.clientX + 15) + 'px'; 
        tooltip.style.top = (e.clientY + 15) + 'px';  
    }
});

// [도움 함수들]
function updateSummaryUI(buy, pay) {
    if (document.getElementById('sumBuy')) document.getElementById('sumBuy').innerText = buy.toLocaleString();
    if (document.getElementById('sumPay')) document.getElementById('sumPay').innerText = pay.toLocaleString();
    if (document.getElementById('sumBalance')) document.getElementById('sumBalance').innerText = (buy - pay).toLocaleString();
}

function renderPaginationUI(totalPages) {
    const container = document.getElementById('paginationControls');
    if (!container) return;
    let html = '';
    for (let i = 1; i <= totalPages; i++) {
        const activeStyle = i === currentPage ? 'background:#2563eb; color:#fff;' : 'background:#fff; color:#333;';
        html += `<button onclick="goToPage(${i})" style="margin:0 3px; padding:5px 12px; cursor:pointer; border:1px solid #ddd; border-radius:4px; ${activeStyle}">${i}</button>`;
    }
    container.innerHTML = html;
}

function goToPage(p) { 
    currentPage = p; 
    renderLedger(); 
    window.scrollTo(0, 0); 
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

function filterLedger() {
    currentPage = 1; 
    const vendorFilter = document.getElementById('vendorFilter');
    const qVendorInput = document.getElementById('qVendor');
    
    if (vendorFilter && qVendorInput) {
        const selectedVendor = vendorFilter.value;
        if (selectedVendor !== 'all') {
            qVendorInput.value = selectedVendor; 
            qVendorInput.readOnly = true; 
            qVendorInput.style.backgroundColor = "#f1f5f9"; 
            qVendorInput.style.color = "#475569"; 
        } else {
            qVendorInput.value = ""; 
            qVendorInput.readOnly = false; 
            qVendorInput.style.backgroundColor = "white";
            qVendorInput.style.color = "black";
        }
    }
    loadLedgerData(); 
}

document.addEventListener('DOMContentLoaded', async () => {
    const now = new Date();
    const past = new Date();
    past.setDate(now.getDate() - 180); 

    const toYmd = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    if(document.getElementById('startDate')) document.getElementById('startDate').value = toYmd(past);
    if(document.getElementById('endDate')) document.getElementById('endDate').value = toYmd(now);

    const balanceCheckbox = document.getElementById('totalBalanceFullMode');
    if (balanceCheckbox) {
        balanceCheckbox.addEventListener('change', renderLedger);
    }

    await fillVendorFilterOnly(); 
    await loadPharmacyName();
    
    const tableBody = document.getElementById('ledgerTableBody');
    if (tableBody) {
        tableBody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding:50px; color:#666;">🔎 조회하실 <b>거래처를 선택</b>해 주세요.</td></tr>';
    }
});

async function loadPharmacyName() {
    const doc = await db.collection("settings").doc("pharmacy_info").get();
    if (doc.exists) {
        const name = doc.data().pharmacyName;
        document.querySelectorAll('.pharmacy-name-display').forEach(el => el.innerText = name);
        document.title = name + " - 장부";
    }
}

async function fillVendorFilterOnly() {
    const vendorSelect = document.getElementById('vendorFilter');
    if (!vendorSelect) return;
    try {
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

function formatCurrency(input) {
    let value = input.value.replace(/[^0-9]/g, '');
    input.value = value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function getNumberValue(id) {
    const el = document.getElementById(id);
    if (!el || !el.value) return 0;
    return Number(el.value.replace(/[^0-9-]/g, '')) || 0;
}

function calcQuickSupply() {
    const supply = getNumberValue('qSupply');
    const vatField = document.getElementById('qVat');
    const totalField = document.getElementById('qTotal');
    const vat = Math.floor(supply * 0.1);
    const total = supply + vat;
    vatField.value = vat.toLocaleString();
    totalField.value = total.toLocaleString();
}

function calcQuickVat() {
    const supply = getNumberValue('qSupply');
    const vat = getNumberValue('qVat');
    document.getElementById('qTotal').value = (supply + vat).toLocaleString();
}

function calcQuickTotalReverse() {
    const total = getNumberValue('qTotal');
    if (total > 0) {
        const supply = Math.round(total / 1.1);
        document.getElementById('qSupply').value = supply.toLocaleString();
        document.getElementById('qVat').value = (total - supply).toLocaleString();
    }
}

async function addQuickItem() {
    const qDate = document.getElementById('qDate').value;
    const qType = document.getElementById('qType').value;
    const qVendor = document.getElementById('qVendor').value;
    const qMemo = document.getElementById('qMemo').value;
    const qQty = Number(document.getElementById('qQty').value) || 0;
    const qSupply = getNumberValue('qSupply');
    const qVat = getNumberValue('qVat');
    const qTotal = getNumberValue('qTotal');

    if (!qDate || !qVendor || qTotal === 0) {
        alert("날짜, 거래처, 금액을 확인해 주세요.");
        return;
    }

    try {
        await db.collection("transactions").add({
            date: qDate, type: qType, vendor: qVendor, memo: qMemo, qty: qQty,
            supply: qSupply, vat: qVat, total: qTotal,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        document.getElementById('qMemo').value = "";
        document.getElementById('qQty').value = "";
        document.getElementById('qSupply').value = "";
        document.getElementById('qVat').value = "";
        document.getElementById('qTotal').value = "";
        alert("등록되었습니다!");
        loadLedgerData(currentPage);
    } catch (e) { alert("저장 실패: " + e.message); }
}

async function deleteEntry(id) {
    if (!id || !confirm("정말 삭제하시겠습니까?")) return;
    try {
        await db.collection("transactions").doc(id).delete();
        alert("DB에서 영구 삭제되었습니다.");
        loadLedgerData(currentPage);
    } catch (error) { alert("삭제 실패: " + error.message); }
}

function calcEditTotal() {
    let supply = Number(document.getElementById('editSupply').value) || 0;
    let vat = Math.floor(supply * 0.1);
    document.getElementById('editVat').value = vat;
    document.getElementById('editTotalDisplay').value = (supply + vat).toLocaleString();
}

function updateEditTotalOnly() {
    const supply = Number(document.getElementById('editSupply').value) || 0;
    const vat = Number(document.getElementById('editVat').value) || 0;
    document.getElementById('editTotalDisplay').value = (supply + vat).toLocaleString();
}

function openEditModal(docId) {
    const item = allData.find(p => p.id === docId);
    if (!item) return;
    document.getElementById('editDocId').value = docId;
    document.getElementById('editDate').value = item.date;
    document.getElementById('editType').value = item.type;
    document.getElementById('editVendor').value = item.vendor;
    document.getElementById('editMemo').value = item.memo || '';
    document.getElementById('editQty').value = item.qty || 0;
    document.getElementById('editSupply').value = (item.supply || 0).toLocaleString();
    document.getElementById('editVat').value = (item.vat || 0).toLocaleString();
    document.getElementById('editTotalDisplay').value = (item.total || 0).toLocaleString();
    document.getElementById('editModal').style.display = 'flex';
}

async function saveEdit() {
    const docId = document.getElementById('editDocId').value;
    const supply = unformatNum(document.getElementById('editSupply').value);
    const vat = unformatNum(document.getElementById('editVat').value);
    const total = unformatNum(document.getElementById('editTotalDisplay').value);

    const updateData = {
        date: document.getElementById('editDate').value,
        type: document.getElementById('editType').value,
        vendor: document.getElementById('editVendor').value,
        memo: document.getElementById('editMemo').value,
        qty: Number(document.getElementById('editQty').value) || 0,
        supply: supply, vat: vat, total: total
    };

    try {
        await db.collection("transactions").doc(docId).update(updateData);
        alert("수정되었습니다.");
        closeEditModal();
        loadLedgerData(currentPage);
    } catch (e) { alert("수정 실패: " + e.message); }
}

function closeEditModal() { document.getElementById('editModal').style.display = 'none'; }

function formatNum(n) { return n === "-" ? "-" : n.toLocaleString(); }
function unformatNum(s) { return Number(String(s).replace(/[^0-9-]/g, '')) || 0; }

function onEditSupplyInput(el) {
    let val = el.value.replace(/[^0-9-]/g, "");
    if (val === "-") { el.value = "-"; return; }
    let supply = unformatNum(val);
    el.value = formatNum(supply);
    let vat = Math.floor(supply * 0.1);
    document.getElementById('editVat').value = formatNum(vat);
    document.getElementById('editTotalDisplay').value = formatNum(supply + vat);
}

function onEditVatInput(el) {
    let val = el.value.replace(/[^0-9-]/g, "");
    if (val === "-") { el.value = "-"; return; }
    let vat = unformatNum(val);
    el.value = formatNum(vat);
    let supply = unformatNum(document.getElementById('editSupply').value);
    document.getElementById('editTotalDisplay').value = formatNum(supply + vat);
}

function onEditTotalInput(el) {
    let val = el.value.replace(/[^0-9-]/g, "");
    if (val === "-") { el.value = "-"; return; }
    let total = unformatNum(val);
    el.value = formatNum(total);
    let supply = Math.round(total / 1.1);
    document.getElementById('editSupply').value = formatNum(supply);
    document.getElementById('editVat').value = formatNum(total - supply);
}

function openProofViewer(imgUrl, savedRotation, docId) {
    if (!imgUrl || imgUrl === 'null') return alert("이미지가 없습니다.");
    const width = 1000, height = 900;
    const left = (window.screen.width / 2) - (width / 2), top = (window.screen.height / 2) - (height / 2);
    const viewer = window.open('', '_blank', `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`);
    viewer.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>증빙 뷰어 (회전/확대)</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
            <style>
                body { margin: 0; background: #0f172a; color: white; display: flex; flex-direction: column; height: 100vh; font-family: sans-serif; overflow: hidden; }
                .nav { background: #1e293b; padding: 12px; display: flex; justify-content: center; gap: 15px; border-bottom: 1px solid #334155; align-items: center; }
                .btn { background: #3b82f6; color: white; border: none; padding: 8px 14px; border-radius: 4px; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 5px; }
                .btn:hover { background: #2563eb; }
                .btn-gray { background: #64748b; }
                .img-box { flex: 1; display: flex; align-items: center; justify-content: center; overflow: auto; padding: 50px; cursor: grab; }
                .img-box:active { cursor: grabbing; }
                img { transition: transform 0.2s ease; max-width: 90%; transform-origin: center center; box-shadow: 0 0 40px rgba(0,0,0,0.6); }
                #status { font-size: 11px; color: #94a3b8; width: 80px; text-align: center; }
            </style>
        </head>
        <body>
            <div class="nav">
                <button class="btn" onclick="rotate(-90)"><i class="fas fa-undo"></i> 좌회전</button>
                <button class="btn" onclick="rotate(90)"><i class="fas fa-redo"></i> 우회전</button>
                <div style="width: 1px; height: 20px; background: #475569;"></div>
                <button class="btn btn-gray" onclick="zoom(0.1)"><i class="fas fa-search-plus"></i></button>
                <button class="btn btn-gray" onclick="zoom(-0.1)"><i class="fas fa-search-minus"></i></button>
                <button class="btn btn-gray" onclick="resetAll()">원본</button>
                <div id="status">대기 중</div>
                <button class="btn" style="background:#ef4444;" onclick="window.close()">닫기</button>
            </div>
            <div class="img-box" id="container">
                <img id="pImg" src="${imgUrl}">
            </div>
            <script>
                let currentRot = ${savedRotation || 0};
                let currentScale = 1.0;
                const docId = "${docId}";
                const img = document.getElementById('pImg');
                const status = document.getElementById('status');
                function updateStyle() { img.style.transform = "rotate(" + currentRot + "deg) scale(" + currentScale + ")"; }
                async function rotate(deg) {
                    currentRot += deg;
                    updateStyle();
                    if (docId && window.opener) {
                        status.innerText = "저장 중...";
                        try {
                            await window.opener.updateRotationFromPopup(docId, currentRot);
                            status.innerText = "저장 완료";
                        } catch(e) { status.innerText = "저장 실패"; }
                    }
                }
                function zoom(val) { currentScale = Math.max(0.1, currentScale + val); updateStyle(); }
                function resetAll() { currentScale = 1.0; updateStyle(); }
                window.onload = updateStyle;
            <\/script>
        </body>
        </html>
    `);
    viewer.document.close();
}

async function updateRotationFromPopup(docId, newRot) {
    try {
        if (!docId) return;
        await db.collection("transactions").doc(docId).update({ rotation: Number(newRot) });
        console.log("✅ DB 회전값 업데이트 완료:", docId, newRot);
    } catch (e) { console.error("❌ DB 업데이트 실패:", e); }
}
