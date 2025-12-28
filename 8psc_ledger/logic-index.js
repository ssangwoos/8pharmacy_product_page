/**
 * logic-index.js - 대시보드 메인 로직
 */

// 컬렉션 명칭을 약사님 기존 코드와 일치시킴
const COL_LEDGER = "transactions"; 

function initDashboard() {
    console.log("대시보드 초기화...");
    updateDashboardStats(); // 약사님 기존 함수명 사용
}

// 1. 통계 및 최근 내역 통합 로드 (약사님 기존 로직 보정)
function updateDashboardStats() {
    // A. 상단 통계 박스 계산
    db.collection(COL_LEDGER).onSnapshot((snapshot) => {
        let sumBuy = 0, sumPay = 0, sumReturn = 0;
        let allData = [];

        snapshot.forEach(doc => {
            const item = doc.data();
            allData.push({ id: doc.id, ...item });

            // 약사님 기존 로직: buy는 정수, 나머지는 절댓값 처리
            if (item.type === 'buy') sumBuy += (item.total || 0);
            else if (item.type === 'pay') sumPay += Math.abs(item.total || 0);
            else if (item.type === 'return') sumReturn += Math.abs(item.total || 0);
        });

        const balance = sumBuy - sumReturn - sumPay;

        // index.html의 ID에 맞춰 값 주입
        // (만약 ID가 monthBuy 등으로 되어있다면 아래 ID들을 그에 맞게 수정하세요)
        const buyEl = document.getElementById('monthBuy') || document.querySelectorAll('.stat-box h2')[0];
        const payEl = document.getElementById('monthPay') || document.querySelectorAll('.stat-box h2')[1];
        const balEl = document.getElementById('expectBalance') || document.querySelectorAll('.stat-box h2')[2];

        if(buyEl) buyEl.innerText = (sumBuy - sumReturn).toLocaleString();
        if(payEl) payEl.innerText = sumPay.toLocaleString();
        if(balEl) balEl.innerText = balance.toLocaleString();

        // B. 최근 거래 내역 그리기
        renderRecentList(allData);
    });
}

// [수정] 데이터를 가져오는 로직부터 다시 잡아야 합니다.
// [통합] 최신 5개 내역을 'transactions' 컬렉션에서 가져오는 함수
async function fetchRecentTransactions() {
    try {
        // 1. 컬렉션명은 transactions, 정렬은 createdAt 내림차순(최신순)
        const snapshot = await db.collection("transactions")
                                 .orderBy("createdAt", "desc")
                                 .limit(5)
                                 .get();

        const data = [];
        snapshot.forEach(doc => {
            data.push({ id: doc.id, ...doc.data() });
        });

        // 2. 위에서 정의한 화면 출력 함수 호출
        renderRecentList(data);
        
        console.log("인덱스 최신 내역 5개 로드 완료");
    } catch (e) {
        console.error("인덱스 로드 실패:", e);
        // 여기서 에러가 난다면 100% '색인(Index)' 문제입니다. 콘솔 링크를 클릭하세요.
    }
}
// [수정] 출력 함수 보강
function renderRecentList(data) {
    const recentListEl = document.getElementById('recentList');
    if(!recentListEl) return;

    recentListEl.innerHTML = '';

    if(data.length === 0) {
        recentListEl.innerHTML = '<li style="padding:30px; text-align:center; color:#999;">최근 거래 내역이 없습니다.</li>';
        return;
    }

    // 최신순 정렬 (기존 로직 유지)
    const recentItems = data.sort((a, b) => {
        const timeA = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt)) : new Date(a.date);
        const timeB = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt)) : new Date(b.date);
        return timeB - timeA;
    }).slice(0, 5);

    recentItems.forEach(item => {
        // [수정 핵심] 입고(buy)만 파란색(+), 결제(pay)와 반품(return)은 빨간색(-)
        const isBuy = (item.type === 'buy');
        const sign = isBuy ? '+' : '-';
        const colorStyle = isBuy ? 'color:#2563eb' : 'color:#dc2626';
        
        // 뱃지 처리 (기존 로직 유지)
        let qtyHtml = (item.qty && item.qty > 0) 
            ? `<span class="qty-badge" style="background:#f1f5f9; padding:2px 8px; border-radius:4px; font-size:0.8rem; font-weight:600; color:#666;">${item.qty}개</span>` 
            : '<div style="width:69px;"></div>';

        const li = document.createElement('li');
        li.className = 't-item';
        li.style.cssText = "display:flex; align-items:center; padding:16px 0; border-bottom:1px solid #f0f0f0;";
        
        li.innerHTML = `
            <div style="width:55px; color:#999; font-size:0.85rem; flex-shrink:0;">
                ${item.date ? item.date.substr(5) : ''}
            </div>
            <div style="width:110px; font-weight:700; color:#333; margin-left:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex-shrink:0;">
                ${item.vendor || '-'}
            </div>
            <div style="flex:1; color:#555; font-size:0.95rem; margin-left:20px; text-align:left; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                ${item.memo || ''}
            </div>
            ${qtyHtml}
            <div style="width:120px; text-align:right; font-weight:800; font-size:1.1rem; ${colorStyle}; flex-shrink:0;">
                ${sign}${Math.abs(Number(item.total) || 0).toLocaleString()}
            </div>
        `;
        recentListEl.appendChild(li);
    });
}
window.onload = initDashboard;

