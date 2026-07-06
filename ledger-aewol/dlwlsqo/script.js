// =================================================================
// 1. FIREBASE 설정 및 초기화
// =================================================================
const firebaseConfig = {
  apiKey: "AIzaSyACOqns4PnakUaowOC107czAkNUsvvVhLA",
  authDomain: "ledger-aewol.firebaseapp.com",
  projectId: "ledger-aewol",
  storageBucket: "ledger-aewol.firebasestorage.app",
  messagingSenderId: "1085469734295",
  appId: "1:1085469734295:web:0dbdfd0d675321686300d2"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();

// 배포된 크롤러 Cloud Function URL (모바일 "지금 수집" 버튼이 호출)
const CRAWLER_FUNCTION_URL = 'https://asia-northeast3-ledger-aewol.cloudfunctions.net/scrapePlayMD';

// =================================================================
// 2. 글로벌 상태 변수 관리
// =================================================================
let globalSalesData = {};
let rawManualExpenses = [];
let rawTransactions = [];
let syncedVendors = [];

// [수정] 오늘 날짜 기준으로 자동 설정 (6월 하드코딩 버그 수정)
const _today = new Date();
let currentYear = _today.getFullYear();
let currentMonth = _today.getMonth();   // 0-indexed, 오늘 기준 자동

let tierSettings = [
    { threshold: 0, a: 20, b: 20, c: 70, deductB: 0 },
    { threshold: 100000000, a: 15, b: 15, c: 80, deductB: -1500000 },
    { threshold: 200000000, a: 10, b: 10, c: 90, deductB: -3000000 },
    { threshold: 300000000, a: 7.5, b: 7.5, c: 90, deductB: 0 }
];
const MARGIN_D_FIXED = 25;

const COL_DATE = 1;
const COL_CODE = 9;
const COL_TAX = 26;
const COL_ORIG = 30;
const COL_REAL = 31;
const COL_TIME = 49;

// =================================================================
// 3. 핵심 연산 엔진
// =================================================================
function getActiveTier(monthlyTotalSales) {
    let active = tierSettings[0];
    for (let i = tierSettings.length - 1; i >= 0; i--) {
        if (monthlyTotalSales >= tierSettings[i].threshold) {
            active = tierSettings[i];
            break;
        }
    }
    return active;
}

function calculateProfit(data, tier) {
    const marginA = (data.groupA || 0) * (tier.a / 100);
    const marginB = (data.groupB || 0) * (tier.b / 100);
    const marginC = (data.groupC || 0) * (tier.c / 100);
    const marginD = (data.groupD || 0) * (MARGIN_D_FIXED / 100);
    return {
        a: Math.round(marginA),
        b: Math.round(marginB),
        c: Math.round(marginC),
        d: Math.round(marginD)
    };
}

let isChartLibLoaded = false;
if (typeof google !== 'undefined' && google.charts) {
    try {
        google.charts.load('current', {'packages':['corechart']});
        google.charts.setOnLoadCallback(() => {
            isChartLibLoaded = true;
            renderCalendar();
        });
    } catch (e) {
        console.error("구글 차트 라이브러리 로딩 보류:", e);
    }
}

// =================================================================
// 4. 라이프사이클 초기화
// =================================================================
function initDashboard() {
    const excelFile = document.getElementById('excelFile');
    if (excelFile) excelFile.onchange = handleFileUpload;

    const prevMonthBtn = document.getElementById('prevMonth');
    if (prevMonthBtn) prevMonthBtn.onclick = () => changeMonth(-1);

    const nextMonthBtn = document.getElementById('nextMonth');
    if (nextMonthBtn) nextMonthBtn.onclick = () => changeMonth(1);

    const openSettingsBtn = document.getElementById('openSettingsBtn');
    if (openSettingsBtn) openSettingsBtn.onclick = () => document.getElementById('settingsModal').classList.add('active');

    const closeModalBtn = document.getElementById('closeModalBtn');
    if (closeModalBtn) closeModalBtn.onclick = () => document.getElementById('settingsModal').classList.remove('active');

    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    if (saveSettingsBtn) saveSettingsBtn.onclick = saveMarginSettings;

    const expenseForm = document.getElementById('expenseForm');
    if (expenseForm) expenseForm.onsubmit = handleExpenseSubmit;

    loadMarginsFromFirestore();
    loadTransactionsFromFirestore();
    loadLedgerVendors();
    loadExpensesFromFirestore();
    loadRawTransactionsFromFirestore();
    loadSyncedVendorsFromFirestore();

    // [추가] 오늘 매출(크롤링 결과) 실시간 구독
    loadTodaySalesFromFirestore();

    // [추가] "지금 수집" 버튼 → Cloud Function 호출
    const crawlBtn = document.getElementById('crawlRefreshBtn');
    if (crawlBtn) crawlBtn.onclick = triggerCrawl;
}

// "지금 수집" 버튼: 클라우드 크롤러를 호출해 오늘 매출을 갱신
async function triggerCrawl() {
    const btn = document.getElementById('crawlRefreshBtn');
    if (!btn) return;
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('spinning');
    btn.innerHTML = '<span class="refresh-icon">↻</span> 수집 중…';

    try {
        const res = await fetch(CRAWLER_FUNCTION_URL, { method: 'POST' });
        const data = await res.json();
        if (data && data.ok) {
            // Firestore 실시간 구독이 배너/카드를 자동 갱신하므로 별도 처리 불필요
            btn.innerHTML = '✓ 수집 완료';
            setTimeout(() => { btn.innerHTML = original; }, 2000);
        } else {
            alert('수집 실패: ' + (data && data.error ? data.error : '알 수 없는 오류'));
            btn.innerHTML = original;
        }
    } catch (e) {
        alert('수집 요청 실패: ' + e.message);
        btn.innerHTML = original;
    } finally {
        btn.disabled = false;
        btn.classList.remove('spinning');
    }
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initDashboard);
} else {
    initDashboard();
}

