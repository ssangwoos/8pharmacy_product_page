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

// Firebase 초기화 (Compat 모드)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();

// =================================================================
// 2. 글로벌 상태 변수 관리
// =================================================================
let globalSalesData = {};       // 이번 대시보드 전용 날짜별 매출 집계 데이터 저장소
let rawManualExpenses = [];     // 수동으로 개별 등록한 지출 비용 원본 데이터 배열
let rawTransactions = [];       // 원격 transactions 컬렉션의 실시간 전표 데이터 배열
let syncedVendors = [];         // 상시 자동 연동이 활성화된 거래처 명단 배열
let currentYear = 2026;
let currentMonth = 5;           // 0-indexed (5 = 6월)

// 누진 구간별 요율 세팅 규칙 배열 기본값 (image_69897e.png 표준 매핑)
let tierSettings = [
    { threshold: 0, a: 20, b: 20, c: 70, deductB: 0 },                  // 1구간: 0 ~ 1억 이하
    { threshold: 100000000, a: 15, b: 15, c: 80, deductB: -1500000 },   // 2구간: 1억 초과 ~ 2억 이하
    { threshold: 200000000, a: 10, b: 10, c: 90, deductB: -3000000 },   // 3구간: 2억 초과 ~ 3억 이하
    { threshold: 300000000, a: 7.5, b: 7.5, c: 90, deductB: 0 }         // 4구간: 3억 초과
];
const MARGIN_D_FIXED = 25; // 그룹 D 마진율 25% 고정

// 엑셀 열 인덱스 매핑 (0-based)
const COL_DATE = 1;   // B열: 판매일자
const COL_CODE = 9;   // J열: 상품코드
const COL_TAX = 26;   // AA열: 즉시환급
const COL_ORIG = 30;  // AE열: 순판매(할인제외) -> 원판매금액
const COL_REAL = 31;  // AF열: 순판매(할인포함) -> 실결제금액
const COL_TIME = 49;  // AX열: 입력시간

// =================================================================
// 3. 비동기 데이터 처리 순서 오류(ReferenceError) 방지 최상단 연산 엔진
// =================================================================

// 월 총매출 기준 구간(Tier) 확정 판독 함수
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

// 구간 요율 기반 매출 마진 연산 함수
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

// GOOGLE CHARTS 안전 로딩 및 예외 처리 가드 레이어
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
// 4. 라이프사이클 초기화 및 이벤트 리스너 완전 결합 (먹통 버그 완벽 수정)
// =================================================================
function initDashboard() {
    // 캘린더 및 업로드 제어 이벤트 바인딩 가드
    const excelFile = document.getElementById('excelFile');
    if (excelFile) excelFile.onchange = handleFileUpload;

    const prevMonthBtn = document.getElementById('prevMonth');
    if (prevMonthBtn) prevMonthBtn.onclick = () => changeMonth(-1);

    const nextMonthBtn = document.getElementById('nextMonth');
    if (nextMonthBtn) nextMonthBtn.onclick = () => changeMonth(1);

    // 모달 제어 리스너 바인딩 안정화
    const openSettingsBtn = document.getElementById('openSettingsBtn');
    if (openSettingsBtn) openSettingsBtn.onclick = () => document.getElementById('settingsModal').classList.add('active');

    const closeModalBtn = document.getElementById('closeModalBtn');
    if (closeModalBtn) closeModalBtn.onclick = () => document.getElementById('settingsModal').classList.remove('active');

    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    if (saveSettingsBtn) saveSettingsBtn.onclick = saveMarginSettings;

    // 지출 폼 서브밋 등록
    const expenseForm = document.getElementById('expenseForm');
    if (expenseForm) expenseForm.onsubmit = handleExpenseSubmit;

    // 파이어베이스 데이터 스트림 실시간 동기화 구동
    loadMarginsFromFirestore();       
    loadTransactionsFromFirestore();  
    loadLedgerVendors();              
    loadExpensesFromFirestore();      
    loadRawTransactionsFromFirestore(); // 장부 실시간 감시 레이어 가동
    loadSyncedVendorsFromFirestore();   // 상시 연동 거래처 설정 레이어 가동
}

// 문서 로딩 시점에 따른 가동 예외 가드 처리
if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initDashboard);
} else {
    initDashboard();
}

// 탭 스위칭 컴포넌트 유틸리티
function switchTab(tabContentId, element) {
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(tabContentId).classList.add('active');
    element.classList.add('active');
    
    renderCalendar(); 
}

// =================================================================
// 5. FIRESTORE 실시간 데이터 연동 동기화 명세 파트
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

// 원격 장부 전표 스냅샷 리스너 
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
        renderCalendar(); // 장부 기록 변동 시 캘린더/손익 자동 리렌더링
    });
}

