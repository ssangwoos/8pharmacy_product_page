/* logic-write.js */

// 1. 변수 및 초기화 (Firestore 설정)
const COL_PENDING = "pending_uploads"; // 대기열 컬렉션 이름

let currentWidth = 0;  // 현재 이미지 너비
let initialWidth = 0;  // 초기 맞춤 너비
let currentRotation = 0; 
let currentSelectedDocId = null;
let allVendors = []; // 🔥 전역 변수로 업체 목록 보관

async function loadRecentVendor() {
    try {
        // 모든 거래 내역에서 중복 없이 거래처 가져오기
        const snapshot = await db.collection("transactions").get();
        const vendorSet = new Set();
        snapshot.docs.forEach(doc => {
            const name = doc.data().vendor;
            if (name) vendorSet.add(name.trim());
        });
        
        allVendors = Array.from(vendorSet).sort(); // 전역 변수에 저장 ㅡㅡ^
        console.log("검색용 거래처 로드 완료:", allVendors.length, "건");
    } catch (e) {
        console.error("거래처 로드 실패:", e);
    }
}

// 2. 대기 목록 로드 (실시간 리스너)
function loadQueueList() {
    const queueList = document.getElementById('queueList');
    const countBadge = document.getElementById('queueCount');
    
    if (!queueList) return;

    // Firestore에서 대기 데이터 가져오기
    db.collection(COL_PENDING).orderBy("createdAt", "asc").onSnapshot((snapshot) => {
        queueList.innerHTML = ''; // 목록 초기화
        
        if (countBadge) countBadge.innerText = snapshot.size;

        if (snapshot.empty) {
            queueList.innerHTML = '<li style="padding:20px; text-align:center; color:#999;">대기 중인 명세서가 없습니다.</li>';
            return;
        }

        snapshot.forEach((doc) => {
            const item = doc.data();
            const id = doc.id;
            const li = document.createElement('li');
            li.className = 'queue-item';
            
            const fileName = item.fileName || 'scan_image.jpg';
            const displayDate = item.date || '날짜 미상';
            
            li.innerHTML = `
                <div class="q-info-area">
                    <span class="q-title">명세서 <span style="font-size:0.8em;color:#aaa">#${id.substr(0,4)}</span></span>
                    <span class="q-date">${displayDate}</span>
                </div>
                <button class="btn-q-del" onclick="deleteQueueItem(event, '${id}')">
                    <i class="fas fa-trash-alt"></i>
                </button>
            `;
            
            // 클릭 이벤트: 항목 선택 및 이미지 표시
            li.onclick = () => selectItem(item, li, id);
            queueList.appendChild(li);
        });
    }, (error) => {
        console.error("데이터 로드 오류:", error);
    });
}

// 3. 줌(Zoom) 기능 - 약사님 성공 버전 (상단 고정/튐 방지)
// 2. 통합 적용 함수 (확대 + 회전)
function applyZoom() {
    const img = document.getElementById('docImage');
    const viewer = document.querySelector('.image-viewer-wide');
    if (!img || !viewer) return;

    // 물리적 너비 설정 (스크롤 생성용)
    img.style.width = currentWidth + "px";
    img.style.height = "auto";

    // 회전 적용 (빙그르르 도는 현상 방지: modulo 없이 누적 각도 사용 가능)
    img.style.transform = `rotate(${currentRotation}deg)`;
    img.style.transformOrigin = "center center";

    // 90도/270도 회전 시 세로 스크롤 공간 강제 확보 ㅡㅡ^
    const r = currentRotation % 360;
    const absR = Math.abs(r);
    if (absR === 90 || absR === 270) {
        const ratio = img.naturalHeight / img.naturalWidth;
        const requiredHeight = currentWidth / ratio; 
        const offset = Math.abs((requiredHeight - currentWidth) / 2);
        img.style.margin = `${offset + 50}px auto`; 
    } else {
        img.style.margin = "20px auto";
    }
}
// 4. 줌 함수 (동작 보장 버전) ㅡㅡ^
function zoomIn() { 
    if (currentWidth === 0) { // 혹시 초기화 안됐을 경우 대비
        const img = document.getElementById('docImage');
        currentWidth = img.clientWidth;
    }
    currentWidth *= 1.2; 
    applyZoom(); 
}

