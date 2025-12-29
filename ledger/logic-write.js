/* logic-write.js */

// 1. 변수 및 초기화 (Firestore 설정)
const COL_PENDING = "pending_uploads"; // 대기열 컬렉션 이름
let currentWidth = 0;  // 현재 이미지 너비
let initialWidth = 0;  // 초기 맞춤 너비

// 2. 대기 목록 로드 (실시간 리스너)
function loadQueueList() {
    const queueList = document.getElementById('queueList');
    const countBadge = document.getElementById('queueCount');
    
    if (!queueList) return;

    // Firestore에서 대기 데이터 가져오기
    db.collection(COL_PENDING).orderBy("createdAt", "desc").onSnapshot((snapshot) => {
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
function applyZoom() {
    const img = document.getElementById('docImage');
    if (!img) return;
    
    // 스타일을 직접 변경하여 튐 방지 및 즉각적인 확대/축소 적용
    img.style.width = currentWidth + "px";
    img.style.height = "auto";
}

function fitToFrame() {
    const img = document.getElementById('docImage');
    const viewer = document.getElementById('viewerBox');
    if (!img || !viewer || !img.naturalWidth) return;

    // 뷰어 너비의 95% 수준으로 초기 크기 설정
    currentWidth = viewer.clientWidth * 0.95;
    initialWidth = currentWidth;
    applyZoom();
}

function zoomIn() { 
    currentWidth *= 1.2; 
    applyZoom(); 
}

function zoomOut() { 
    if (currentWidth > 100) { 
        currentWidth *= 0.8; 
        applyZoom(); 
    } 
}

function resetZoom() { 
    fitToFrame(); 
}

// 4. 항목 선택 시 처리
// 4. 항목 선택 시 처리 (자동 축소 로직 포함)
function selectItem(item, targetLi, id) {
    // 모든 항목에서 active 클래스 제거 후 현재 항목에 추가
    document.querySelectorAll('.queue-item').forEach(el => el.classList.remove('active'));
    targetLi.classList.add('active');
    targetLi.setAttribute('data-id', id); 

    const imgTag = document.getElementById('docImage');
    const msg = document.getElementById('noSelectionMsg');

    if (imgTag && item.img) {
        // 1. 새로운 이미지를 불러오기 전에 화면에서 숨김 (깜빡임 방지)
        imgTag.style.display = 'none'; 
        imgTag.src = item.img;

        imgTag.onload = function() {
            if (msg) msg.style.display = 'none';
            
            // 2. 이미지가 로드되자마자 프레임에 맞춰 축소(fitToFrame) 실행
            // 여기서 currentWidth가 계산되어 applyZoom이 호출됩니다.
            fitToFrame(); 
            
            // 3. 계산이 끝난 후 깔끔하게 보여줌
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

/* [수정] 합계 입력 시 콤마 유지 및 역산 로직 */
function reverseCalculate(input) {
    // 1. 입력된 값에서 숫자만 추출
    let val = input.value.replace(/[^0-9]/g, "");
    let total = parseFloat(val) || 0;

    // 2. 화면에 실시간으로 콤마 찍힌 숫자 표시
    input.value = total > 0 ? total.toLocaleString() : "";

    if (total > 0) {
        // 3. 공급가와 세액 역산 (소수점 버림)
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

/* [수정] 공급가, 세액 입력 시 콤마 유지 및 정방향 계산 로직 */
function calculateRow(input) {  
    const row = input.closest('tr');
    
    // 1. 입력된 값에서 숫자만 추출하여 콤마 실시간 적용
    let val = input.value.replace(/[^0-9]/g, "");
    input.value = val ? parseInt(val).toLocaleString() : "";

    // 2. 계산을 위해 콤마 제거 후 숫자형 변환
    const qty = parseFloat(row.querySelector('.in-qty').value) || 0;
    const supply = parseFloat(row.querySelector('.in-supply').value.replace(/,/g, '')) || 0;
    const vatField = row.querySelector('.in-vat');
    
    // 3. 세액 자동 계산 (공급가 입력 시에만 작동)
    if (input.classList.contains('in-supply')) {
        const calculatedVat = Math.floor(supply * 0.1);
        vatField.value = calculatedVat.toLocaleString();
    }

    // 4. 합계 계산
    const vat = parseFloat(vatField.value.replace(/,/g, '')) || 0;
    const total = (supply + vat);
    
    row.querySelector('.in-total').value = total > 0 ? total.toLocaleString() : "";
    
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
    
    // [수정] ID를 'typeInput'에서 'typeSelect'로 변경합니다.
    const type = document.getElementById('typeSelect')?.value || 'buy'; 
    
    const activeLi = document.querySelector('.queue-item.active');
    const currentImgUrl = document.getElementById('docImage')?.src || "";

    if (!date || !vendor) return alert("날짜와 거래처를 입력하세요.");
    
    const rows = document.querySelectorAll('#itemTableBody tr');
    if (rows.length === 0) return alert("항목을 하나 이상 추가하세요.");

    try {
        const batch = db.batch();

        rows.forEach(row => {
            const memo = row.querySelector('.in-memo').value.trim();
            if (memo) {
                const docRef = db.collection("transactions").doc(); 
                batch.set(docRef, {
                    date,
                    vendor,
                    type, // 이제 'pay' 또는 'return'이 정확히 담깁니다.
                    memo: memo,
                    img: currentImgUrl,
                    qty: Number(row.querySelector('.in-qty').value.replace(/,/g, '')) || 0,
                    supply: Number(row.querySelector('.in-supply').value.replace(/,/g, '')) || 0,
                    vat: Number(row.querySelector('.in-vat').value.replace(/,/g, '')) || 0,
                    total: Number(row.querySelector('.in-total').value.replace(/,/g, '')) || 0,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        });

        await batch.commit();

        if (activeLi) {
            const docId = activeLi.getAttribute('data-id');
            // [참고] 변수로 선언해두신 COL_PENDING이 있다면 그걸 쓰셔도 됩니다.
            await db.collection("pending_uploads").doc(docId).delete();
        }

        alert("저장이 완료되었습니다.");
        location.reload(); 
    } catch (e) {
        console.error("저장 중 오류:", e);
        alert("저장에 실패했습니다.");
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
//* [수정] 입력창은 빈칸으로 두되, 검색 목록만 배경에서 로드 */
async function loadRecentVendor() {
    const vInput = document.getElementById('vendorInput');
    const vList = document.getElementById('vendorList');
    if (!vInput || !vList) return;

    try {
        // transactions 컬렉션에서 데이터 추출
        const snapshot = await db.collection("transactions").limit(30).get();

        if (!snapshot.empty) {
            const vendorSet = new Set();
            snapshot.docs.forEach(doc => {
                const name = doc.data().vendor;
                if (name) vendorSet.add(name.trim());
            });

            // 1. datalist에 목록만 추가 (모양 변화 없음)
            vList.innerHTML = ""; 
            Array.from(vendorSet).sort().forEach(v => {
                const opt = document.createElement('option');
                opt.value = v;
                vList.appendChild(opt);
            });

            // 2. [수정] 최근 거래처를 불러오지 않고 입력창은 비워둡니다.
            vInput.value = ""; 
            
            console.log("거래처 검색 목록 로드 완료");
        }
    } catch (e) {
        console.error("데이터 로드 실패:", e);
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