// 상시 동기화 지정 거래처 명단 스냅샷 리스너
function loadSyncedVendorsFromFirestore() {
    db.collection("settings").doc("synced_vendors").onSnapshot((doc) => {
        if (doc.exists) {
            syncedVendors = doc.data().vendors || [];
        } else {
            syncedVendors = [];
        }
        renderCalendar(); // 상시연동 리스트 변경 시 데이터 즉시 리프레시
    });
}


// =================================================================
// 6. 거래처 동기화 및 실시간 상시 연동 제어 파트 (비용 연동 고도화 수선)
// =================================================================
function loadLedgerVendors() {
    const select = document.getElementById('expVendorSelect');
    if(!select) return;
    
    select.innerHTML = '<option value="">-- 거래처를 선택하세요 --</option><option value="MANUAL_INPUT">[직접 수동 비용 항목 추가]</option>';
    
    db.collection("transactions").get().then((querySnapshot) => {
        const vendorSet = new Set();
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.vendor) {
                vendorSet.add(data.vendor.trim()); 
            }
        });

        Array.from(vendorSet).sort().forEach((vendorName) => {
            const option = document.createElement('option');
            option.value = vendorName;
            option.textContent = vendorName;
            select.appendChild(option);
        });
    }).catch(err => {
        console.error("거래처 인덱스 로드 실패:", err);
    });
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
        // 상시 연동 모드일 시 날짜와 비용 금액은 매달 장부에서 동적으로 끌어오므로 잠금 제어
        if(expAmount) { expAmount.required = false; expAmount.disabled = true; expAmount.value = ''; }
        if(expDate) { expDate.required = false; expDate.disabled = true; expDate.value = ''; }
        if(expCategory) { expCategory.value = "의약품/자재구입"; expCategory.disabled = true; }
        if(expNote) { expNote.disabled = true; expNote.value = "장부 상시 자동 실결제 동기화 활성화 상태"; }
    }
}

// [핵심 변경 및 수선] 상시 자동 연동 등록 및 수동 추가 분기 처리 스크립트
function handleExpenseSubmit(e) {
    e.preventDefault();
    const selectVendor = document.getElementById('expVendorSelect').value;
    const manualVendor = document.getElementById('expVendorManual').value;
    const dateInput = document.getElementById('expDate').value;
    const amountInput = parseFloat(document.getElementById('expAmount').value) || 0;
    const categoryInput = document.getElementById('expCategory').value;
    const noteInput = document.getElementById('expNote').value;

    if (!selectVendor) {
        alert("거래처를 선택해 주세요.");
        return;
    }

    if (selectVendor !== 'MANUAL_INPUT') {
        if (!confirm(`💼 [${selectVendor}] 거래처를 상시 연동 거래처로 지정하시겠습니까?\n지정 시 원격 장부에 기입되는 모든 월별 매입금액이 실시간 대시보드 비용에 평생 자동 반영됩니다.`)) return;

        // settings/synced_vendors 문서에 배열 유니온으로 상시 연동 키 추가 결합
        db.collection("settings").doc("synced_vendors").set({
            vendors: firebase.firestore.FieldValue.arrayUnion(selectVendor)
        }, { merge: true }).then(() => {
            alert(`🚀 [${selectVendor}] 거래처가 상시 연동 리스트에 바인딩되었습니다.\n이제 달력을 넘길 때마다 해당 월의 장부 금액만 동적으로 자동 취합됩니다.`);
            document.getElementById('expenseForm').reset();
            toggleManualVendorInput();
        }).catch(err => alert("상시 연동 처리 실패: " + err.message));

    } else {
        // 수동 비용 기입 추가 모드
        const finalVendor = manualVendor ? manualVendor.trim() : "수동 임의 경비";
        if (!dateInput || amountInput <= 0) {
            alert("정확한 지출 일자와 금액을 기입해 주세요.");
            return;
        }

        db.collection("dashboard_expenses").add({
            date: dateInput,
            vendor: finalVendor,
            amount: amountInput,
            category: categoryInput,
            note: noteInput,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            alert("💸 수동 비용 전표 내역이 성공적으로 추가 기록되었습니다.");
            document.getElementById('expenseForm').reset();
            document.getElementById('manualVendorFormGroup').style.display = 'none';
        }).catch(err => alert(err.message));
    }
}