function zoomOut() { 
    if (currentWidth > 100) { 
        currentWidth *= 0.8; 
        applyZoom(); 
    } 
}
function fitToFrame() {
    const img = document.getElementById('docImage');
    const viewer = document.getElementById('viewerBox');
    if (!img || !viewer || !img.naturalWidth) return;

    // 뷰어 대비 이미지의 적정 배율 계산 ㅡㅡ^
    const ratioW = (viewer.clientWidth * 0.95) / img.naturalWidth;
    const ratioH = (viewer.clientHeight * 0.95) / img.naturalHeight;
    
    // 화면에 꽉 차게 들어오는 배율 선택
    currentZoom = Math.min(ratioW, ratioH);
    
    applyZoom();
}



function resetZoom() { 
    fitToFrame(); 
}

// 4. 항목 선택 시 처리
// 4. 항목 선택 시 처리 (자동 축소 로직 포함)
function selectItem(item, targetLi, id) {
    document.querySelectorAll('.queue-item').forEach(el => el.classList.remove('active'));
    targetLi.classList.add('active');
    currentSelectedDocId = id; 
    targetLi.setAttribute('data-id', id); 

    const imgTag = document.getElementById('docImage');
    const msg = document.getElementById('noSelectionMsg');

    if (imgTag && item.img) {
        // DB에서 회전값만 미리 변수에 담아둡니다.
        currentRotation = item.rotation || 0; 
        
        imgTag.style.display = 'none'; 
        imgTag.src = item.img;

        imgTag.onload = function() {
            if (msg) msg.style.display = 'none';
            // 여기서 직접 돌리지 말고, 아래 함수가 applyZoom을 부르게 둡니다. ㅡㅡ^
            fitToFrame(); 
            imgTag.style.display = 'inline-block';
        };
    }
}
/* logic-write.js - 명세서 전체 노출 버전 */

function fitToFrame() {
    const img = document.getElementById('docImage');
    const viewer = document.getElementById('viewerBox');
    if (!img || !viewer || !img.naturalWidth) return;

    // 1. 뷰어의 실제 가용 공간 (여유 있게 95% 수준)
    const availableW = viewer.clientWidth * 0.95;
    const availableH = viewer.clientHeight * 0.95;

    // 2. 가로를 맞출 때 필요한 너비와 세로를 맞출 때 필요한 너비를 각각 계산
    // 가로 기준 너비
    const widthBased = availableW;
    // 세로 기준 너비 (이미지 비율 유지: 너비 = 높이 * 비율)
    const imgRatio = img.naturalWidth / img.naturalHeight;
    const heightBased = availableH * imgRatio;

    // 3. [핵심] 둘 중 더 작은 값을 선택해야 화면에 '전체'가 다 나옵니다.
    currentWidth = Math.min(widthBased, heightBased);
    
    // 만약 원본이 이미 화면보다 작다면 굳이 키우지 않고 원본 크기 유지 (선택 사항)
    // if (currentWidth > img.naturalWidth) currentWidth = img.naturalWidth;

    initialWidth = currentWidth;
    applyZoom();
}

// 5. 그리드 제어 (행 추가/삭제/계산)
/* logic-write.js - 입력 순서 리모델링 */
/* [수정] 행 추가 로직: 우측 플러스 버튼 방식 */
/* [수정] addNewRow 내 합계 칸 입력 가능하게 변경 */
/* [수정] addNewRow 함수 내 마지막 버튼 영역 레이아웃 보정 */
function addNewRow() {
    const tbody = document.getElementById('itemTableBody');
    const tr = document.createElement('tr');
    tr.className = 'item-row';
    const isFirstRow = tbody.children.length === 0;

    tr.innerHTML = `
        <td><input type="text" class="in-memo" placeholder="내용(적요) 입력"></td>
        <td><input type="number" class="in-qty text-center" value="1" oninput="calculateRow(this)"></td>
        <td><input type="text" class="in-supply text-right" placeholder="0" oninput="calculateRow(this)"></td>
        <td><input type="text" class="in-vat text-right" placeholder="0" oninput="calculateRow(this)"></td>
        <td><input type="text" class="in-total text-right" placeholder="0" oninput="reverseCalculate(this)" style="font-weight:bold; color:#2563eb;"></td>
        <td class="text-center" style="width: 80px; min-width: 80px;"> 
            <div style="display: flex; gap: 8px; align-items: center; justify-content: center;">
                <button type="button" class="btn-row-del" onclick="removeRow(this)" 
                    style="${isFirstRow ? 'visibility: hidden;' : 'visibility: visible;'}">×</button>
                
                <button type="button" class="btn-row-add" onclick="addNewRow()">+</button>
            </div>
        </td>
    `;
    tbody.appendChild(tr);
    tr.querySelector('.in-memo').focus();
    updateAllTotals();
}

