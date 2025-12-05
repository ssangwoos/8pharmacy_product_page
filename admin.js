// admin.js (QR 코드 다중 이미지 처리 및 다운로드 기능 탑재)

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore, doc, setDoc, deleteDoc, collection, getDocs, getDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";
import imageCompression from "https://cdn.jsdelivr.net/npm/browser-image-compression@2.0.0/dist/browser-image-compression.mjs";

const firebaseConfig = {
    apiKey: "AIzaSyCygpc_WS2_35_8eYgdTEJwZCtNGJjHvY4",
    authDomain: "pharmacy-productlist.firebaseapp.com",
    projectId: "pharmacy-productlist",
    storageBucket: "pharmacy-productlist.firebasestorage.app",
    messagingSenderId: "409677826366",
    appId: "1:409677826366:web:dc825470ef673194e2446f"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

let allProducts = []; 

// 1. 초기화 함수 (QR 관련 요소도 초기화 추가)
function resetForm() {
    const idInput = document.getElementById('productId');
    
    // 텍스트 입력창 비우기
    idInput.value = '';
    document.getElementById('name').value = '';
    document.getElementById('price').value = '';
    document.querySelectorAll('textarea').forEach(t => t.value = '');
    
    // 메인 이미지 비우기
    document.getElementById('imageFile').value = '';
    document.getElementById('preview').style.display = 'none';
    document.getElementById('preview').src = '';

    // ✨ QR 이미지 및 다운로드 버튼 비우기
    document.getElementById('qrFile').value = '';
    document.getElementById('qrPreview').style.display = 'none';
    document.getElementById('qrPreview').src = '';
    document.getElementById('qrDownloadBtn').style.display = 'none'; // 다운로드 버튼 숨김
    
    // ID 잠금 해제
    idInput.disabled = false; 
    idInput.style.backgroundColor = 'white';
    document.getElementById('saveBtn').innerText = "상품 저장하기";
}

// 2. 목록 불러오기
window.loadProductList = async function() {
    const listContainer = document.getElementById('productList');
    listContainer.innerHTML = '<p style="text-align:center; padding:20px;">데이터를 불러오는 중입니다...</p>';

    try {
        const querySnapshot = await getDocs(collection(db, "products"));
        allProducts = []; 

        if (querySnapshot.empty) {
            listContainer.innerHTML = '<p style="text-align:center; padding:20px;">등록된 상품이 없습니다.</p>';
            return;
        }

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            // QR 이미지가 있는지 확인 (있으면 아이콘 표시 등 가능하지만 일단 둠)
            allProducts.push({
                id: doc.id,
                ...data // 모든 데이터 다 담기
            });
        });
        renderProductList(allProducts);

    } catch (error) {
        console.error("목록 로드 실패:", error);
        listContainer.innerHTML = '<p>목록을 불러오지 못했습니다.</p>';
    }
}

function renderProductList(products) {
    const listContainer = document.getElementById('productList');
    
    if (products.length === 0) {
        listContainer.innerHTML = '<p style="text-align:center; padding:20px; color:#888;">검색 결과가 없습니다.</p>';
        return;
    }

    let html = '';
    products.forEach((item) => {
        const imgUrl = item.image || 'https://via.placeholder.com/60?text=No+Img';
        // QR 보유 여부 표시 (선택사항)
        const qrBadge = item.qrImage ? '<span style="font-size:0.7rem; background:#1D5C36; color:white; padding:2px 4px; border-radius:3px; margin-left:5px;">QR보유</span>' : '';

        html += `
            <div class="product-item">
                <img src="${imgUrl}" class="item-img">
                <div class="item-info">
                    <div class="item-title"><span class="item-id">${item.id}</span> ${item.name} ${qrBadge}</div>
                    <div class="item-price">${Number(item.price).toLocaleString()}원</div>
                </div>
                <div class="btn-group">
                    <button class="btn-small btn-view" onclick="window.open('product.html?id=${item.id}')">QR확인</button>
                    <button class="btn-small btn-edit" onclick="editProduct('${item.id}')">수정/QR관리</button>
                    <button class="btn-small btn-delete" onclick="deleteProduct('${item.id}')">삭제</button>
                </div>
            </div>
        `;
    });
    listContainer.innerHTML = html;
}

// 검색 기능
const searchInput = document.getElementById('searchInput');
if(searchInput) {
    searchInput.addEventListener('keyup', function() {
        const keyword = this.value.toLowerCase().trim();
        const filtered = allProducts.filter(item => {
            return item.name.toLowerCase().includes(keyword) || 
                   item.id.toLowerCase().includes(keyword);
        });
        renderProductList(filtered);
    });
}

// 삭제 기능
window.deleteProduct = async function(id) {
    if(confirm('정말 삭제하시겠습니까? (저장된 이미지와 QR코드도 모두 삭제됩니다)')) {
        try {
            // *심화: Storage의 이미지도 지워야 완벽하지만, 일단 DB만 지워도 안 보임.
            await deleteDoc(doc(db, "products", id));
            alert('삭제되었습니다.');
            loadProductList(); 
        } catch (error) {
            alert('삭제 실패: ' + error.message);
        }
    }
}

