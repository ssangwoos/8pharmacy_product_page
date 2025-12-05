// admin.js (안전장치 추가 버전: ID 수정 금지 & 한글 입력 방지)

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

// 1. 초기화 함수 (화면 청소 및 ID 잠금 해제)
function resetForm() {
    const idInput = document.getElementById('productId');
    
    // 폼 비우기
    idInput.value = '';
    document.getElementById('name').value = '';
    document.getElementById('price').value = '';
    document.getElementById('imageFile').value = '';
    document.getElementById('preview').style.display = 'none';
    document.querySelectorAll('textarea').forEach(t => t.value = '');
    
    // ✨ 핵심: ID 입력창 잠금 해제 (새로 등록할 땐 입력할 수 있어야 하니까)
    idInput.disabled = false; 
    idInput.style.backgroundColor = 'white';
    
    // 버튼 텍스트 원상복구
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
            allProducts.push({
                id: doc.id,
                name: data.name,
                price: data.price,
                image: data.image
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
        html += `
            <div class="product-item">
                <img src="${imgUrl}" class="item-img">
                <div class="item-info">
                    <div class="item-title"><span class="item-id">${item.id}</span> ${item.name}</div>
                    <div class="item-price">${Number(item.price).toLocaleString()}원</div>
                </div>
                <div class="btn-group">
                    <button class="btn-small btn-view" onclick="window.open('product.html?id=${item.id}')">QR</button>
                    <button class="btn-small btn-edit" onclick="editProduct('${item.id}')">수정</button>
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

window.deleteProduct = async function(id) {
    if(confirm('정말 삭제하시겠습니까? (되돌릴 수 없습니다)')) {
        try {
            await deleteDoc(doc(db, "products", id));
            alert('삭제되었습니다.');
            loadProductList(); 
        } catch (error) {
            alert('삭제 실패: ' + error.message);
        }
    }
}

// 3. ✨ 수정 모드 (ID 잠금 기능 추가)
window.editProduct = async function(id) {
    const docRef = doc(db, "products", id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        const data = docSnap.data();
        
        // ID 칸 채우고 잠가버리기 (수정 불가)
        const idInput = document.getElementById('productId');
        idInput.value = id;
        idInput.disabled = true; // 🔒 잠금!
        idInput.style.backgroundColor = '#e0e0e0'; // 회색으로 표시

        document.getElementById('name').value = data.name;
        document.getElementById('price').value = data.price;
        
        document.getElementById('desc_kr').value = data.desc_kr || '';
        document.getElementById('desc_en').value = data.desc_en || '';
        document.getElementById('desc_cn').value = data.desc_cn || '';
        document.getElementById('desc_jp').value = data.desc_jp || '';

        if(data.image) {
            const img = document.getElementById('preview');
            img.src = data.image;
            img.style.display = 'block';
        }

        document.getElementById('saveBtn').innerText = "수정 내용 저장하기";
        alert(`'${data.name}' 수정 모드입니다.\n(ID는 변경할 수 없습니다. 잘못 만들었다면 삭제 후 다시 등록하세요.)`);
    } else {
        alert("상품 정보를 찾을 수 없습니다.");
    }
}

// 4. 저장 함수 (유효성 검사 강화)
window.saveProduct = async function() {
    const btn = document.getElementById('saveBtn');
    const idInput = document.getElementById('productId');
    const id = idInput.value.trim();
    const fileInput = document.getElementById('imageFile');
    
    // ✨ 핵심: 한글/특수문자 입력 방지 (정규식 검사)
    // 영문(a-z, A-Z), 숫자(0-9), 하이픈(-), 언더바(_) 만 허용
    const idRegex = /^[a-zA-Z0-9-_]+$/;

    if (!id) return alert("상품 ID를 입력해주세요!");
    
    // 검사 실행
    if (!idRegex.test(id)) {
        alert("❌ ID는 '영문', '숫자'만 입력 가능합니다!\n(한글이나 띄어쓰기는 사용할 수 없습니다)");
        return; // 저장 안 하고 멈춤
    }

    if (!document.getElementById('name').value) return alert("상품명을 입력해주세요!");

    try {
        btn.disabled = true;
        btn.innerText = "처리 중..."; 

        let imageUrl = "";

        if (fileInput.files.length > 0) {
            let file = fileInput.files[0];
            const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1200, useWebWorker: true };
            try { file = await imageCompression(file, options); } catch (e) {}

            const storageRef = ref(storage, 'products/' + id + '.jpg'); 
            await uploadBytes(storageRef, file);
            imageUrl = await getDownloadURL(storageRef);
        }

        const productData = {
            name: document.getElementById('name').value,
            price: Number(document.getElementById('price').value),
            desc_kr: document.getElementById('desc_kr').value,
            desc_en: document.getElementById('desc_en').value,
            desc_cn: document.getElementById('desc_cn').value,
            desc_jp: document.getElementById('desc_jp').value,
            updatedAt: new Date()
        };
        
        if(imageUrl) productData.image = imageUrl;

        await setDoc(doc(db, "products", id), productData, { merge: true });

        alert("✅ 저장 완료!");
        
        resetForm(); // 폼 초기화 함수 호출
        
        if(allProducts.length > 0) loadProductList(); 

    } catch (error) {
        console.error("저장 실패:", error);
        alert("오류: " + error.message);
    } finally {
        btn.disabled = false;
        // 저장 후엔 다시 원래 텍스트로
        const saveBtnText = document.getElementById('productId').disabled ? "수정 내용 저장하기" : "상품 저장하기";
        btn.innerText = saveBtnText;
    }
}

// 페이지 로드 시 리스트 불러오기
loadProductList();

// 이미지 미리보기
const fileInput = document.getElementById('imageFile');
if(fileInput) {
    fileInput.addEventListener('change', async function(e) {
        const file = e.target.files[0];
        if(file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const img = document.getElementById('preview');
                img.src = e.target.result;
                img.style.display = 'block';
            }
            reader.readAsDataURL(file);
        }
    });
}

// 탭 버튼 클릭 시 폼 초기화 (등록 탭 누르면 새 글 쓰기 모드로)
// admin.html의 openTab 함수 내에서 처리가 어렵다면, 여기서 이벤트 리스너 추가
// (하지만 admin.html을 안 고치기 위해 window 함수로 노출)
window.resetForNew = function() {
    resetForm();
}