/* [수정] 합계 입력 시 콤마 유지 및 역산 로직 (마이너스 허용) ㅡㅡ^ */
function reverseCalculate(input) {
    // 1. 숫자와 마이너스(-) 기호만 추출
    let val = input.value.replace(/[^0-9-]/g, "");
    
    // 2. 마이너스 기호만 있을 때 배려
    if (val === "-") {
        input.value = "-";
        return;
    }

    let total = parseFloat(val) || 0;

    // 3. 화면에 실시간으로 콤마 찍힌 숫자 표시
    input.value = total !== 0 ? total.toLocaleString() : "";

    if (total !== 0) {
        // 4. 공급가와 세액 역산 (소수점 버림)
        let supply = Math.floor(total / 1.1);
        let vat = total - supply;

        const row = input.closest('tr');
        row.querySelector('.in-supply').value = supply.toLocaleString();
        row.querySelector('.in-vat').value = vat.toLocaleString();
    } else {
        const row = input.closest('tr');
        row.querySelector('.in-supply').value = '';
        row.querySelector('.in-vat').value = '';
    }
    updateAllTotals();
}

// [추가] 행 삭제 시 합계 갱신 함수
function removeRow(btn) {
    btn.closest('tr').remove();
    updateAllTotals();
}

/* [수정] 공급가, 세액 입력 시 콤마 유지 및 정방향 계산 로직 (마이너스 허용) ㅡㅡ^ */
function calculateRow(input) {  
    const row = input.closest('tr');
    
    // 1. 숫자와 마이너스(-) 추출 및 콤마 실시간 적용
    let val = input.value.replace(/[^0-9-]/g, "");
    
    if (val === "-") {
        input.value = "-";
    } else {
        input.value = val ? parseInt(val).toLocaleString() : "";
    }

    // 2. 계산을 위해 콤마 제거 후 숫자형 변환 (Number 사용으로 음수 완벽 지원)
    const qty = parseFloat(row.querySelector('.in-qty').value) || 0;
    const supplyText = row.querySelector('.in-supply').value.replace(/,/g, '');
    const supply = supplyText === "-" ? 0 : (parseFloat(supplyText) || 0);
    
    const vatField = row.querySelector('.in-vat');
    
    // 3. 세액 자동 계산 (공급가 입력 시에만 작동)
    if (input.classList.contains('in-supply')) {
        const calculatedVat = Math.floor(supply * 0.1);
        vatField.value = calculatedVat.toLocaleString();
    }

    // 4. 합계 계산
    const vatText = vatField.value.replace(/,/g, '');
    const vat = vatText === "-" ? 0 : (parseFloat(vatText) || 0);
    const total = (supply + vat);
    
    row.querySelector('.in-total').value = total !== 0 ? total.toLocaleString() : "";
    
    updateAllTotals();
}

function updateAllTotals() {
    let s = 0, v = 0;
    document.querySelectorAll('.item-row').forEach(row => {
        s += parseFloat(row.querySelector('.in-supply').value.replace(/,/g, '')) || 0;
        v += parseFloat(row.querySelector('.in-vat').value.replace(/,/g, '')) || 0;
    });
    
    if(document.getElementById('sumSupply')) document.getElementById('sumSupply').innerText = s.toLocaleString();
    if(document.getElementById('sumVat')) document.getElementById('sumVat').innerText = v.toLocaleString();
    if(document.getElementById('sumTotal')) document.getElementById('sumTotal').innerText = (s + v).toLocaleString();
    if(document.getElementById('itemCount')) document.getElementById('itemCount').innerText = document.querySelectorAll('.item-row').length;
}

