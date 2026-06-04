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

// 그룹별 마진율 상태 변수 (기본값 0)
let groupMargins = { A: 0, B: 0, C: 0, D: 0 };

// 엑셀 열 인덱스 매핑 (0-based)
const COL_DATE = 1;   // B열: 판매일자
const COL_CODE = 9;   // J열: 상품코드
const COL_TAX = 26;   // AA열: 즉시환급
const COL_ORIG = 30;  // AE열: 순판매(할인제외) -> 원판매금액
const COL_REAL = 31;  // AF열: 순판매(할인포함) -> 실결제금액

// =================================================================
// 3. 초기화 및 이벤트 리스너 등록
// =================================================================
window.addEventListener('DOMContentLoaded', () => {
    loadMarginsFromFirestore();       // 1. 클라우드에서 대시보드 전용 마진율 불러오기
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
// 4. FIRESTORE 실시간 데이터 연동
// =================================================================

// [GET] 대시보드 전용 설정 문서에서 마진율 가져오기
function loadMarginsFromFirestore() {
    db.collection("settings").doc("dashboard_marginRates").get().then((doc) => {
        if (doc.exists) {
            const data = doc.data();
            groupMargins.A = data.A || 0;
            groupMargins.B = data.B || 0;
            groupMargins.C = data.C || 0;
            groupMargins.D = data.D || 0;
            
            // 모달 인풋 UI에 세팅
            document.getElementById('marginInputA').value = groupMargins.A;
            document.getElementById('marginInputB').value = groupMargins.B;
            document.getElementById('marginInputC').value = groupMargins.C;
            document.getElementById('marginInputD').value = groupMargins.D;
            
            renderCalendar(); 
        }
    }).catch((error) => console.error("대시보드 마진율 로드 실패:", error));
}

// [SET] 대시보드 전용 마진율을 Firestore에 저장
function saveMarginSettings() {
    groupMargins.A = parseFloat(document.getElementById('marginInputA').value) || 0;
    groupMargins.B = parseFloat(document.getElementById('marginInputB').value) || 0;
    groupMargins.C = parseFloat(document.getElementById('marginInputC').value) || 0;
    groupMargins.D = parseFloat(document.getElementById('marginInputD').value) || 0;

    db.collection("settings").doc("dashboard_marginRates").set({
        A: groupMargins.A,
        B: groupMargins.B,
        C: groupMargins.C,
        D: groupMargins.D
    }).then(() => {
        modal.classList.remove('active');
        
        renderCalendar(); // 달력이 리렌더링되면서 상단 요약도 새 마진율로 자동 갱신됩니다.
        
        const currentDetailDate = document.getElementById('selectedDateText').textContent;
        if (globalSalesData[currentDetailDate]) showDayDetail(currentDetailDate);
        
        alert("💾 대시보드 전용 마진율이 클라우드에 저장되었으며, 모든 데이터가 재계산되었습니다.");
    }).catch((error) => alert("마진율 저장 실패: " + error));
}

// [LISTEN] 분리된 대시보드 전용 컬렉션('dashboard_sales')을 실시간 감시
function loadTransactionsFromFirestore() {
    db.collection("dashboard_sales").onSnapshot((snapshot) => {
        globalSalesData = {}; // 캐시 초기화
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

        // 최초 로드시에만 데이터가 존재하는 가장 최신 월로 달력 자동 이동
        if (snapshot.size > 0 && isFirstLoad) {
            const dates = Object.keys(globalSalesData).sort();
            const lastDate = new Date(dates[dates.length - 1]);
            currentYear = lastDate.getFullYear();
            currentMonth = lastDate.getMonth();
        }

        renderCalendar(); // 달력을 그리면서 내부에서 상단 UI 스코어보드도 함께 호출합니다.
    }, (error) => {
        console.error("Firestore 리스닝 실패:", error);
    });
}


// =================================================================
// 5. 엑셀 파싱 및 독립 컬렉션('dashboard_sales')에 업로드
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

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const dateKey = parseExcelDate(row[COL_DATE]);
        if (!dateKey || dateKey.includes('소계') || dateKey.includes('합계')) continue;

        const origAmt = parseAmount(row[COL_ORIG]);
        const taxAmt = parseAmount(row[COL_TAX]);
        const realAmt = parseAmount(row[COL_REAL]);
        const prodCode = String(row[COL_CODE] || '').trim();
        const group = determineGroup(prodCode);

        const docRef = db.collection("dashboard_sales").doc(`${dateKey}_row_${i}`);
        
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
            uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        validRowCount++;
    }

    if (validRowCount === 0) {
        alert("업로드할 수 있는 유효한 매출 데이터 행이 없습니다.");
        return;
    }

    batch.commit().then(() => {
        alert(`🚀 총 ${validRowCount}건의 매출 데이터가 전용 클라우드(dashboard_sales)에 분리 저장되었습니다!`);
    }).catch(err => {
        console.error(err);
        alert("클라우드 전송 실패: " + err.message);
    });
}


