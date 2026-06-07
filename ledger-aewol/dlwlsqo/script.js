// =================================================================
// 1. FIREBASE 설정 및 초기화
// =================================================================
// ※ 중요: Firebase 콘솔 -> 프로젝트 설정에서 발급받은 실제 키값으로 교체해 주세요!
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
let globalSalesData = {}; // 이번 대시보드 전용 날짜별 집계 데이터 저장소
let currentYear = 2026;
let currentMonth = 5; // 0-indexed (5 = 6월)

// [구간별 누진 마진율 데이터 기본 구조]
let tierSettings = [
    { threshold: 0, a: 20, b: 20, c: 10, deductB: 0 },                  // 1구간: 0 ~ 1억 이하
    { threshold: 100000000, a: 15, b: 15, c: 10, deductB: -1500000 },   // 2구간: 1억 초과 ~ 2억 이하
    { threshold: 200000000, a: 10, b: 10, c: 10, deductB: -3000000 },   // 3구간: 2억 초과 ~ 3억 이하
    { threshold: 300000000, a: 7.5, b: 7.5, c: 10, deductB: 0 }         // 4구간: 3억 초과
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
// 3. 초기화 및 이벤트 리스너 등록
// =================================================================
window.addEventListener('DOMContentLoaded', () => {
    loadMarginsFromFirestore();       // 1. 클라우드에서 누진 마진 설정 테이블 로드
    loadTransactionsFromFirestore();  // 2. 대시보드 전용 컬렉션 실시간 동기화
});

// 상단 컨트롤 및 업로드 이벤트
document.getElementById('excelFile').addEventListener('change', handleFileUpload);
document.getElementById('prevMonth').addEventListener('click', () => changeMonth(-1));
document.getElementById('nextMonth').addEventListener('click', () => changeMonth(1));

// 모달 팝업 제어 이벤트
const modal = document.getElementById('settingsModal');
document.getElementById('openSettingsBtn').addEventListener('click', () => modal.classList.add('active'));
document.getElementById('closeModalBtn').addEventListener('click', () => modal.classList.remove('active'));
document.getElementById('saveSettingsBtn').addEventListener('click', saveMarginSettings);


// =================================================================
// 4. FIRESTORE 실시간 데이터 연동 (구간 누진 마진 매핑)
// =================================================================

// [GET] Firestore에서 대시보드 전용 누진 구간 마진 설정 가져오기
function loadMarginsFromFirestore() {
    db.collection("settings").doc("progressive_margins").get().then((doc) => {
        if (doc.exists) {
            tierSettings = doc.data().tiers;
            
            // 모달 내 테이블 양식 인풋 UI에 데이터 바인딩 로드
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
        }
    }).catch((error) => console.error("대시보드 마진율 로드 실패:", error));
}

// [SET] 테이블 내부의 데이터를 파싱해 클라우드에 누진 마진 데이터 저장
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
        modal.classList.remove('active');
        renderCalendar(); 
        
        const currentDetailDate = document.getElementById('selectedDateText').textContent;
        if (globalSalesData[currentDetailDate]) {
            const monthlyRealTotal = calculateMonthlyRealTotal();
            const activeTier = getActiveTier(monthlyRealTotal);
            showDayDetail(currentDetailDate, activeTier);
        }
        alert("💾 구간별 누진 마진 조건이 클라우드에 저장되었으며, 모든 데이터가 즉시 재계산되었습니다.");
    }).catch((error) => alert("설정 저장 실패: " + error));
}