// 6. 저장 기능
// 6. 저장 기능 (이름을 saveAllItems로 통일하거나 HTML 버튼과 맞추세요)
async function saveAllItems() {
    const date = document.getElementById('dateInput').value;
    const vendor = document.getElementById('vendorInput').value;
    const type = document.getElementById('typeSelect')?.value || 'buy'; 
    
    // 1. 이미지 주소 정제 ㅡㅡ^
    let currentImgUrl = document.getElementById('docImage')?.src || "";
    if (!currentImgUrl.startsWith('http') || currentImgUrl.includes('write.html')) {
        currentImgUrl = null; 
    }

    // 2. 기초 정보 필수 입력 체크
    if (!date || !vendor) return alert("날짜와 거래처를 입력하세요.");
    
    const rows = document.querySelectorAll('#itemTableBody tr');
    if (rows.length === 0) return alert("항목을 하나 이상 추가하세요.");

    // 🔥 [입구컷 핵심] 적요가 하나라도 있는지 먼저 전수 조사 ㅡㅡ^
    let hasValidMemo = false;
    rows.forEach(row => {
        const memo = row.querySelector('.in-memo').value.trim();
        if (memo) hasValidMemo = true; // 한 줄이라도 글자가 있으면 통과!
    });

    if (!hasValidMemo) {
        return alert("장부에 기록될 '내용(적요)'을 최소 한 줄 이상 입력해주세요! ㅡㅡ^");
    }

    // 3. 저장 프로세스 시작
    try {
        const batch = db.batch();
        let saveCount = 0; // 실제로 저장되는 줄 수 카운트

        rows.forEach(row => {
            const memo = row.querySelector('.in-memo').value.trim();
            
            // 내용이 있는 줄만 트랜잭션 데이터로 생성 ㅡㅡ^
            if (memo) {
                const docRef = db.collection("transactions").doc(); 
                batch.set(docRef, {
                    date,
                    vendor,
                    type, 
                    memo: memo,
                    img: currentImgUrl,
                    rotation: typeof currentRotation !== 'undefined' ? currentRotation : 0,
                    qty: Number(row.querySelector('.in-qty').value.replace(/,/g, '')) || 0,
                    supply: Number(row.querySelector('.in-supply').value.replace(/,/g, '')) || 0,
                    vat: Number(row.querySelector('.in-vat').value.replace(/,/g, '')) || 0,
                    total: Number(row.querySelector('.in-total').value.replace(/,/g, '')) || 0,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                saveCount++;
            }
        });

        // 4. DB에 쓰기 작업 수행
        await batch.commit();

        // 🔥 [삭제 로직] 저장이 성공(commit)한 직후에만 대기열에서 지웁니다. ㅡㅡ^
        if (currentSelectedDocId) {
            console.log("저장 성공, 대기열 삭제 ID:", currentSelectedDocId);
            await db.collection("pending_uploads").doc(currentSelectedDocId).delete();
        }

        alert(`${saveCount}건의 내역이 저장되었습니다.`);
        location.reload(); 
        
    } catch (e) {
        console.error("저장 중 오류 발생:", e);
        alert("저장에 실패했습니다. 네트워크 상태를 확인해주세요.");
    }
}

// 7. 대기열 개별 삭제
async function deleteQueueItem(event, id) {
    event.stopPropagation(); // 클릭 이벤트 전파 방지 (항목 선택 안 되게)
    if (!confirm("이 명세서를 대기열에서 삭제하시겠습니까?")) return;
    try {
        await db.collection(COL_PENDING).doc(id).delete();
    } catch (e) {
        console.error("삭제 실패:", e);
    }
}

// 8. 페이지 로드 시 초기화
// [수정] 거래처 목록 로드 - 더 확실하게 가져오기 ㅡㅡ^
async function loadRecentVendor() {
    try {
        console.log("거래처 목록 로드 시작...");
        // 1. 전체 거래내역을 가져오되, 성능을 위해 vendor 필드만 가져오면 좋지만 
        // 일단 약사님 DB 구조에 맞춰 전체를 긁습니다.
        const snapshot = await db.collection("transactions").get();
        
        const vendorSet = new Set();
        snapshot.docs.forEach(doc => {
            const vName = doc.data().vendor;
            if (vName) vendorSet.add(vName.trim());
        });

        // 2. 검색용 배열에 저장
        allVendors = Array.from(vendorSet).sort();
        console.log("로드된 거래처 목록:", allVendors); // 콘솔에서 확인용 ㅡㅡ^

        // 3. (선택사항) 브라우저 기본 datalist도 보험용으로 채워둡니다.
        const vList = document.getElementById('vendorList');
        if (vList) {
            vList.innerHTML = "";
            allVendors.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v;
                vList.appendChild(opt);
            });
        }
    } catch (e) {
        console.error("거래처 로드 에러:", e);
    }
}
/* 모든 초기화 로직을 이 하나로 통합합니다 */
// 1. [함수 분리] DB에서 약국 이름을 가져오는 독립 함수
async function loadPharmacyName() {
    try {
        const doc = await db.collection("settings").doc("pharmacy_info").get();
        if (doc.exists) {
            const name = doc.data().pharmacyName || "";
            document.querySelectorAll('.pharmacy-name-display').forEach(el => {
                el.innerText = name;
            });
        }
    } catch (e) {
        console.error("약국 이름 로드 중 오류:", e);
    }
}