function switchTab(tabContentId, element) {
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(tabContentId).classList.add('active');
    element.classList.add('active');
    renderCalendar();
}

// =================================================================
// 5. FIRESTORE 연동
// =================================================================
function loadMarginsFromFirestore() {
    db.collection("settings").doc("progressive_margins").get().then((doc) => {
        if (doc.exists) {
            tierSettings = doc.data().tiers || tierSettings;
        }
        const rows = document.querySelectorAll('#tierSettingsBody tr');
        tierSettings.forEach((ts, i) => {
            if (rows[i]) {
                rows[i].querySelector('.in-a').value = ts.a;
                rows[i].querySelector('.in-b').value = ts.b;
                rows[i].querySelector('.in-c').value = ts.c;
                rows[i].querySelector('.in-deduct').value = ts.deductB;
            }
        });
        renderCalendar();
    }).catch((error) => {
        console.error("마진 설정 로드 실패:", error);
        renderCalendar();
    });
}

function saveMarginSettings() {
    const newTiers = [];
    const rows = document.querySelectorAll('#tierSettingsBody tr');
    rows.forEach((tr, i) => {
        let currentThreshold = 0;
        if (i === 1) currentThreshold = 100000000;
        else if (i === 2) currentThreshold = 200000000;
        else if (i === 3) currentThreshold = 300000000;
        newTiers.push({
            threshold: currentThreshold,
            a: parseFloat(tr.querySelector('.in-a').value) || 0,
            b: parseFloat(tr.querySelector('.in-b').value) || 0,
            c: parseFloat(tr.querySelector('.in-c').value) || 0,
            deductB: parseFloat(tr.querySelector('.in-deduct').value) || 0
        });
    });
    db.collection("settings").doc("progressive_margins").set({ tiers: newTiers }).then(() => {
        tierSettings = newTiers;
        document.getElementById('settingsModal').classList.remove('active');
        renderCalendar();
        alert("💾 마진율 조건이 성공적으로 변경 완료되었습니다.");
    }).catch((error) => alert("설정 저장 실패: " + error));
}

function loadTransactionsFromFirestore() {
    db.collection("dashboard_sales").onSnapshot((snapshot) => {
        globalSalesData = {};
        snapshot.forEach((doc) => {
            const data = doc.data();
            const dateKey = data.date;
            if (!dateKey) return;
            if (!globalSalesData[dateKey]) {
                globalSalesData[dateKey] = {
                    groupA: 0, groupB: 0, groupC: 0, groupD: 0,
                    originalTotal: 0, taxRefundTotal: 0, realPaymentTotal: 0
                };
            }
            globalSalesData[dateKey].originalTotal += (data.originalTotal || 0);
            globalSalesData[dateKey].taxRefundTotal += (data.taxRefundTotal || 0);
            globalSalesData[dateKey].realPaymentTotal += (data.realPaymentTotal || 0);
            globalSalesData[dateKey].groupA += (data.groupA || 0);
            globalSalesData[dateKey].groupB += (data.groupB || 0);
            globalSalesData[dateKey].groupC += (data.groupC || 0);
            globalSalesData[dateKey].groupD += (data.groupD || 0);
        });
        renderCalendar();
    });
}