// =================================================================
// 6. 데이터 가공 및 날짜 헬퍼 로직
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
// 7. 대시보드 화면 및 인터랙티브 캘린더 렌더링 코어
// =================================================================

// 상단 7가지 카드 UI 그리기 함수
function updateSummaryUI(orig, tax, real, a, b, c, d) {
    const totalMarginA = a * (groupMargins.A / 100);
    const totalMarginB = b * (groupMargins.B / 100);
    const totalMarginC = c * (groupMargins.C / 100);
    const totalMarginD = d * (groupMargins.D / 100);
    const totalMarginSum = totalMarginA + totalMarginB + totalMarginC + totalMarginD;

    document.getElementById('totalOrig').textContent = orig.toLocaleString() + '원';
    document.getElementById('totalTax').textContent = tax.toLocaleString() + '원';
    
    document.getElementById('totalReal').innerHTML = `
        ${real.toLocaleString()}원
        <div style="color: #e53935; font-size: 12px; font-weight: 600; margin-top: 4px;">(${Math.round(totalMarginSum).toLocaleString()}원)</div>
    `;
    
    document.getElementById('totalA').innerHTML = `
        ${a.toLocaleString()}원
        <div style="color: #e53935; font-size: 12px; font-weight: 600; margin-top: 4px;">(${Math.round(totalMarginA).toLocaleString()}원)</div>
    `;
    document.getElementById('totalB').innerHTML = `
        ${b.toLocaleString()}원
        <div style="color: #e53935; font-size: 12px; font-weight: 600; margin-top: 4px;">(${Math.round(totalMarginB).toLocaleString()}원)</div>
    `;
    document.getElementById('totalC').innerHTML = `
        ${c.toLocaleString()}원
        <div style="color: #e53935; font-size: 12px; font-weight: 600; margin-top: 4px;">(${Math.round(totalMarginC).toLocaleString()}원)</div>
    `;
    document.getElementById('totalD').innerHTML = `
        ${d.toLocaleString()}원
        <div style="color: #e53935; font-size: 12px; font-weight: 600; margin-top: 4px;">(${Math.round(totalMarginD).toLocaleString()}원)</div>
    `;
    
    document.getElementById('summarySection').style.display = 'grid';
}