// 상시 자동 연동 해제 구현 함수
function deleteSyncedVendorLink(vendorName) {
    if (confirm(`💼 [${vendorName}] 거래처의 상시 자동 연동을 해제하시겠습니까?\n해제 시 비용 분석 및 장부 연계 지표에서 실시간으로 스킵 처리됩니다.`)) {
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
                id: doc.id,
                date: data.date,
                category: data.category,
                vendor: data.vendor,
                amount: data.amount,
                note: data.note
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
// 7. 엑셀 업로드 유틸리티 엔진
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

function uploadExcelToFirestore(rows) {
    const batch = db.batch(); let validRowCount = 0; let duplicateCount = 0; const seenRecords = new Set();
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i]; if (!row || row.length === 0) continue;
        const dateKey = parseExcelDate(row[COL_DATE]); if (!dateKey || dateKey.includes('소계') || dateKey.includes('합계')) continue;
        const origAmt = parseAmount(row[COL_ORIG]); const taxAmt = parseAmount(row[COL_TAX]); const realAmt = parseAmount(row[COL_REAL]);
        const prodCode = String(row[COL_CODE] || '').trim(); const inputTime = parseExcelTime(row[COL_TIME]); const group = determineGroup(prodCode);
        const uniqueKey = `${inputTime}_${realAmt}_${prodCode}`;
        if (seenRecords.has(uniqueKey)) { duplicateCount++; continue; } seenRecords.add(uniqueKey);
        const docRef = db.collection("dashboard_sales").doc(`doc_${dateKey}_${uniqueKey.replace(/[^a-zA-Z0-9]/g, '_')}`);
        batch.set(docRef, { date: dateKey, originalTotal: origAmt, taxRefundTotal: taxAmt, realPaymentTotal: realAmt, groupA: group === 'A' ? realAmt : 0, groupB: group === 'B' ? realAmt : 0, groupC: group === 'C' ? realAmt : 0, groupD: group === 'D' ? realAmt : 0, productCode: prodCode, inputTime: inputTime });
        validRowCount++;
    }
    if (validRowCount === 0) return;
    batch.commit().then(() => alert(`🚀 업로드 성공: ${validRowCount}건 / 중복 제외 필터: ${duplicateCount}건`));
}

function deleteDateData(dateKey) {
    if (!confirm(`${dateKey}일 매출 자료를 전부 삭제하시겠습니까?`)) return;
    db.collection("dashboard_sales").where("date", "==", dateKey).get().then((snap) => {
        const batch = db.batch();
        snap.forEach((doc) => batch.delete(doc.ref));
        return batch.commit();
    }).then(() => alert("삭제 완료"));
}

function parseExcelDate(val) { if (!val) return null; if (val instanceof Date) return formatDateObject(val); if (typeof val === 'number') return formatDateObject(new Date((val - 25569) * 86400 * 1000)); const str = String(val).trim(); return str ? str.split(' ')[0] : null; }
function parseExcelTime(val) { if (!val) return ''; if (val instanceof Date) { return `${formatDateObject(val)} ${String(val.getHours()).padStart(2,'0')}:${String(val.getMinutes()).padStart(2,'0')}:${String(val.getSeconds()).padStart(2,'0')}`; } if (typeof val === 'number') return val.toFixed(6); return String(val).trim(); }
function determineGroup(code) { if (!code) return 'C'; const f = code.charAt(0).toUpperCase(); if (f === 'A') return 'A'; if (f === 'B') return 'B'; return /[A-Z]/.test(f) ? 'C' : 'D'; }
function parseAmount(val) { if (typeof val === 'number') return val; return parseFloat(String(val || '').replace(/,/g, '')) || 0; }

// =================================================================
// 8. 시각화 및 종합 정산 디스플레이 구조 통합 제어단 (복구 및 누진 융합 파트)
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

// [복구 완료] 상단 7가지 요약 대시보드 카드에 실시간 누진 연산 결과 출력 매핑
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
    
    // [이미지 일치 복구] 상단 카드 내부에 마진금액 및 퍼센트 바인딩 활성화 
    document.getElementById('totalReal').innerHTML = `${sum.realPaymentTotal.toLocaleString()}원 <div style="color:#e53935; font-size:12px; font-weight:600; margin-top:4px;">(${Math.round(finalTotalMargin).toLocaleString()}원, ${pctReal}%)</div>`;
    document.getElementById('totalA').innerHTML = `${sum.groupA.toLocaleString()}원 <div style="color:#e53935; font-size:12px; font-weight:600; margin-top:4px;">(${Math.round(m.a).toLocaleString()}원, ${pctA}%)</div>`;
    document.getElementById('totalB').innerHTML = `${sum.groupB.toLocaleString()}원 <div style="color:#e53935; font-size:12px; font-weight:600; margin-top:4px;">(${Math.round(m.b + tier.deductB).toLocaleString()}원, ${pctB}%)</div>`;
    document.getElementById('totalC').innerHTML = `${sum.groupC.toLocaleString()}원 <div style="color:#e53935; font-size:12px; font-weight:600; margin-top:4px;">(${Math.round(m.c).toLocaleString()}원, ${pctC}%)</div>`;
    document.getElementById('totalD').innerHTML = `${sum.groupD.toLocaleString()}원 <div style="color:#e53935; font-size:12px; font-weight:600; margin-top:4px;">(${Math.round(m.d).toLocaleString()}원, ${pctD}%)</div>`;

    const summaryCardSec = document.getElementById('summarySection');
    if (summaryCardSec) summaryCardSec.style.display = 'grid'; // 매출 탭 진입 시 요약 노출 강제화

    // 최하단 손익분석 탭 연산 지표 출력 매핑
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