function loadRawTransactionsFromFirestore() {
    db.collection("transactions").onSnapshot((snapshot) => {
        rawTransactions = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            rawTransactions.push({
                id: doc.id,
                date: data.date || "",
                vendor: data.vendor ? data.vendor.trim() : "",
                amount: parseFloat(data.total || 0),
                type: data.type || "",
                memo: data.memo || ""
            });
        });
        renderCalendar();
    });
}

function loadSyncedVendorsFromFirestore() {
    db.collection("settings").doc("synced_vendors").onSnapshot((doc) => {
        if (doc.exists) {
            syncedVendors = doc.data().vendors || [];
        } else {
            syncedVendors = [];
        }
        renderCalendar();
    });
}

// =================================================================
// [신규] 오늘 매출(크롤링) 실시간 표시
// =================================================================
function loadTodaySalesFromFirestore() {
    // 크롤러가 저장하는 위치: today_sales/{YYYY-MM-DD}
    // 매일 최신 문서를 구독하기 위해 오늘 날짜 문서를 실시간 구독
    const el = document.getElementById('todaySalesValue');
    const dateEl = document.getElementById('todaySalesDate');
    if (!el) return;

    // 항상 "가장 최근 크롤링" 문서를 보여준다 (crawledAt 최신순 1개)
    db.collection("today_sales")
      .orderBy("crawledAt", "desc")
      .limit(1)
      .onSnapshot((snap) => {
        if (snap.empty) {
            el.textContent = "수집된 매출 없음";
            if (dateEl) dateEl.textContent = "크롤러를 실행하세요";
            return;
        }
        const d = snap.docs[0].data();
        const total = d.todayTotal || 0;
        el.textContent = total.toLocaleString() + "원";
        if (dateEl) {
            const dateStr = d.date || "";
            let updated = "";
            if (d.crawledAt) {
                const t = d.crawledAt.toDate ? d.crawledAt.toDate() : new Date(d.crawledAt);
                updated = " · " + t.toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'}) + " 갱신";
            }
            dateEl.textContent = dateStr + " 오늘 매출" + updated;
        }

        // POS 연동 탭의 합계값도 갱신
        const el2 = document.getElementById('todaySalesValue2');
        if (el2) el2.textContent = total.toLocaleString() + "원";

        // POS 연동 탭의 매장별 리스트 갱신
        const listEl = document.getElementById('crawlStoreList');
        if (listEl && Array.isArray(d.stores)) {
            listEl.innerHTML = d.stores.map(s => `
                <div class="crawl-store-row">
                    <span class="csr-name">${s.storeName || s.storeCode || '-'}</span>
                    <span class="csr-amount">${(s.todaySales || 0).toLocaleString()}원</span>
                </div>`).join('');
        }
        // 갱신 시각 표시
        const updEl = document.getElementById('crawlLastUpdated');
        if (updEl && d.crawledAt) {
            const t = d.crawledAt.toDate ? d.crawledAt.toDate() : new Date(d.crawledAt);
            updEl.textContent = (d.date || '') + ' · ' + t.toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'}) + ' 갱신';
        }
      }, (err) => {
        console.error("오늘 매출 로드 실패:", err);
        el.textContent = "-";
        if (dateEl) dateEl.textContent = "불러오기 실패";
      });
}

// =================================================================
// 6. 거래처 동기화
// =================================================================
function loadLedgerVendors() {
    const select = document.getElementById('expVendorSelect');
    if(!select) return;
    select.innerHTML = '<option value="">-- 거래처를 선택하세요 --</option><option value="MANUAL_INPUT">[직접 수동 비용 항목 추가]</option>';
    db.collection("transactions").get().then((querySnapshot) => {
        const vendorSet = new Set();
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.vendor) { vendorSet.add(data.vendor.trim()); }
        });
        Array.from(vendorSet).sort().forEach((vendorName) => {
            const option = document.createElement('option');
            option.value = vendorName;
            option.textContent = vendorName;
            select.appendChild(option);
        });
    }).catch(err => { console.error("거래처 인덱스 로드 실패:", err); });
}