// 달력 엔진 구현부
function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';
    document.getElementById('calendarTitle').textContent = `${currentYear}년 ${(currentMonth + 1).toString().padStart(2, '0')}월`;

    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    const lastDate = new Date(currentYear, currentMonth + 1, 0).getDate();

    // ------------------------------------------------=================
    // [핵심 변경 사항] 현재 달력 화면에 띄워진 '선택 월'의 데이터만 필터링 합산
    // ------------------------------------------------=================
    let monthlyOrig = 0, monthlyTax = 0, monthlyReal = 0;
    let monthlyA = 0, monthlyB = 0, monthlyC = 0, monthlyD = 0;

    for (let d = 1; d <= lastDate; d++) {
        const dateKey = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
        if (globalSalesData[dateKey]) {
            const dayData = globalSalesData[dateKey];
            monthlyOrig += dayData.originalTotal;
            monthlyTax += dayData.taxRefundTotal;
            monthlyReal += dayData.realPaymentTotal;
            monthlyA += dayData.groupA;
            monthlyB += dayData.groupB;
            monthlyC += dayData.groupC;
            monthlyD += dayData.groupD;
        }
    }
    // 월간 필터링된 결과값으로 상단 대시보드 7가지 요약 UI 카드 실시간 업데이트
    updateSummaryUI(monthlyOrig, monthlyTax, monthlyReal, monthlyA, monthlyB, monthlyC, monthlyD);
    // ------------------------------------------------=================

    // 달력 공백 채우기
    for (let i = 0; i < firstDayIndex; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-day empty';
        grid.appendChild(emptyCell);
    }

    // 일별 셀 생성
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

        const dateKey = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        
        if (globalSalesData[dateKey]) {
            dayCell.classList.add('has-data');
            const dayData = globalSalesData[dateKey];

            const summaryDiv = document.createElement('div');
            summaryDiv.className = 'day-summary';
            summaryDiv.textContent = `₩${dayData.realPaymentTotal.toLocaleString()}`;
            dayCell.appendChild(summaryDiv);

            const estimatedMargin = 
                (dayData.groupA * (groupMargins.A / 100)) +
                (dayData.groupB * (groupMargins.B / 100)) +
                (dayData.groupC * (groupMargins.C / 100)) +
                (dayData.groupD * (groupMargins.D / 100));

            const marginDiv = document.createElement('div');
            marginDiv.className = 'day-margin';
            marginDiv.textContent = `(₩${Math.round(estimatedMargin).toLocaleString()})`;
            dayCell.appendChild(marginDiv);

            dayCell.addEventListener('click', () => showDayDetail(dateKey));
        }
        grid.appendChild(dayCell);
    }
}

function showDayDetail(dateKey) {
    const data = globalSalesData[dateKey];
    document.getElementById('selectedDateText').textContent = dateKey;
    const container = document.getElementById('detailContent');
    
    const marginA = data.groupA * (groupMargins.A / 100);
    const marginB = data.groupB * (groupMargins.B / 100);
    const marginC = data.groupC * (groupMargins.C / 100);
    const marginD = data.groupD * (groupMargins.D / 100);
    const estimatedMargin = marginA + marginB + marginC + marginD;

    container.innerHTML = `
        <div class="detail-item-list">
            <div class="detail-row group-A">
                <span class="label">그룹 A 매출 (마진 ${groupMargins.A}%)</span>
                <span class="val">
                    ${data.groupA.toLocaleString()} 원
                    <span style="color: #e53935; font-size: 12px; font-weight: 600; margin-left: 6px;">(${Math.round(marginA).toLocaleString()} 원)</span>
                </span>
            </div>
            <div class="detail-row group-B">
                <span class="label">그룹 B 매출 (마진 ${groupMargins.B}%)</span>
                <span class="val">
                    ${data.groupB.toLocaleString()} 원
                    <span style="color: #e53935; font-size: 12px; font-weight: 600; margin-left: 6px;">(${Math.round(marginB).toLocaleString()} 원)</span>
                </span>
            </div>
            <div class="detail-row group-C">
                <span class="label">그룹 C 매출 (마진 ${groupMargins.C}%)</span>
                <span class="val">
                    ${data.groupC.toLocaleString()} 원
                    <span style="color: #e53935; font-size: 12px; font-weight: 600; margin-left: 6px;">(${Math.round(marginC).toLocaleString()} 원)</span>
                </span>
            </div>
            <div class="detail-row group-D">
                <span class="label">그룹 D 매출 (마진 ${groupMargins.D}%)</span>
                <span class="val">
                    ${data.groupD.toLocaleString()} 원
                    <span style="color: #e53935; font-size: 12px; font-weight: 600; margin-left: 6px;">(${Math.round(marginD).toLocaleString()} 원)</span>
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
                    <span style="color: #e53935; font-size: 12px; font-weight: 600; margin-left: 6px;">(${Math.round(estimatedMargin).toLocaleString()} 원)</span>
                </span>
            </div>
            <div class="detail-row" style="border-left-color: var(--accent-red); background: #fdf2f2;">
                <span class="label" style="color: var(--accent-red); font-weight:700;">일일 총 예상마진 합계</span>
                <span class="val" style="color: var(--accent-red);">${Math.round(estimatedMargin).toLocaleString()} 원</span>
            </div>
        </div>
    `;
}

function changeMonth(offset) {
    currentMonth += offset;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; } 
    else if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    renderCalendar();
}

// 최초 렌더링 가동
renderCalendar();