// 2. [이벤트 리스너] 약사님이 주신 기존 코드에 이름 로드만 추가
document.addEventListener('DOMContentLoaded', async () => { // async 추가
    
    // [추가] 약국 이름부터 로드합니다.
    await loadPharmacyName();

    // 1. 기존 대기목록 로드
    if (typeof loadQueueList === 'function') loadQueueList();
    
    // 2. 하단 입력 그리드 첫 행 생성
    const tbody = document.getElementById('itemTableBody');
    if (tbody) {
        tbody.innerHTML = ''; // 초기화
        if (typeof addNewRow === 'function') addNewRow(); 
    }

    // 3. 오늘 날짜 입력 (시차 버그 수정 버전) ㅡㅡ^
    const dInput = document.getElementById('dateInput');
    if (dInput) {
        const now = new Date();
        // 한국 시차(9시간)를 더해서 계산하거나, 로컬 날짜를 직접 조립합니다.
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        dInput.value = `${yyyy}-${mm}-${dd}`; // 이제 무조건 한국 기준 오늘 날짜!
    }
    // 4. 최근 거래처 1건 불러오기
    if (typeof loadRecentVendor === 'function') loadRecentVendor();
});

/* 금액 합계 업데이트 함수 */
function updateTotals() {
    let totalS = 0, totalV = 0, totalG = 0;
    
    // 테이블 내의 모든 숫자 데이터 합산 (콤마 제거 후 계산)
    document.querySelectorAll('#itemTableBody tr').forEach(row => {
        const s = row.querySelector('#inSupply')?.value.replace(/,/g, '') || 0;
        const v = row.querySelector('#inVat')?.value.replace(/,/g, '') || 0;
        const t = row.querySelector('#inTotal')?.value.replace(/,/g, '') || 0;
        
        totalS += parseInt(s);
        totalV += parseInt(v);
        totalG += parseInt(t);
    });

    // 화면의 b 태그들에 콤마 찍어서 출력
    document.getElementById('sumSupply').innerText = totalS.toLocaleString();
    document.getElementById('sumVat').innerText = totalV.toLocaleString();
    document.getElementById('sumTotal').innerText = totalG.toLocaleString();
}

// 1. [함수 분리] DB에서 약국 이름을 가져오는 독립 함수
async function loadPharmacyName() {
    try {
        const doc = await db.collection("settings").doc("pharmacy_info").get();
        if (doc.exists) {
            const name = doc.data().pharmacyName || "";
            document.querySelectorAll('.pharmacy-name-display').forEach(el => {
                el.innerText = name;
            });
        }
    } catch (e) {
        console.error("약국 이름 로드 중 오류:", e);
    }
}