function toggleManualVendorInput() {
    const select = document.getElementById('expVendorSelect');
    const manualGroup = document.getElementById('manualVendorFormGroup');
    const expAmount = document.getElementById('expAmount');
    const expDate = document.getElementById('expDate');
    const expCategory = document.getElementById('expCategory');
    const expNote = document.getElementById('expNote');
    if (select && select.value === 'MANUAL_INPUT') {
        if(manualGroup) manualGroup.style.display = 'flex';
        if(expAmount) { expAmount.required = true; expAmount.disabled = false; }
        if(expDate) { expDate.required = true; expDate.disabled = false; }
        if(expCategory) { expCategory.disabled = false; }
        if(expNote) { expNote.disabled = false; expNote.value = ''; }
    } else if (select && select.value !== '') {
        if(manualGroup) manualGroup.style.display = 'none';
        if(expAmount) { expAmount.required = false; expAmount.disabled = true; expAmount.value = ''; }
        if(expDate) { expDate.required = false; expDate.disabled = true; expDate.value = ''; }
        if(expCategory) { expCategory.value = "의약품/자재구입"; expCategory.disabled = true; }
        if(expNote) { expNote.disabled = true; expNote.value = "장부 상시 자동 실결제 동기화 활성화 상태"; }
    }
}

function handleExpenseSubmit(e) {
    e.preventDefault();
    const selectVendor = document.getElementById('expVendorSelect').value;
    const manualVendor = document.getElementById('expVendorManual').value;
    const dateInput = document.getElementById('expDate').value;
    const amountInput = parseFloat(document.getElementById('expAmount').value) || 0;
    const categoryInput = document.getElementById('expCategory').value;
    const noteInput = document.getElementById('expNote').value;
    if (!selectVendor) { alert("거래처를 선택해 주세요."); return; }
    if (selectVendor !== 'MANUAL_INPUT') {
        if (!confirm(`💼 [${selectVendor}] 거래처를 상시 연동 거래처로 지정하시겠습니까?`)) return;
        db.collection("settings").doc("synced_vendors").set({
            vendors: firebase.firestore.FieldValue.arrayUnion(selectVendor)
        }, { merge: true }).then(() => {
            alert(`🚀 [${selectVendor}] 거래처가 상시 연동 리스트에 바인딩되었습니다.`);
            document.getElementById('expenseForm').reset();
            toggleManualVendorInput();
        }).catch(err => alert("상시 연동 처리 실패: " + err.message));
    } else {
        const finalVendor = manualVendor ? manualVendor.trim() : "수동 임의 경비";
        if (!dateInput || amountInput <= 0) { alert("정확한 지출 일자와 금액을 기입해 주세요."); return; }
        db.collection("dashboard_expenses").add({
            date: dateInput, vendor: finalVendor, amount: amountInput,
            category: categoryInput, note: noteInput,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            alert("💸 수동 비용 전표 내역이 성공적으로 추가 기록되었습니다.");
            document.getElementById('expenseForm').reset();
            document.getElementById('manualVendorFormGroup').style.display = 'none';
        }).catch(err => alert(err.message));
    }
}

function deleteSyncedVendorLink(vendorName) {
    if (confirm(`💼 [${vendorName}] 거래처의 상시 자동 연동을 해제하시겠습니까?`)) {
        db.collection("settings").doc("synced_vendors").update({
            vendors: firebase.firestore.FieldValue.arrayRemove(vendorName)
        }).then(() => {
            alert(`✅ [${vendorName}] 거래처 상시 연동 링크 해제 완료`);
        }).catch(err => alert("연동 해제 실패: " + err.message));
    }
}

function loadExpensesFromFirestore() {
    db.collection("dashboard_expenses").orderBy("date", "desc").onSnapshot((snapshot) => {
        rawManualExpenses = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            rawManualExpenses.push({
                id: doc.id, date: data.date, category: data.category,
                vendor: data.vendor, amount: data.amount, note: data.note
            });
        });
        renderCalendar();
    });
}

function deleteExpenseData(id) {
    if(confirm("해당 수동 비용 영수증 전표를 파기하시겠습니까?")) {
        db.collection("dashboard_expenses").doc(id).delete().catch(err => alert(err.message));
    }
}

// =================================================================
// 7. 엑셀 업로드 엔진
// =================================================================
function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    document.getElementById('fileName').textContent = file.name;
    const reader = new FileReader();
    reader.onload = function (e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheets = workbook.Sheets[workbook.SheetNames[0]];
        uploadExcelToFirestore(XLSX.utils.sheet_to_json(worksheets, { header: 1 }));
    };
    reader.readAsArrayBuffer(file);
}

