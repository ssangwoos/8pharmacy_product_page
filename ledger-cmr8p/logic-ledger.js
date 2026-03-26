let currentPage = 1;
const itemsPerPage = 10;
let allData = []; // 필터링된 전체 데이터를 담을 변수
// logic-ledger.js 맨 위쪽에 이렇게 되어 있는지 확인하세요!

// [데이터 호출 함수] 거래처 선택 시 해당 데이터만 DB에서 쿼리하여 최적화
// page 매개변수에 기본값 false를 줍니다. 
// 아무것도 안 넣고 호출하면(기존 방식) 1페이지로 가고, 
// currentPage를 넣고 호출하면 그 페이지를 유지합니다.
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

        // [핵심 수정 부분] 
        // page 인자가 전달되었다면(수정 시) 그 페이지를 유지하고, 
        // 인자가 없다면(처음 조회 시) 1페이지로 초기화합니다.
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
    const vendorFilter = document.getElementById('vendorFilter')?.value || 'all';
    const isFullMode = document.getElementById('totalBalanceFullMode')?.checked || false;

    // 2. 누적 계산용 변수 (전체용/기간용 분리)
    let runningGrandTotal = 0;  // 내부 계산용 (태초부터 지금까지 전체 잔액)
    let runningPeriodTotal = 0; // 표 표시용 (현재 선택된 기간 내 잔액)
    let totalBuy = 0;           // 하단 Summary용 (입고 합계)
    let totalPay = 0;           // 하단 Summary용 (결제 합계)
    let displayList = [];

    // 3. 전체 데이터 순회 (allData는 이미 해당 거래처의 전체 데이터임)
    allData.forEach(item => {
        const rowItems = (item.items && item.items.length > 0) 
            ? item.items 
            : [{ memo: item.memo, qty: item.qty || 1, supply: item.supply, vat: item.vat, total: item.total }];

        rowItems.forEach((subItem) => {
            const amount = Number(subItem.total) || 0;
            const isBuy = (item.type === 'buy' || item.type === '입고');

            // [A] 전체 누적 잔액은 루프 돌 때마다 '무조건' 계산 (상단 서머리용) ㅡㅡ^
            if (isBuy) runningGrandTotal += amount;
            else runningGrandTotal -= amount;

            // 필터링 조건 (날짜 및 검색어)
            const dateMatch = (!start || item.date >= start) && (!end || item.date <= end);
            const searchMatch = !searchKeyword || 
                                item.vendor.toLowerCase().includes(searchKeyword) || 
                                (subItem.memo && subItem.memo.toLowerCase().includes(searchKeyword));

            if (dateMatch && searchMatch) {
                // [B] 기간 내 잔액 및 서머리 합산 (표 표시용) ㅡㅡ^
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
                    // 🔥 표 안의 잔액은 체크박스 상관없이 '기간 잔액'으로 고정! ㅡㅡ^
                    currentBalance: runningPeriodTotal, 
                    isBuy: isBuy,
                    amount: amount
                });
            }
        });
    });

    // 4. 페이지네이션 계산
    const totalItems = displayList.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const endIdx = totalItems - (currentPage - 1) * itemsPerPage;
    const startIdx = Math.max(0, endIdx - itemsPerPage);
    const currentPageData = displayList.slice(startIdx, endIdx);

    // 5. HTML 테이블 생성
    let html = '';
    currentPageData.forEach((row) => {
        const isRealImg = row.img && row.img.startsWith('http') && !row.img.includes('write.html');
        const groupId = isRealImg ? row.img : row.id;
        // renderLedger 함수 내부
        // renderLedger 함수 내 아이콘 생성 줄 수정
       // logic-ledger.js 내 renderLedger 함수 내부
       const proofIcon = isRealImg 
        ? `<button type="button" onclick="openProofViewer('${row.img}', ${row.rotation || 0}, '${row.id}')" 
            style="border:none; background:none; cursor:pointer; font-size:1.2rem;">📄</button>` 
        : '-';
        const typeBadge = row.isBuy ? '<span class="badge buy">입고</span>' : '<span class="badge pay">결제</span>';

        html += `
            <tr class="ledger-row" data-parent-id="${groupId}" onmouseover="highlightGroup('${groupId}')" onmouseout="removeHighlight()">
                <td style="text-align:center;">${row.date}</td>
                <td style="text-align:center;">${typeBadge}</td>
                <td style="text-align:center;">${row.vendor}</td>
                <td style="text-align:left; padding-left:10px;">${row.subItem.memo || ''}</td>
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

    // [상단 서머리 업데이트] ㅡㅡ^
    if(document.getElementById('sumBuy')) document.getElementById('sumBuy').innerText = totalBuy.toLocaleString();
    if(document.getElementById('sumPay')) document.getElementById('sumPay').innerText = totalPay.toLocaleString();
    
    // 🔥 상단 잔액 칸만 체크박스 모드에 따라 변신! ㅡㅡ^
    if(document.getElementById('sumBalance')) {
        const finalSumBalance = isFullMode ? runningGrandTotal : (totalBuy - totalPay);
        document.getElementById('sumBalance').innerText = finalSumBalance.toLocaleString();
    }
}

// [수정] 그룹 내 모든 항목의 금액을 합산하여 툴팁에 표시
function highlightGroup(groupId) {
    if (!groupId) return;
    
    // 1. 하이라이트 효과
    const safeId = CSS.escape(groupId);
    const elements = document.querySelectorAll(`tr[data-parent-id="${safeId}"]`);
    elements.forEach(el => el.classList.add('group-active'));

    // 2. 그룹 합계 계산 로직
    // allData에서 동일한 img(또는 groupId)를 가진 모든 항목을 추출합니다.
    const groupItems = allData.filter(d => (d.img || d.id) === groupId);
    
    if (groupItems.length > 0) {
        // 그룹 내 모든 항목의 total 값을 합산
        const groupTotal = groupItems.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
        const vendorName = groupItems[0].vendor; // 거래처명은 첫 번째 항목에서 참조

        const tooltip = document.getElementById('groupTooltip');
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

// [수정] 툴팁 숨기기
function removeHighlight() {
    document.querySelectorAll('.ledger-row').forEach(el => el.classList.remove('group-active'));
    document.getElementById('groupTooltip').style.display = 'none';
}

// [추가] 마우스 움직임에 따라 툴팁 위치 이동
document.addEventListener('mousemove', function(e) {
    const tooltip = document.getElementById('groupTooltip');
    if (tooltip.style.display === 'block') {
        tooltip.style.left = (e.clientX + 15) + 'px'; // 커서 오른쪽 15px
        tooltip.style.top = (e.clientY + 15) + 'px';  // 커서 아래쪽 15px
    }
});


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
/* logic-ledger.js: 거래처 선택 시 퀵등록 readonly 처리 */

function filterLedger() {
    // 1. 페이지를 1페이지로 초기화
    currentPage = 1; 

    // 2. 퀵등록 거래처 칸 연동 및 수정 방지(readonly)
    const vendorFilter = document.getElementById('vendorFilter');
    const qVendorInput = document.getElementById('qVendor');
    
    if (vendorFilter && qVendorInput) {
        const selectedVendor = vendorFilter.value;
        
        if (selectedVendor !== 'all') {
            qVendorInput.value = selectedVendor; 
            qVendorInput.readOnly = true; // 수정 불가 모드
            qVendorInput.style.backgroundColor = "#f1f5f9"; // 연한 회색 (잠금 표시)
            qVendorInput.style.color = "#475569"; // 글자색 흐리게
        } else {
            qVendorInput.value = ""; 
            qVendorInput.readOnly = false; // 직접 입력 가능 모드
            qVendorInput.style.backgroundColor = "white";
            qVendorInput.style.color = "black";
        }
    }

    // 3. DB 데이터 새로 로드
    loadLedgerData(); 
}

document.addEventListener('DOMContentLoaded', async () => {
    // 1. 현재 한국 시간 기준으로 날짜 객체 생성
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0 (1월) ~ 11 (12월)

    // 2. 시작일(1일) 조립: "YYYY-MM-01"
    const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`;

    // 3. 말일 계산: 다음 달의 0번째 날 = 이번 달의 마지막 날
    const lastDayDate = new Date(year, month + 1, 0);
    const lastDayYear = lastDayDate.getFullYear();
    const lastDayMonth = String(lastDayDate.getMonth() + 1).padStart(2, '0');
    const lastDayDay = String(lastDayDate.getDate()).padStart(2, '0');
    
    // 최종 조립: "YYYY-MM-DD" (ISO 문자열 변환 없이 직접 조립하여 오류 차단)
    const lastDay = `${lastDayYear}-${lastDayMonth}-${lastDayDay}`;

    // 4. HTML 필터에 값 할당
    if(document.getElementById('startDate')) document.getElementById('startDate').value = firstDay;
    if(document.getElementById('endDate')) document.getElementById('endDate').value = lastDay;

    // 체크박스(totalBalanceFullMode)의 상태가 바뀔 때마다 renderLedger 함수를 다시 실행해라!
    const balanceCheckbox = document.getElementById('totalBalanceFullMode');
    if (balanceCheckbox) {
        balanceCheckbox.addEventListener('change', renderLedger);
    }

    // 5. 기존 초기화 로직 유지
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
        //document.getElementById('qVendor').value = "";
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
        // ★ 중요: 현재 보고 있던 페이지 번호(currentPage)를 넘겨줍니다!
        loadLedgerData(currentPage);
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

// 특정 거래처의 전체 기간 누적 잔액을 가져오는 함수 ㅡㅡ^
async function getFullCumulativeBalance(vendorName) {
    try {
        let query = db.collection("transactions");
        
        // 전체 내역 중 해당 거래처 것만 필터링 (날짜 조건 없음)
        if (vendorName && vendorName !== "전체") {
            query = query.where("vendor", "==", vendorName);
        }

        const snapshot = await query.get();
        let totalBuy = 0;
        let totalPay = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            const amount = Number(data.amount) || 0;
            if (data.type === "입고") {
                totalBuy += amount;
            } else if (data.type === "결제" || data.type === "반품") {
                totalPay += amount;
            }
        });

        return totalBuy - totalPay; // 진짜 최종 잔액
    } catch (e) {
        console.error("전체 잔액 로드 오류:", e);
        return 0;
    }
}


