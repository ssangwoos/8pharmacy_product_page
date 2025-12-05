// admin.js (8개국어 지원 업데이트)

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

function resetForm() {
    const idInput = document.getElementById('productId');
    
    idInput.value = '';
    document.getElementById('name').value = '';
    document.getElementById('price').value = '';
    
    // 모든 텍스트영역 초기화 (8개 국어 모두 포함됨)
    document.querySelectorAll('textarea').forEach(t => t.value = '');
    
    document.getElementById('imageFile').value = '';
    document.getElementById('preview').style.display = 'none';
    document.getElementById('preview').src = '';

    document.getElementById('qrFile').value = '';
    document.getElementById('qrPreview').style.display = 'none';
    document.getElementById('qrPreview').src = '';
    document.getElementById('qrDownloadBtn').style.display = 'none';
    
    idInput.disabled = false; 
    idInput.style.backgroundColor = 'white';
    document.getElementById('saveBtn').innerText = "상품 저장하기";
}

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
                ...data
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
                    <button class="btn-small btn-edit" onclick="editProduct('${item.id}')">수정/QR</button>
                    <button class="btn-small btn-delete" onclick="deleteProduct('${item.id}')">삭제</button>
                </div>
            </div>
        `;
    });
    listContainer.innerHTML = html;
}

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
    if(confirm('정말 삭제하시겠습니까?')) {
        try {
            await deleteDoc(doc(db, "products", id));
            alert('삭제되었습니다.');
            loadProductList(); 
        } catch (error) {
            alert('삭제 실패: ' + error.message);
        }
    }
}

window.editProduct = async function(id) {
    const docRef = doc(db, "products", id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        const data = docSnap.data();
        
        resetForm();

        const idInput = document.getElementById('productId');
        idInput.value = id;
        idInput.disabled = true; 
        idInput.style.backgroundColor = '#e0e0e0';

        document.getElementById('name').value = data.name;
        document.getElementById('price').value = data.price;
        
        // ✨ 8개국어 데이터 불러오기
        document.getElementById('desc_kr').value = data.desc_kr || '';
        document.getElementById('desc_en').value = data.desc_en || '';
        document.getElementById('desc_cn').value = data.desc_cn || '';
        document.getElementById('desc_jp').value = data.desc_jp || '';
        document.getElementById('desc_th').value = data.desc_th || '';
        document.getElementById('desc_vn').value = data.desc_vn || '';
        document.getElementById('desc_id').value = data.desc_id || '';
        document.getElementById('desc_mn').value = data.desc_mn || '';

        if(data.image) {
            const img = document.getElementById('preview');
            img.src = data.image;
            img.style.display = 'block';
        }

        const qrPreview = document.getElementById('qrPreview');
        const qrBtn = document.getElementById('qrDownloadBtn');
        
        if(data.qrImage) {
            qrPreview.src = data.qrImage;
            qrPreview.style.display = 'block';
            qrBtn.href = data.qrImage;
            qrBtn.download = `${id}_qr.jpg`; 
            qrBtn.style.display = 'inline-block';
        } else {
            qrPreview.style.display = 'none';
            qrBtn.style.display = 'none';
        }

        document.getElementById('saveBtn').innerText = "수정 내용 저장하기";
        alert(`'${data.name}' 수정 모드입니다.`);
    } else {
        alert("상품 정보를 찾을 수 없습니다.");
    }
}

window.saveProduct = async function() {
    const btn = document.getElementById('saveBtn');
    const idInput = document.getElementById('productId');
    const id = idInput.value.trim();
    const fileInput = document.getElementById('imageFile');
    const qrInput = document.getElementById('qrFile');
    
    const idRegex = /^[a-zA-Z0-9-_]+$/;

    if (!id) return alert("상품 ID를 입력해주세요!");
    if (!idRegex.test(id)) return alert("❌ ID는 '영문', '숫자'만 입력 가능합니다!");
    if (!document.getElementById('name').value) return alert("상품명을 입력해주세요!");

    try {
        btn.disabled = true;
        btn.innerText = "저장 중..."; 

        let imageUrl = "";
        let qrImageUrl = "";

        if (fileInput.files.length > 0) {
            let file = fileInput.files[0];
            const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1200, useWebWorker: true };
            try { file = await imageCompression(file, options); } catch (e) {}

            const storageRef = ref(storage, 'products/' + id + '.jpg'); 
            await uploadBytes(storageRef, file);
            imageUrl = await getDownloadURL(storageRef);
        }

        if (qrInput.files.length > 0) {
            let qrFile = qrInput.files[0];
            const qrStorageRef = ref(storage, 'products/' + id + '_qr.jpg'); 
            await uploadBytes(qrStorageRef, qrFile);
            qrImageUrl = await getDownloadURL(qrStorageRef);
        }

        const productData = {
            name: document.getElementById('name').value,
            price: Number(document.getElementById('price').value),
            // ✨ 8개국어 데이터 저장
            desc_kr: document.getElementById('desc_kr').value,
            desc_en: document.getElementById('desc_en').value,
            desc_cn: document.getElementById('desc_cn').value,
            desc_jp: document.getElementById('desc_jp').value,
            desc_th: document.getElementById('desc_th').value,
            desc_vn: document.getElementById('desc_vn').value,
            desc_id: document.getElementById('desc_id').value,
            desc_mn: document.getElementById('desc_mn').value,
            updatedAt: new Date()
        };
        
        if(imageUrl) productData.image = imageUrl;
        if(qrImageUrl) productData.qrImage = qrImageUrl;

        await setDoc(doc(db, "products", id), productData, { merge: true });

        alert("✅ 저장 완료!");
        
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
setupPreview('imageFile', 'preview');
setupPreview('qrFile', 'qrPreview');

window.resetForNew = function() { resetForm(); }