async function uploadExcelToFirestore(rows) {
    let validRowCount = 0;
    let duplicateCount = 0;
    const seenRecords = new Set();
    const uploadPackets = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        const dateKey = parseExcelDate(row[COL_DATE]);
        if (!dateKey || dateKey.includes('소계') || dateKey.includes('합계')) continue;
        const origAmt = parseAmount(row[COL_ORIG]);
        const taxAmt = parseAmount(row[COL_TAX]);
        const realAmt = parseAmount(row[COL_REAL]);
        const prodCode = String(row[COL_CODE] || '').trim();
        const inputTime = parseExcelTime(row[COL_TIME]);
        const group = determineGroup(prodCode);
        const uniqueKey = `${inputTime}_${realAmt}_${prodCode}`;
        if (seenRecords.has(uniqueKey)) { duplicateCount++; continue; }
        seenRecords.add(uniqueKey);
        const safeDocId = `doc_${dateKey}_${uniqueKey.replace(/[^a-zA-Z0-9]/g, '_')}`;
        uploadPackets.push({
            id: safeDocId,
            data: {
                date: dateKey, originalTotal: origAmt, taxRefundTotal: taxAmt,
                realPaymentTotal: realAmt,
                groupA: group === 'A' ? realAmt : 0,
                groupB: group === 'B' ? realAmt : 0,
                groupC: group === 'C' ? realAmt : 0,
                groupD: group === 'D' ? realAmt : 0,
                productCode: prodCode, inputTime: inputTime
            }
        });
        validRowCount++;
    }
    if (validRowCount === 0) {
        alert("⚠️ 업로드 실패: 유효한 데이터 행이 없거나 엑셀 열 배치가 올바르지 않습니다.");
        return;
    }
    try {
        const chunkSize = 400;
        for (let i = 0; i < uploadPackets.length; i += chunkSize) {
            const chunk = uploadPackets.slice(i, i + chunkSize);
            const batch = db.batch();
            chunk.forEach(packet => {
                const docRef = db.collection("dashboard_sales").doc(packet.id);
                batch.set(docRef, packet.data);
            });
            await batch.commit();
        }
        alert(`🚀 업로드 완벽 성공!\n\n- 정상 등록: ${validRowCount}건\n- 중복 제외 필터: ${duplicateCount}건이 제외되었습니다.`);
    } catch (err) {
        console.error("Firestore 배치 커밋 실패:", err);
        alert("❌ 클라우드 서버 전송 중 에러가 발생했습니다:\n" + err.message);
    }
}

function deleteDateData(dateKey) {
    if (!confirm(`${dateKey}일 매출 자료를 전부 삭제하시겠습니까?`)) return;
    db.collection("dashboard_sales").where("date", "==", dateKey).get().then((snap) => {
        const batch = db.batch();
        snap.forEach((doc) => batch.delete(doc.ref));
        return batch.commit();
    }).then(() => alert("삭제 완료"));
}

// =================================================================
// 8. 날짜 유틸리티
// =================================================================
function parseExcelDate(val) {
    if (!val) return null;
    if (val instanceof Date) return formatDateObject(val);
    if (typeof val === 'number') return formatDateObject(new Date((val - 25569) * 86400 * 1000));
    const str = String(val).trim();
    return str ? str.split(' ')[0] : null;
}

function formatDateObject(dateObj) {
    if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) return "";
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function parseExcelTime(val) {
    if (!val) return '';
    if (val instanceof Date) {
        return `${formatDateObject(val)} ${String(val.getHours()).padStart(2,'0')}:${String(val.getMinutes()).padStart(2,'0')}:${String(val.getSeconds()).padStart(2,'0')}`;
    }
    if (typeof val === 'number') return val.toFixed(6);
    return String(val).trim();
}

function determineGroup(code) {
    if (!code) return 'C';
    const f = code.charAt(0).toUpperCase();
    if (f === 'A') return 'A';
    if (f === 'B') return 'B';
    return /[A-Z]/.test(f) ? 'C' : 'D';
}

function parseAmount(val) {
    if (typeof val === 'number') return val;
    return parseFloat(String(val || '').replace(/,/g, '')) || 0;
}

// =================================================================
// 9. 시각화 및 정산
// =================================================================
function draw3DPieChart(a, b, c, d) {
    if (typeof google === 'undefined' || !isChartLibLoaded || (!a && !b && !c && !d)) {
        const el = document.getElementById('chartSection'); if (el) el.style.display = 'none'; return;
    }
    const el = document.getElementById('chartSection'); if (el) el.style.display = 'block';
    const data = google.visualization.arrayToDataTable([['Group', 'Sales'], ['그룹 A', a], ['그룹 B', b], ['그룹 C', c], ['그룹 D', d]]);
    const chart = new google.visualization.PieChart(document.getElementById('piechart_3d'));
    chart.draw(data, { is3D: true, slices: { 0:{color:'#81c784'}, 1:{color:'#4db6ac'}, 2:{color:'#afb42b'}, 3:{color:'#a1887f'} }, backgroundColor:'transparent', chartArea:{left:'5%',top:'5%',width:'90%',height:'90%'} });
}