// [핵심 로직 개편] 달력 및 지출 명세서를 선택한 월에 연동하여 하이브리드 자동 취합
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

    // 1단계: 월간 매출 총액 누적 산출
    for (let d = 1; d <= lastDate; d++) {
        const dateKey = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${dayToTwoDigits(d)}`;
        if (globalSalesData[dateKey]) {
            const dayData = globalSalesData[dateKey];
            monthlyData.originalTotal += dayData.originalTotal; monthlyData.taxRefundTotal += dayData.taxRefundTotal; monthlyData.realPaymentTotal += dayData.realPaymentTotal;
            monthlyData.groupA += dayData.groupA; monthlyData.groupB += dayData.groupB; monthlyData.groupC += dayData.groupC; monthlyData.groupD += dayData.groupD;
        }
    }

    // 2단계: 상시 연동 활성화된 거래처의 장부 데이터 중 현재 선택 연월 조건에 일치하는 건만 실시간 누적 추출
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
                            id: t.id,
                            isSynced: true,
                            date: t.date,
                            category: "의약품/자재구입",
                            vendor: t.vendor,
                            amount: t.amount,
                            note: t.memo || "장부 상시 자동 연동됨"
                        });
                    }
                }
            }
        }
    });

    // 3단계: 개별 수동 등록한 비용 명세서 중 현재 선택 연월 조건에 일치하는 비용 일괄 누적
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
                        id: e.id,
                        isSynced: false,
                        date: e.date,
                        category: e.category,
                        vendor: e.vendor,
                        amount: e.amount,
                        note: e.note || ""
                    });
                }
            }
        }
    });

    // [월별 정렬 바인딩] 이번 달 지출 명세서 테이블 렌더링 출력
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
                    <td>${deleteBtn}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    }

    // 최종 마진 티어 세트 확정 및 UI 연동단 가동
    const activeTier = getActiveTier(monthlyData.realPaymentTotal);
    updateSummaryUI(monthlyData, activeTier, totalMonthlyExpense);

    // 일별 캘린더 생성 및 비용 뱃지 동적 주입
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
            
            // 수동비용과 상시연동 장부 비용이 취합된 당일 총 비용 마커 피드백
            if (dailyExpenseMap[dateKey]) dayCell.innerHTML += `<div style="font-size:10px; color:#ef4444; font-weight:700; text-align:right; margin-top:2px;">비용: -${dailyExpenseMap[dateKey].toLocaleString()}원</div>`;
            dayCell.addEventListener('click', () => showDayDetail(dateKey, activeTier));
        } else if (dailyExpenseMap[dateKey]) {
            dayCell.innerHTML += `<div style="margin-top:auto; font-size:10px; color:#ef4444; font-weight:700; text-align:right;">비용: -${dailyExpenseMap[dateKey].toLocaleString()}원</div>`;
        }
        grid.appendChild(dayCell);
    }
}

// [완벽 원복] image_5be9a4.png 디자인과 100% 동일한 우측 일별 디테일 렌더러
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
            <p style="font-size: 11px; color: #70857a; margin-top: 8px; padding: 0 4px; line-height: 1.4;">* 당월 총 실결제 매출액 구간 [₩${tier.threshold.toLocaleString()} 이상] 요율 세트가 실시간 동적 적용되었습니다. (B그룹 누진공제액은 상단 월간 종합 요약 카드 마진에 반영됩니다.)</p>
            <button onclick="deleteDateData('${dateKey}')" style="width: 100%; margin-top: 14px; padding: 12px; background-color: #fee2e2; color: #ef4444; border: 1px solid #fca5a5; border-radius: 8px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.2s;" onmouseover="this.style.backgroundColor='#fecaca'" onmouseout="this.style.backgroundColor='#fee2e2'"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg> 이 날짜의 모든 데이터 삭제하기</button>
        </div>`;
}

function dayToTwoDigits(day) { return day.toString().padStart(2, '0'); }
function changeMonth(offset) { currentMonth += offset; if (currentMonth < 0) { currentMonth = 11; currentYear--; } else if (currentMonth > 11) { currentMonth = 0; currentYear++; } renderCalendar(); }
function createEmptyCell() { const e = document.createElement('div'); e.className = 'calendar-day empty'; return e; }

renderCalendar();