// 이번 달 화면에 등록된 총 실결제금액을 계산하는 헬퍼 함수
function calculateMonthlyRealTotal() {
    const lastDate = new Date(currentYear, currentMonth + 1, 0).getDate();
    let monthlyRealTotal = 0;
    for (let d = 1; d <= lastDate; d++) {
        const dateKey = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${dayToTwoDigits(d)}`;
        if (globalSalesData[dateKey]) {
            monthlyRealTotal += globalSalesData[dateKey].realPaymentTotal;
        }
    }
    return monthlyRealTotal;
}

function loadTransactionsFromFirestore() {
    db.collection("dashboard_sales").onSnapshot((snapshot) => {
        globalSalesData = {}; 
        let isFirstLoad = Object.keys(globalSalesData).length === 0;

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

        if (snapshot.size > 0 && isFirstLoad) {
            const dates = Object.keys(globalSalesData).sort();
            const lastDate = new Date(dates[dates.length - 1]);
            currentYear = lastDate.getFullYear();
            currentMonth = lastDate.getMonth();
        }

        renderCalendar(); 
    }, (error) => {
        console.error("Firestore 리스닝 실패:", error);
    });
}


// =================================================================
// 5. 엑셀 파싱 및 강력한 중복 제외 처리 후 업로드
// =================================================================
function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById('fileName').textContent = file.name;
    const reader = new FileReader();
    reader.onload = function (e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        uploadExcelToFirestore(rawRows);
    };
    reader.readAsArrayBuffer(file);
}

function uploadExcelToFirestore(rows) {
    const batch = db.batch(); 
    let validRowCount = 0;
    let duplicateCount = 0;

    const seenRecords = new Set();

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

        if (seenRecords.has(uniqueKey)) {
            duplicateCount++;
            continue;
        }
        seenRecords.add(uniqueKey);

        const cleanKeyStr = uniqueKey.replace(/[^a-zA-Z0-9]/g, '_');
        const safeDocId = `doc_${dateKey}_${cleanKeyStr}`;
        const docRef = db.collection("dashboard_sales").doc(safeDocId);
        
        batch.set(docRef, {
            date: dateKey,
            originalTotal: origAmt,
            taxRefundTotal: taxAmt,
            realPaymentTotal: realAmt,
            groupA: group === 'A' ? realAmt : 0,
            groupB: group === 'B' ? realAmt : 0,
            groupC: group === 'C' ? realAmt : 0,
            groupD: group === 'D' ? realAmt : 0,
            productCode: prodCode,
            inputTime: inputTime,
            uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        validRowCount++;
    }

    if (validRowCount === 0) {
        alert("업로드할 수 있는 유효한 매출 데이터 행이 없습니다.");
        return;
    }

    batch.commit().then(() => {
        alert(`🚀 업로드 완료!\n- 정상 등록: ${validRowCount}건\n- 중복 제외: ${duplicateCount}건이 필터링되었습니다.`);
    }).catch(err => {
        console.error(err);
        alert("클라우드 전송 실패: " + err.message);
    });
}

function deleteDateData(dateKey) {
    if (!confirm(`⚠️ 정말로 ${dateKey}일의 모든 매출 데이터를 클라우드에서 삭제하시겠습니까?\n삭제된 데이터는 복구할 수 없습니다.`)) {
        return;
    }

    db.collection("dashboard_sales").where("date", "==", dateKey).get()
        .then((querySnapshot) => {
            const batch = db.batch();
            querySnapshot.forEach((doc) => {
                batch.delete(doc.ref);
            });
            return batch.commit();
        })
        .then(() => {
            alert(`🗑️ ${dateKey}일의 모든 데이터가 성공적으로 삭제되었습니다.`);
            document.getElementById('selectedDateText').textContent = "날짜를 선택하세요";
            document.getElementById('detailContent').innerHTML = `
                <p class="placeholder-text">캘린더에서 데이터가 있는 날짜를 클릭하면 상세 매출 그룹 요약이 표시됩니다.</p>
            `;
        })
        .catch((error) => {
            console.error("데이터 삭제 실패:", error);
            alert("데이터 삭제 중 오류가 발생했습니다: " + error.message);
        });
}


// =================================================================
// 6. 데이터 가공 및 날짜/시간 포맷 정형화 헬퍼 함수
// =================================================================
function parseExcelDate(val) {
    if (!val) return null;
    if (val instanceof Date) return formatDateObject(val);
    if (typeof val === 'number') {
        const date = new Date((val - 25569) * 86400 * 1000);
        return formatDateObject(date);
    }
    const str = String(val).trim();
    if (str) return str.split(' ')[0];
    return null;
}

function formatDateObject(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function parseExcelTime(val) {
    if (!val) return '';
    if (val instanceof Date) {
        const y = val.getFullYear();
        const m = String(val.getMonth() + 1).padStart(2, '0');
        const d = String(val.getDate()).padStart(2, '0');
        const hh = String(val.getHours()).padStart(2, '0');
        const mm = String(val.getMinutes()).padStart(2, '0');
        const ss = String(val.getSeconds()).padStart(2, '0');
        return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
    }
    if (typeof val === 'number') {
        return val.toFixed(6); 
    }
    return String(val).trim();
}

function determineGroup(code) {
    if (!code) return 'C';
    const firstChar = code.charAt(0).toUpperCase();
    if (firstChar === 'A') return 'A';
    if (firstChar === 'B') return 'B';
    if (/[A-Z]/.test(firstChar)) return 'C';
    if (/[0-9]/.test(firstChar)) return 'D';
    return 'C';
}

function parseAmount(val) {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return val;
    return parseFloat(String(val).replace(/,/g, '')) || 0;
}


// =================================================================
// 7. 대시보드 화면 및 누진 마진 연산 렌더링 코어
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

function calculateProfit(data, tier) {
    const marginA = (data.groupA || 0) * (tier.a / 100);
    const marginB = (data.groupB || 0) * (tier.b / 100); 
    const marginC = (data.groupC || 0) * (tier.c / 100);
    const marginD = (data.groupD || 0) * (MARGIN_D_FIXED / 100); // D그룹 25% 고정
    
    return {
        a: Math.round(marginA),
        b: Math.round(marginB),
        c: Math.round(marginC),
        d: Math.round(marginD)
    };
}

// [요구사항 반영 수정] 상단 7가지 요약 대시보드 카드 우측에도 매출액 대비 마진 이익률(%) 결합
function updateSummaryUI(sum, tier) {
    const m = calculateProfit(sum, tier);
    const finalTotalMargin = m.a + m.b + m.c + m.d + tier.deductB;

    document.getElementById('totalOrig').textContent = sum.originalTotal.toLocaleString() + '원';
    document.getElementById('totalTax').textContent = sum.taxRefundTotal.toLocaleString() + '원';
    
    // 월간 종합 백분율 이익률 산출 (소수점 첫째 자리까지)
    const pctReal = sum.realPaymentTotal > 0 ? ((finalTotalMargin / sum.realPaymentTotal) * 100).toFixed(1) : '0.0';
    const pctA = sum.groupA > 0 ? ((m.a / sum.groupA) * 100).toFixed(1) : '0.0';
    const pctB = sum.groupB > 0 ? (((m.b + tier.deductB) / sum.groupB) * 100).toFixed(1) : '0.0'; // 누진공제 차감 후 최종 실이익률 계산
    const pctC = sum.groupC > 0 ? ((m.c / sum.groupC) * 100).toFixed(1) : '0.0';
    const pctD = sum.groupD > 0 ? ((m.d / sum.groupD) * 100).toFixed(1) : '0.0';

    document.getElementById('totalReal').innerHTML = `
        ${sum.realPaymentTotal.toLocaleString()}원
        <div style="color: #e53935; font-size: 12px; font-weight: 600; margin-top: 4px;">(${Math.round(finalTotalMargin).toLocaleString()}원, ${pctReal}%)</div>
    `;
    
    document.getElementById('totalA').innerHTML = `
        ${sum.groupA.toLocaleString()}원
        <div style="color: #e53935; font-size: 12px; font-weight: 600; margin-top: 4px;">(${Math.round(m.a).toLocaleString()}원, ${pctA}%)</div>
    `;
    document.getElementById('totalB').innerHTML = `
        ${sum.groupB.toLocaleString()}원
        <div style="color: #e53935; font-size: 12px; font-weight: 600; margin-top: 4px;">(${Math.round(m.b + tier.deductB).toLocaleString()}원, ${pctB}%)</div>
    `;
    document.getElementById('totalC').innerHTML = `
        ${sum.groupC.toLocaleString()}원
        <div style="color: #e53935; font-size: 12px; font-weight: 600; margin-top: 4px;">(${Math.round(m.c).toLocaleString()}원, ${pctC}%)</div>
    `;
    document.getElementById('totalD').innerHTML = `
        ${sum.groupD.toLocaleString()}원
        <div style="color: #e53935; font-size: 12px; font-weight: 600; margin-top: 4px;">(${Math.round(m.d).toLocaleString()}원, ${pctD}%)</div>
    `;
    
    document.getElementById('summarySection').style.display = 'grid';
}

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';
    document.getElementById('calendarTitle').textContent = `${currentYear}년 ${(currentMonth + 1).toString().padStart(2, '0')}월`;

    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    const lastDate = new Date(currentYear, currentMonth + 1, 0).getDate();

    let monthlyData = { originalTotal: 0, taxRefundTotal: 0, realPaymentTotal: 0, groupA: 0, groupB: 0, groupC: 0, groupD: 0 };

    for (let d = 1; d <= lastDate; d++) {
        const dateKey = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${dayToTwoDigits(d)}`;
        if (globalSalesData[dateKey]) {
            const dayData = globalSalesData[dateKey];
            monthlyData.originalTotal += dayData.originalTotal;
            monthlyData.taxRefundTotal += dayData.taxRefundTotal;
            monthlyData.realPaymentTotal += dayData.realPaymentTotal;
            monthlyData.groupA += dayData.groupA;
            monthlyData.groupB += dayData.groupB;
            monthlyData.groupC += dayData.groupC;
            monthlyData.groupD += dayData.groupD;
        }
    }

    const activeTier = getActiveTier(monthlyData.realPaymentTotal);
    updateSummaryUI(monthlyData, activeTier);

    for (let i = 0; i < firstDayIndex; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-day empty';
        grid.appendChild(emptyCell);
    }

    for (let day = 1; day <= lastDate; day++) {
        const dayCell = document.createElement('div');
        dayCell.className = 'calendar-day';
        
        const dayOfWeek = (firstDayIndex + day - 1) % 7;
        if (dayOfWeek === 0) dayCell.classList.add('sun');
        if (dayOfWeek === 6) dayCell.classList.add('sat');

        const dayNumSpan = document.createElement('span');
        dayNumSpan.className = 'day-num';
        dayNumSpan.textContent = day;
        dayCell.appendChild(dayNumSpan);

        const dateKey = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${dayToTwoDigits(day)}`;
        
        if (globalSalesData[dateKey]) {
            dayCell.classList.add('has-data');
            const dayData = globalSalesData[dateKey];

            const summaryDiv = document.createElement('div');
            summaryDiv.className = 'day-summary';
            summaryDiv.textContent = `₩${dayData.realPaymentTotal.toLocaleString()}`;
            dayCell.appendChild(summaryDiv);

            const m = calculateProfit(dayData, activeTier);
            const estimatedMargin = m.a + m.b + m.c + m.d;

            const marginDiv = document.createElement('div');
            marginDiv.className = 'day-margin';
            marginDiv.textContent = `(₩${estimatedMargin.toLocaleString()})`;
            dayCell.appendChild(marginDiv);

            dayCell.addEventListener('click', () => showDayDetail(dateKey, activeTier));
        }
        grid.appendChild(dayCell);
    }
}

function dayToTwoDigits(day) {
    return day.toString().padStart(2, '0');
}

function showDayDetail(dateKey, tier) {
    const data = globalSalesData[dateKey];
    document.getElementById('selectedDateText').textContent = dateKey;
    const container = document.getElementById('detailContent');
    
    const m = calculateProfit(data, tier);
    const estimatedMargin = m.a + m.b + m.c + m.d;

    const marginPercent = data.realPaymentTotal > 0 ? ((estimatedMargin / data.realPaymentTotal) * 100).toFixed(1) : '0.0';

    container.innerHTML = `
        <div class="detail-item-list">
            <div class="detail-row group-A">
                <span class="label">그룹 A 매출 (마진 ${tier.a}%)</span>
                <span class="val">
                    ${data.groupA.toLocaleString()} 원
                    <span style="color: #e53935; font-size: 12px; font-weight: 600; margin-left: 6px;">(${m.a.toLocaleString()} 원)</span>
                </span>
            </div>
            <div class="detail-row group-B">
                <span class="label">그룹 B 매출 (마진 ${tier.b}%)</span>
                <span class="val">
                    ${data.groupB.toLocaleString()} 원
                    <span style="color: #e53935; font-size: 12px; font-weight: 600; margin-left: 6px;">(${m.b.toLocaleString()} 원)</span>
                </span>
            </div>
            <div class="detail-row group-C">
                <span class="label">그룹 C 매출 (마진 ${tier.c}%)</span>
                <span class="val">
                    ${data.groupC.toLocaleString()} 원
                    <span style="color: #e53935; font-size: 12px; font-weight: 600; margin-left: 6px;">(${m.c.toLocaleString()} 원)</span>
                </span>
            </div>
            <div class="detail-row group-D">
                <span class="label">그룹 D 매출 (마진 ${MARGIN_D_FIXED}%)</span>
                <span class="val">
                    ${data.groupD.toLocaleString()} 원
                    <span style="color: #e53935; font-size: 12px; font-weight: 600; margin-left: 6px;">(${m.d.toLocaleString()} 원)</span>
                </span>
            </div>
            <div class="detail-row">
                <span class="label">원판매금액 합계 (AE열)</span>
                <span class="val">${data.originalTotal.toLocaleString()} 원</span>
            </div>
            <div class="detail-row">
                <span class="label">텍스리펀 환급액 (AA열)</span>
                <span class="val">${data.taxRefundTotal.toLocaleString()} 원</span>
            </div>
            <div class="detail-row total-row">
                <span class="label">실 결제금액 합계 (AF열)</span>
                <span class="val">
                    ${data.realPaymentTotal.toLocaleString()} 원
                    <span style="color: #e53935; font-size: 12px; font-weight: 600; margin-left: 6px;">(${estimatedMargin.toLocaleString()} 원, ${marginPercent}%)</span>
                </span>
            </div>
            <div class="detail-row" style="border-left-color: var(--accent-red); background: #fdf2f2;">
                <span class="label" style="color: var(--accent-red); font-weight:700;">일일 총 예상마진 합계</span>
                <span class="val" style="color: var(--accent-red);">${estimatedMargin.toLocaleString()} 원</span>
            </div>
            <p style="font-size: 11px; color: #70857a; margin-top: 4px; padding: 0 4px; line-height: 1.4;">
                * 당월 총 실결제 매출액 구간 [₩${tier.threshold.toLocaleString()} 이상] 요율 세트가 실시간 동적 적용되었습니다. (B그룹 누진공제액은 상단 월간 종합 요약 카드 마진에 반영됩니다.)
            </p>
            <button onclick="deleteDateData('${dateKey}')" style="width: 100%; margin-top: 14px; padding: 12px; background-color: #fee2e2; color: #ef4444; border: 1px solid #fca5a5; border-radius: 8px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.2s;" onmouseover="this.style.backgroundColor='#fecaca'" onmouseout="this.style.backgroundColor='#fee2e2'">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                이 날짜의 모든 데이터 삭제하기
            </button>
        </div>
    `;
}

function changeMonth(offset) {
    currentMonth += offset;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; } 
    else if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    renderCalendar();
}

renderCalendar();