// logic-ledger.js 파일 맨 하단에 추가 ㅡㅡ^
// [수정된 뷰어 함수] 회전 시 DB 저장 기능 추가 ㅡㅡ^
function openProofViewer(imgUrl, savedRotation, docId) {
    if (!imgUrl || imgUrl === 'null') return alert("이미지가 없습니다.");

    const width = 1000; // 확대 기능을 위해 창을 조금 더 크게 잡습니다.
    const height = 900;
    const left = (window.screen.width / 2) - (width / 2);
    const top = (window.screen.height / 2) - (height / 2);

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

                function updateStyle() {
                    img.style.transform = "rotate(" + currentRot + "deg) scale(" + currentScale + ")";
                }

                // 회전 및 DB 저장 ㅡㅡ^
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

                // 확대 축소 ㅡㅡ^
                function zoom(val) {
                    currentScale = Math.max(0.1, currentScale + val);
                    updateStyle();
                }

                function resetAll() {
                    currentScale = 1.0;
                    updateStyle();
                }

                

                window.onload = updateStyle;
            </script>
        </body>
        </html>
    `);
    viewer.document.close();
}

// [수정] 저장 후 부모창 화면까지 갱신하는 대행 함수 ㅡㅡ^
// 팝업창에서 시키는 대로 DB를 업데이트하는 대행 함수 ㅡㅡ^
// [부모창] 팝업창에서 시키는 대로 저장해주는 '확실한' 함수 ㅡㅡ^
// [부모창] 팝업창에서 회전 버튼을 누르면 DB를 업데이트해주는 함수 ㅡㅡ^
async function updateRotationFromPopup(docId, newRot) {
    try {
        if (!docId) return;
        // Firestore의 해당 문서를 직접 업데이트합니다.
        await db.collection("transactions").doc(docId).update({
            rotation: Number(newRot)
        });
        console.log("✅ DB 회전값 업데이트 완료:", docId, newRot);
    } catch (e) {
        console.error("❌ DB 업데이트 실패:", e);
    }
}