// 1. 전역 변수 선언 (함수 밖 맨 위에 두셔도 됩니다)
// 1. 전역 변수 (파일 최상단 확인) ㅡㅡ^

// 2. 이미지 회전 함수 ㅡㅡ^
// 이미지 회전 및 DB 즉시 저장 ㅡㅡ^
// 3. 회전 함수 (빙그르 방지 버전) ㅡㅡ^
async function rotateImage(degree) {
    if (!currentSelectedDocId) return alert("먼저 명세서를 선택하세요.");

    // 각도를 누적시킵니다 (360에서 다시 90으로 갈 때 역회전 방지)
    currentRotation += degree; 
    
    applyZoom();

    try {
        await db.collection("pending_uploads").doc(currentSelectedDocId).update({
            rotation: currentRotation
        });
    } catch (e) {
        console.error("회전 저장 실패:", e);
    }
}

// [막강 검색 + 전체 보기 통합 함수] ㅡㅡ^
function searchVendor(isFullShow = false) {
    const input = document.getElementById('vendorInput');
    let listCustom = document.getElementById('vendorListCustom');
    
    // 1. 리스트 박스 없으면 생성 (스타일 유지)
    if (!listCustom) {
        listCustom = document.createElement('div');
        listCustom.id = 'vendorListCustom';
        Object.assign(listCustom.style, {
            position: 'absolute',
            top: (input.offsetTop + input.offsetHeight) + 'px',
            left: input.offsetLeft + 'px',
            width: input.offsetWidth + 'px',
            maxHeight: '250px',
            overflowY: 'auto',
            background: 'white',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            zIndex: '9999',
            display: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
        });
        input.parentNode.appendChild(listCustom);
    }

    const val = input.value.trim().toLowerCase();
    listCustom.innerHTML = ""; 

    // 2. 검색어가 없고 '전체보기' 모드도 아니면 닫기
    if (!val && !isFullShow) {
        listCustom.style.display = 'none';
        return;
    }

    // 3. 필터링 로직 (전체보기면 allVendors 그대로, 아니면 필터링) ㅡㅡ^
    const filtered = isFullShow ? allVendors : allVendors.filter(v => v.toLowerCase().includes(val));

    if (filtered.length > 0) {
        filtered.forEach(name => {
            const div = document.createElement('div');
            div.style.padding = '12px 15px';
            div.style.cursor = 'pointer';
            div.style.borderBottom = '1px solid #f1f5f9';
            div.style.fontSize = '0.95rem';

            // 🔥 [파란색 강조 로직] 검색어가 있을 때만 강조 ㅡㅡ^
            if (val) {
                const regex = new RegExp(val, 'gi');
                div.innerHTML = name.replace(regex, (m) => `<b style="color:#2563eb;">${m}</b>`);
            } else {
                div.innerText = name;
            }
            
            // 클릭 시 입력창에 반영
            div.onclick = () => {
                input.value = name;
                listCustom.style.display = 'none';
            };

            // 마우스 호버 효과
            div.onmouseover = () => div.style.background = '#f8fafc';
            div.onmouseout = () => div.style.background = 'white';

            listCustom.appendChild(div);
        });
        listCustom.style.display = 'block';
    } else {
        listCustom.style.display = 'none';
    }
}

// [더블클릭 전용 함수] 그냥 searchVendor를 '전체보기' 모드로 호출만 하면 끝! ㅡㅡ^
function showAllVendors() {
    searchVendor(true); 
}

// 화면 어디든 클릭했을 때 리스트를 닫는 기능 ㅡㅡ^
document.addEventListener('mousedown', function(e) {
    const listCustom = document.getElementById('vendorListCustom');
    const input = document.getElementById('vendorInput');

    // 리스트가 열려 있을 때만 작동
    if (listCustom && listCustom.style.display === 'block') {
        // 클릭한 곳이 '입력창'도 아니고 '리스트 내부'도 아니라면 닫아라!
        if (e.target !== input && !listCustom.contains(e.target)) {
            listCustom.style.display = 'none';
        }
    }
});