/* logic-index.js - 미처리 건수 실시간 연동 */

const COL_PENDING = "pending_uploads";

function updateDashboardSummary() {
    // 미처리 명세서 개수 실시간 감시
    db.collection(COL_PENDING).onSnapshot((snapshot) => {
        const count = snapshot.size;
        
        // 약사님의 HTML 구조: .alert-info 내의 strong 태그를 찾아서 변경
        const countEl = document.querySelector('.alert-info h3 strong');
        
        if (countEl) {
            countEl.innerText = `${count}건`;
        }
    });

    // 이번 달 매입/지출/잔액 로직 (기존과 동일)
    const now = new Date();
    const firstDayStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

    db.collection("ledger").where("date", ">=", firstDayStr).onSnapshot((snapshot) => {
        let buyTotal = 0, payTotal = 0;
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.type === 'buy') buyTotal += (data.total || 0);
            else if (data.type === 'pay') payTotal += (data.total || 0);
        });

        if(document.getElementById('monthBuy')) document.getElementById('monthBuy').innerText = buyTotal.toLocaleString();
        if(document.getElementById('monthPay')) document.getElementById('monthPay').innerText = payTotal.toLocaleString();
        if(document.getElementById('expectedBalance')) {
            document.getElementById('expectedBalance').innerText = (buyTotal - payTotal).toLocaleString();
        }
    });
}


// 카메라/갤러리 파일 선택 시 처리
/* [추가] 인덱스 페이지 이미지 업로드 로직 */
/* [수정] 가장 확실한 업로드 함수 */
/* [최종] 업로드 완료 후 이동하지 않고 페이지 유지 */
async function handleFileUpload(input) {
    const files = input.files;
    if (!files || files.length === 0) return;

    const total = files.length;
    
    // 1. 로딩 레이어 생성
    const loader = document.createElement('div');
    loader.id = 'uploadLoader';
    loader.innerHTML = `
        <div style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); 
                    display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:9999; color:white;">
            <div class="spinner" style="border:4px solid #f3f3f3; border-top:4px solid #2563eb; border-radius:50%; width:40px; height:40px; animation:spin 1s linear infinite; margin-bottom:15px;"></div>
            <div id="loaderText" style="font-size:1.1rem; font-weight:bold;">업로드 준비 중...</div>
        </div>
        <style> @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } } </style>
    `;
    document.body.appendChild(loader);

    const loaderText = document.getElementById('loaderText');

    try {
        for (let i = 0; i < total; i++) {
            // 진행 상태 표시
            loaderText.innerText = `명세서 업로드 중... (${i + 1} / ${total})`;

            const file = files[i];
            const fileName = `${Date.now()}_${file.name}`;
            
            // Storage 저장
            const storageRef = firebase.storage().ref().child("pending_uploads/" + fileName);
            const uploadTask = await storageRef.put(file);
            const downloadURL = await uploadTask.ref.getDownloadURL();

            // Firestore 저장
            await db.collection("pending_uploads").add({
                img: downloadURL,
                fileName: fileName,
                date: new Date().toISOString().split('T')[0],
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: "pending"
            });
        }

        // 2. [변경] 이동하지 않고 로더만 제거 후 완료 알림
        if (document.getElementById('uploadLoader')) {
            document.body.removeChild(loader);
        }
        alert(`총 ${total}건의 명세서가 성공적으로 등록되었습니다.`);

    } catch (e) {
        console.error("업로드 오류:", e);
        if (document.getElementById('uploadLoader')) {
            document.body.removeChild(loader);
        }
        alert("업로드 도중 오류가 발생했습니다: " + e.message);
    } finally {
        input.value = ""; // 파일 선택창 리셋
    }
}

// 로드 시 실행
// window.addEventListener('DOMContentLoaded', 뒤에 async 추가!
window.addEventListener('DOMContentLoaded', async () => {
    // 이제 await를 정상적으로 사용할 수 있습니다.
    await loadPharmacyName(); 
    
    updateDashboardSummary();
    if (typeof loadRecentList === 'function') loadRecentList(); 
});
// 2. [추가] DB에서 이름을 가져와 화면에 뿌려주는 함수
async function loadPharmacyName() {
    try {
        const doc = await db.collection("settings").doc("pharmacy_info").get();
        if (doc.exists) {
            const name = doc.data().pharmacyName || "우리약국";
            updateUI(name); // 화면 UI 갱신
        }
    } catch (e) {
        console.error("약국 이름 로드 중 오류:", e);
    }
}

// logic-index.js 의 updateUI 함수 수정

function updateUI(name) {
    if (!name) return;

    // 1. 기존 화면 글자들 변경
    const displays = document.querySelectorAll('.pharmacy-name-display');
    displays.forEach(el => el.innerText = name);
    
    // 2. 브라우저 탭 제목 변경
    document.title = name + " - 스마트 장부";

    // 3. [추가] 메타 태그 자동 반영 (공유 미리보기용)
    const metaOgTitle = document.getElementById('meta-og-title');
    const metaDesc = document.getElementById('meta-desc');

    if (metaOgTitle) {
        metaOgTitle.setAttribute('content', name + " 스마트 장부"); //
    }
    if (metaDesc) {
        metaDesc.setAttribute('content', name + "의 실시간 데이터 관리 시스템입니다."); //
    }
}