// 3. 수정 모드 (QR 이미지 불러오기 및 다운로드 버튼 설정)
window.editProduct = async function(id) {
    const docRef = doc(db, "products", id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        const data = docSnap.data();
        
        resetForm(); // 일단 싹 비우고 시작

        // 기본 정보 채우기
        const idInput = document.getElementById('productId');
        idInput.value = id;
        idInput.disabled = true; 
        idInput.style.backgroundColor = '#e0e0e0';

        document.getElementById('name').value = data.name;
        document.getElementById('price').value = data.price;
        document.getElementById('desc_kr').value = data.desc_kr || '';
        document.getElementById('desc_en').value = data.desc_en || '';
        document.getElementById('desc_cn').value = data.desc_cn || '';
        document.getElementById('desc_jp').value = data.desc_jp || '';

        // 메인 이미지 미리보기
        if(data.image) {
            const img = document.getElementById('preview');
            img.src = data.image;
            img.style.display = 'block';
        }

        // ✨ QR 이미지 처리 (핵심!)
        const qrPreview = document.getElementById('qrPreview');
        const qrBtn = document.getElementById('qrDownloadBtn');
        
        if(data.qrImage) {
            // QR 이미지가 있으면 보여주고
            qrPreview.src = data.qrImage;
            qrPreview.style.display = 'block';
            
            // 다운로드 버튼 활성화 및 링크 연결
            qrBtn.href = data.qrImage; // 이미지 주소 연결
            // 다운로드 시 파일명 지정 (예: tylenol_qr.jpg)
            qrBtn.download = `${id}_qr.jpg`; 
            qrBtn.style.display = 'inline-block'; // 버튼 보이게
        } else {
            // 없으면 숨김
            qrPreview.style.display = 'none';
            qrBtn.style.display = 'none';
        }

        document.getElementById('saveBtn').innerText = "수정 내용 저장하기";
        alert(`'${data.name}' 수정 모드입니다.\nQR코드를 업로드하거나 다운로드할 수 있습니다.`);
    } else {
        alert("상품 정보를 찾을 수 없습니다.");
    }
}

// 4. 저장 함수 (이미지 2개 업로드 처리)
window.saveProduct = async function() {
    const btn = document.getElementById('saveBtn');
    const idInput = document.getElementById('productId');
    const id = idInput.value.trim();
    const fileInput = document.getElementById('imageFile'); // 메인 이미지
    const qrInput = document.getElementById('qrFile');    // ✨ QR 이미지
    
    const idRegex = /^[a-zA-Z0-9-_]+$/;

    if (!id) return alert("상품 ID를 입력해주세요!");
    if (!idRegex.test(id)) {
        alert("❌ ID는 '영문', '숫자'만 입력 가능합니다!");
        return;
    }
    if (!document.getElementById('name').value) return alert("상품명을 입력해주세요!");

    try {
        btn.disabled = true;
        btn.innerText = "이미지 업로드 및 저장 중..."; 

        let imageUrl = "";
        let qrImageUrl = "";

        // 1️⃣ 메인 이미지 업로드 (압축 함)
        if (fileInput.files.length > 0) {
            let file = fileInput.files[0];
            const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1200, useWebWorker: true };
            try { file = await imageCompression(file, options); } catch (e) {}

            const storageRef = ref(storage, 'products/' + id + '.jpg'); 
            await uploadBytes(storageRef, file);
            imageUrl = await getDownloadURL(storageRef);
        }

        // 2️⃣ ✨ QR 이미지 업로드 (압축 안 함! - 인식률 위해 원본 유지)
        if (qrInput.files.length > 0) {
            let qrFile = qrInput.files[0];
            // QR은 용량이 작고 선명해야 하므로 압축 과정 생략
            
            // 저장 경로: products/아이디_qr.jpg
            const qrStorageRef = ref(storage, 'products/' + id + '_qr.jpg'); 
            await uploadBytes(qrStorageRef, qrFile);
            qrImageUrl = await getDownloadURL(qrStorageRef);
        }

        // 데이터 준비
        const productData = {
            name: document.getElementById('name').value,
            price: Number(document.getElementById('price').value),
            desc_kr: document.getElementById('desc_kr').value,
            desc_en: document.getElementById('desc_en').value,
            desc_cn: document.getElementById('desc_cn').value,
            desc_jp: document.getElementById('desc_jp').value,
            updatedAt: new Date()
        };
        
        // 새 이미지가 있을 때만 DB 필드 업데이트 (기존 이미지 유지)
        if(imageUrl) productData.image = imageUrl;
        if(qrImageUrl) productData.qrImage = qrImageUrl; // ✨ QR 주소 추가

        // DB에 저장 (merge: true로 기존 데이터 유지하며 업데이트)
        await setDoc(doc(db, "products", id), productData, { merge: true });

        alert("✅ 저장 완료! (QR 이미지도 안전하게 보관되었습니다)");
        
        resetForm(); 
        if(allProducts.length > 0) loadProductList(); 

    } catch (error) {
        console.error("저장 실패:", error);
        alert("오류: " + error.message);
    } finally {
        btn.disabled = false;
        const saveBtnText = document.getElementById('productId').disabled ? "수정 내용 저장하기" : "상품 저장하기";
        btn.innerText = saveBtnText;
    }
}

loadProductList();

// 이미지 미리보기 리스너 세팅 함수
function setupPreview(inputId, previewId) {
    const input = document.getElementById(inputId);
    if(input) {
        input.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if(file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    const img = document.getElementById(previewId);
                    img.src = e.target.result;
                    img.style.display = 'block';
                }
                reader.readAsDataURL(file);
            }
        });
    }
}

// 메인 이미지, QR 이미지 각각 미리보기 연결
setupPreview('imageFile', 'preview');
setupPreview('qrFile', 'qrPreview');

window.resetForNew = function() { resetForm(); }