function updateSummaryUI(sum, tier, totalMonthlyExpense) {
    const m = calculateProfit(sum, tier);
    const finalTotalMargin = m.a + m.b + m.c + m.d + tier.deductB;
    const pctReal = sum.realPaymentTotal > 0 ? ((finalTotalMargin / sum.realPaymentTotal) * 100).toFixed(1) : '0.0';
    const pctA = sum.groupA > 0 ? ((m.a / sum.groupA) * 100).toFixed(1) : '0.0';
    const pctB = sum.groupB > 0 ? (((m.b + tier.deductB) / sum.groupB) * 100).toFixed(1) : '0.0';
    const pctC = sum.groupC > 0 ? ((m.c / sum.groupC) * 100).toFixed(1) : '0.0';
    const pctD = sum.groupD > 0 ? ((m.d / sum.groupD) * 100).toFixed(1) : '0.0';
    document.getElementById('totalOrig').textContent = sum.originalTotal.toLocaleString() + '원';
    document.getElementById('totalTax').textContent = sum.taxRefundTotal.toLocaleString() + '원';
    document.getElementById('totalReal').innerHTML = `${sum.realPaymentTotal.toLocaleString()}원 <div style="color:#e53935; font-size:12px; font-weight:600; margin-top:4px;">(${Math.round(finalTotalMargin).toLocaleString()}원, ${pctReal}%)</div>`;
    document.getElementById('totalA').innerHTML = `${sum.groupA.toLocaleString()}원 <div style="color:#e53935; font-size:12px; font-weight:600; margin-top:4px;">(${Math.round(m.a).toLocaleString()}원, ${pctA}%)</div>`;
    document.getElementById('totalB').innerHTML = `${sum.groupB.toLocaleString()}원 <div style="color:#e53935; font-size:12px; font-weight:600; margin-top:4px;">(${Math.round(m.b + tier.deductB).toLocaleString()}원, ${pctB}%)</div>`;
    document.getElementById('totalC').innerHTML = `${sum.groupC.toLocaleString()}원 <div style="color:#e53935; font-size:12px; font-weight:600; margin-top:4px;">(${Math.round(m.c).toLocaleString()}원, ${pctC}%)</div>`;
    document.getElementById('totalD').innerHTML = `${sum.groupD.toLocaleString()}원 <div style="color:#e53935; font-size:12px; font-weight:600; margin-top:4px;">(${Math.round(m.d).toLocaleString()}원, ${pctD}%)</div>`;
    const summaryCardSec = document.getElementById('summarySection');
    if (summaryCardSec) summaryCardSec.style.display = 'grid';
    const finalOperatingProfit = finalTotalMargin - totalMonthlyExpense;
    const netProfitRate = sum.realPaymentTotal > 0 ? ((finalOperatingProfit / sum.realPaymentTotal) * 100).toFixed(1) : '0.0';
    document.getElementById('profitReportTitle').textContent = `${currentYear}년 ${(currentMonth + 1).toString().padStart(2, '0')}월 영업손익 보고서`;
    document.getElementById('pMetricReal').textContent = sum.realPaymentTotal.toLocaleString() + " 원";
    document.getElementById('pMetricMargin').textContent = Math.round(finalTotalMargin).toLocaleString() + " 원";
    document.getElementById('pMetricExpense').textContent = totalMonthlyExpense.toLocaleString() + " 원";
    document.getElementById('pMetricNetProfit').textContent = Math.round(finalOperatingProfit).toLocaleString() + " 원";
    document.getElementById('pMetricNetRate').textContent = `최종 순 영업이익률: ${netProfitRate}%`;
    const netBox = document.getElementById('netProfitBox');
    if (netBox) { netBox.style.background = finalOperatingProfit < 0 ? "#fdf2f2" : "var(--primary-light)"; }
    draw3DPieChart(sum.groupA, sum.groupB, sum.groupC, sum.groupD);
}

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    if (!grid) return;
    grid.innerHTML = '';
    document.getElementById('calendarTitle').textContent = `${currentYear}년 ${(currentMonth + 1).toString().padStart(2, '0')}월`;
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    const lastDate = new Date(currentYear, currentMonth + 1, 0).getDate();
    let monthlyData = { originalTotal:0, taxRefundTotal:0, realPaymentTotal:0, groupA:0, groupB:0, groupC:0, groupD:0 };
    let totalMonthlyExpense = 0;
    let dailyExpenseMap = {};
    let activeMonthExpenseList = [];
    for (let d = 1; d <= lastDate; d++) {
        const dateKey = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${dayToTwoDigits(d)}`;
        if (globalSalesData[dateKey]) {
            const dayData = globalSalesData[dateKey];
            monthlyData.originalTotal += dayData.originalTotal; monthlyData.taxRefundTotal += dayData.taxRefundTotal; monthlyData.realPaymentTotal += dayData.realPaymentTotal;
            monthlyData.groupA += dayData.groupA; monthlyData.groupB += dayData.groupB; monthlyData.groupC += dayData.groupC; monthlyData.groupD += dayData.groupD;
        }
    }
    rawTransactions.forEach(t => {
        if (syncedVendors.includes(t.vendor) && (t.type === 'buy' || t.amount > 0)) {
            if (t.date) {
                const parts = t.date.split('-');
                if (parts.length >= 2) {
                    const tYear = parseInt(parts[0]);
                    const tMonth = parseInt(parts[1]) - 1;
                    if (tYear === currentYear && tMonth === currentMonth) {
                        if (!dailyExpenseMap[t.date]) dailyExpenseMap[t.date] = 0;
                        dailyExpenseMap[t.date] += t.amount;
                        totalMonthlyExpense += t.amount;
                        activeMonthExpenseList.push({
                            id: t.id, isSynced: true, date: t.date,
                            category: "의약품/자재구입", vendor: t.vendor,
                            amount: t.amount, note: t.memo || "장부 상시 자동 연동됨"
                        });
                    }
                }
            }
        }
    });
    rawManualExpenses.forEach(e => {
        if (e.date) {
            const parts = e.date.split('-');
            if (parts.length >= 2) {
                const eYear = parseInt(parts[0]);
                const eMonth = parseInt(parts[1]) - 1;
                if (eYear === currentYear && eMonth === currentMonth) {
                    if (!dailyExpenseMap[e.date]) dailyExpenseMap[e.date] = 0;
                    dailyExpenseMap[e.date] += e.amount;
                    totalMonthlyExpense += e.amount;
                    activeMonthExpenseList.push({
                        id: e.id, isSynced: false, date: e.date,
                        category: e.category, vendor: e.vendor,
                        amount: e.amount, note: e.note || ""
                    });
                }
            }
        }
    });
    activeMonthExpenseList.sort((a, b) => b.date.localeCompare(a.date));
    const tbody = document.getElementById('expenseTableBody');
    if (tbody) {
        tbody.innerHTML = '';
        if (activeMonthExpenseList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="placeholder-text">선택한 월에 청구된 지출 비용 내역이 없습니다.</td></tr>';
        } else {
            activeMonthExpenseList.forEach(item => {
                const tr = document.createElement('tr');
                const deleteBtn = item.isSynced
                    ? `<button onclick="deleteSyncedVendorLink('${item.vendor}')" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:11px; font-weight:600; padding:2px 4px;">[연동해제]</button>`
                    : `<button onclick="deleteExpenseData('${item.id}')" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:18px; font-weight:bold;">&times;</button>`;
                const typeBadge = item.isSynced
                    ? `<span class="badge" style="background:#4db6ac">장부연동</span>`
                    : `<span class="badge" style="background:#70857a">${item.category}</span>`;
                tr.innerHTML = `
                    <td>${item.date}</td>
                    <td>${typeBadge}</td>
                    <td><strong>${item.vendor}</strong></td>
                    <td style="color:#ef4444; font-weight:700;">-${item.amount.toLocaleString()}원</td>
                    <td style="text-align:left; font-size:13px;">${item.note || '-'}</td>
                    <td>${deleteBtn}</td>`;
                tbody.appendChild(tr);
            });
        }
    }
    const activeTier = getActiveTier(monthlyData.realPaymentTotal);
    updateSummaryUI(monthlyData, activeTier, totalMonthlyExpense);
    for (let i = 0; i < firstDayIndex; i++) grid.appendChild(createEmptyCell());
    for (let day = 1; day <= lastDate; day++) {
        const dayCell = document.createElement('div'); dayCell.className = 'calendar-day';
        if ((firstDayIndex + day - 1) % 7 === 0) dayCell.classList.add('sun');
        if ((firstDayIndex + day - 1) % 7 === 6) dayCell.classList.add('sat');
        dayCell.innerHTML = `<span class="day-num">${day}</span>`;
        const dateKey = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${dayToTwoDigits(day)}`;
        if (globalSalesData[dateKey]) {
            dayCell.classList.add('has-data');
            const dayData = globalSalesData[dateKey];
            const m = calculateProfit(dayData, activeTier);
            dayCell.innerHTML += `<div class="day-summary">₩${dayData.realPaymentTotal.toLocaleString()}</div><div class="day-margin">(₩${(m.a+m.b+m.c+m.d).toLocaleString()})</div>`;
            if (dailyExpenseMap[dateKey]) dayCell.innerHTML += `<div style="font-size:10px; color:#ef4444; font-weight:700; text-align:right;">비용: -${dailyExpenseMap[dateKey].toLocaleString()}원</div>`;
            dayCell.addEventListener('click', () => showDayDetail(dateKey, activeTier));
        } else if (dailyExpenseMap[dateKey]) {
            dayCell.innerHTML += `<div style="margin-top:auto; font-size:10px; color:#ef4444; font-weight:700; text-align:right;">비용: -${dailyExpenseMap[dateKey].toLocaleString()}원</div>`;
        }
        grid.appendChild(dayCell);
    }
}

function showDayDetail(dateKey, tier) {
    const data = globalSalesData[dateKey]; if(!data) return;
    document.getElementById('selectedDateText').textContent = dateKey;
    const container = document.getElementById('detailContent'); if(!container) return;
    const m = calculateProfit(data, tier); const estimatedMargin = m.a + m.b + m.c + m.d;
    const marginPercent = data.realPaymentTotal > 0 ? ((estimatedMargin / data.realPaymentTotal) * 100).toFixed(1) : '0.0';
    container.innerHTML = `
        <div class="detail-item-list">
            <div class="detail-row group-A"><span>그룹 A 매출 (마진 ${tier.a}%)</span><span>${data.groupA.toLocaleString()} 원 <span style="color:#e53935; font-size:12px; font-weight:600; margin-left:4px;">(${m.a.toLocaleString()} 원)</span></span></div>
            <div class="detail-row group-B"><span>그룹 B 매출 (마진 ${tier.b}%)</span><span><strong>${data.groupB.toLocaleString()} 원</strong> <span style="color:#e53935; font-size:12px; font-weight:600; margin-left:4px;">(${m.b.toLocaleString()} 원)</span></span></div>
            <div class="detail-row group-C"><span>그룹 C 매출 (마진 ${tier.c}%)</span><span>${data.groupC.toLocaleString()} 원 <span style="color:#e53935; font-size:12px; font-weight:600; margin-left:4px;">(${m.c.toLocaleString()} 원)</span></span></div>
            <div class="detail-row group-D"><span>그룹 D 매출 (마진 25%)</span><span>${data.groupD.toLocaleString()} 원 <span style="color:#e53935; font-size:12px; font-weight:600; margin-left:4px;">(${m.d.toLocaleString()} 원)</span></span></div>
            <div class="detail-row"><span>원판매금액 합계 (AE열)</span><span style="font-weight:600; color:#2c3e50;">${data.originalTotal.toLocaleString()} 원</span></div>
            <div class="detail-row"><span>텍스리펀 환급액 (AA열)</span><span style="font-weight:600; color:#2c3e50;">${data.taxRefundTotal.toLocaleString()} 원</span></div>
            <div class="detail-row total-row"><span>실 결제금액 합계 (AF열)</span><span style="font-weight:700; color:var(--primary-dark);">${data.realPaymentTotal.toLocaleString()} 원 <span style="color:#e53935; font-size:12px; font-weight:600; margin-left:4px;">(${estimatedMargin.toLocaleString()} 원, ${marginPercent}%)</span></span></div>
            <div class="detail-row" style="border-left-color: var(--accent-red); background: #fdf2f2;"><span class="label" style="color: var(--accent-red); font-weight:700;">일일 총 예상마진 합계</span><span class="val" style="color: var(--accent-red); font-weight:700; font-size:16px;">${estimatedMargin.toLocaleString()} 원</span></div>
            <p style="font-size: 11px; color: #70857a; margin-top: 8px; padding: 0 4px; line-height: 1.4;">* 당월 총 실결제 매출액 구간 [₩${tier.threshold.toLocaleString()} 이상] 요율 세트가 실시간 동적 적용되었습니다.</p>
            <button onclick="deleteDateData('${dateKey}')" style="width: 100%; margin-top: 14px; padding: 12px; background-color: #fee2e2; color: #ef4444; border: 1px solid #fca5a5; border-radius: 8px; font-weight: 600; cursor: pointer;">🗑 이 날짜의 모든 데이터 삭제하기</button>
        </div>`;
}

function dayToTwoDigits(day) { return day.toString().padStart(2, '0'); }
function changeMonth(offset) { currentMonth += offset; if (currentMonth < 0) { currentMonth = 11; currentYear--; } else if (currentMonth > 11) { currentMonth = 0; currentYear++; } renderCalendar(); }
function createEmptyCell() { const e = document.createElement('div'); e.className = 'calendar-day empty'; return e; }

renderCalendar();