import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 1. 약국별 설정
const pharmacyConfigs = [
    {
        name: "에이트 명동1번가",
        color: "blue",
        config: {
            apiKey: "AIzaSyDHENfqV16JMUBvatYvJq4F3FPvvyCWMqM",
            authDomain: "ledger-8pmd1st.firebaseapp.com",
            projectId: "ledger-8pmd1st",
            storageBucket: "ledger-8pmd1st.firebasestorage.app",
            messagingSenderId: "396567030990",
            appId: "1:396567030990:web:5ae5265c49d7800fcbf49f"
        }
    },
    {
        name: "충무로에이트약국",
        color: "green",
        config: {
            apiKey: "AIzaSyD6gYbjdXjdwLNP4baJTxKZpqbaSFkG670",
            authDomain: "ledger-cmr8p.firebaseapp.com",
            projectId: "ledger-cmr8p",
            storageBucket: "ledger-cmr8p.firebasestorage.app",
            messagingSenderId: "556126872516",
            appId: "1:556126872516:web:2c5e1044619d5201837a91"
        }
    },
    {
        name: "서초에이트약국",
        color: "purple",
        config: {
            apiKey: "AIzaSyBcMCqu39hwSw1Osm8Kd4GS5KMTG6BEgYA",
            authDomain: "pharmacy-ledger-fbca7.firebaseapp.com",
            projectId: "pharmacy-ledger-fbca7",
            storageBucket: "pharmacy-ledger-fbca7.firebasestorage.app",
            messagingSenderId: "243652172908",
            appId: "1:243652172908:web:a801ea5d71cdfec01fcc49"
        }
    }
];

let allItems = []; 
let cart = [];     
let swiperInstance = null;
const EXCLUDE_WORDS = ["테스트", "샘플", "비매품", "취소"];

/**
 * 2. 모바일 브라우저 툴바 높이 보정
 */
function setScreenSize() {
    let vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
}
window.addEventListener('resize', setScreenSize);
setScreenSize();

/**
 * 3. 10개 단위 커스텀 페이지네이션
 */
function customPagination(swiper) {
    const paginationEl = document.querySelector('.swiper-pagination');
    const containerEl = document.querySelector('.pagination-container');
    if (!paginationEl || !containerEl) return;
    
    paginationEl.innerHTML = '';
    const total = swiper.slides.length;
    const current = swiper.activeIndex;
    
    // 10개씩 끊어보는 그룹 범위 계산
    const startPage = Math.floor(current / 10) * 10;
    const endPage = Math.min(startPage + 10, total);

    // [이전 그룹]
    if (startPage > 0) {
        createBullet('«', () => swiper.slideTo(startPage - 1), true);
    }

    // [숫자 버튼]
    for (let i = startPage; i < endPage; i++) {
        createBullet(i + 1, () => swiper.slideTo(i), false, i === current);
    }

    // [다음 그룹]
    if (endPage < total) {
        createBullet('»', () => swiper.slideTo(endPage), true);
    }

    // 버튼 생성 도우미 함수
    function createBullet(text, onClick, isArrow, isActive = false) {
        const bullet = document.createElement('span');
        bullet.className = `swiper-pagination-bullet ${isActive ? 'swiper-pagination-bullet-active' : ''} ${isArrow ? 'bullet-arrow' : ''}`;
        bullet.innerHTML = text;
        bullet.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            onClick();
        };
        paginationEl.appendChild(bullet);
    }

    // [핵심] 활성화된 버튼을 중앙으로 부드럽게 이동
    setTimeout(() => {
        const activeBullet = paginationEl.querySelector('.swiper-pagination-bullet-active');
        if (activeBullet) {
            const containerWidth = containerEl.offsetWidth;
            const bulletOffset = activeBullet.offsetLeft;
            const bulletWidth = activeBullet.offsetWidth;
            
            containerEl.scrollTo({
                left: bulletOffset - (containerWidth / 2) + (bulletWidth / 2),
                behavior: 'smooth'
            });
        }
    }, 50);
}

/**
 * 4. 메인 리스트 렌더링 (뱃지 로직 포함)
 */
function renderSwiper(items) {
    const wrapper = document.getElementById('swiperWrapper');
    if (!wrapper) return;
    
    // [추가] 현재 페이지 번호 저장
    const currentPageIndex = swiperInstance ? swiperInstance.activeIndex : 0;
    
    wrapper.innerHTML = '';

    const chunkSize = 10;
    for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        const slide = document.createElement('div');
        slide.className = 'swiper-slide px-4 space-y-3 pb-4';

        chunk.forEach(item => {
            const cartItem = cart.find(c => c.pharmacyName === item.pharmacyName && c.memo === item.memo);
            const isAdded = !!cartItem;
            const borderColor = item.pharmacyColor === 'blue' ? 'border-l-blue-500' : 
                               item.pharmacyColor === 'green' ? 'border-l-green-500' : 'border-l-purple-500';
            
            slide.innerHTML += `
                <div class="item-card ${isAdded ? 'bg-blue-50' : 'bg-white'} p-4 rounded-2xl shadow-sm flex justify-between items-center border-l-4 ${borderColor} relative">
                    ${isAdded ? `
                        <div class="absolute -top-2 -right-1 z-10 pointer-events-none">
                            <span class="bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded-full font-black shadow-md">담김 ${cartItem.orderQty}</span>
                        </div>` : ''}
                    <div class="flex-1 mr-3 text-left">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-bold">${item.pharmacyName}</span>
                            <span class="text-[10px] font-medium text-gray-400">${item.vendor || '미정'}</span>
                        </div>
                        <h3 class="font-bold text-gray-800 text-sm leading-tight">${item.memo || '품목명 없음'}</h3>
                        <div class="flex gap-2 mt-2">
                            <span class="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md font-bold">사입: ${item.lastPurchaseQty}</span>
                            <span class="text-[10px] text-gray-400 py-0.5">${item.lastPurchaseDate}</span>
                        </div>
                    </div>
                    <div class="flex flex-col items-end gap-2">
                        <div class="flex items-center bg-gray-100 rounded-lg p-1">
                            <button onclick="updateQty('${item.id}', -1)" class="w-7 h-7 flex items-center justify-center bg-white rounded shadow-sm text-gray-600 font-bold">-</button>
                            <input type="number" id="qty-${item.id}" value="1" min="1" readonly class="w-8 text-center bg-transparent font-bold text-xs outline-none">
                            <button onclick="updateQty('${item.id}', 1)" class="w-7 h-7 flex items-center justify-center bg-white rounded shadow-sm text-gray-600 font-bold">+</button>
                        </div>
                        <button onclick="addToCart('${item.id}')" class="${isAdded ? 'bg-gray-500' : 'bg-blue-600'} text-white px-4 py-2 rounded-xl text-xs font-bold active:scale-95 transition-all">
                            ${isAdded ? '수량추가' : '담기'}
                        </button>
                    </div>
                </div>`;
        });
        wrapper.appendChild(slide);
    }

    if (swiperInstance) swiperInstance.destroy();
    
    swiperInstance = new Swiper(".mySwiper", {
        observer: true, 
        observeParents: true,
        initialSlide: currentPageIndex, // [핵심] 갱신 전 보던 페이지에서 시작
        speed: 0, // [선택] 페이지 전환 시 애니메이션 없이 즉시 이동 (깜빡임 방지)
        on: {
            init: function () { customPagination(this); },
            slideChange: function () { 
                customPagination(this);
            }
        }
    });
    
    // [중요] 0초 뒤에 속도를 다시 원래대로 복구 (사용자가 넘길 때는 부드럽게)
    setTimeout(() => { swiperInstance.params.speed = 300; }, 50);

    if (window.lucide) lucide.createIcons();
}

/**
 * 5. 장바구니 로직
 */
window.addToCart = (id) => {
    const item = allItems.find(i => i.id === id);
    const orderQty = parseInt(document.getElementById(`qty-${id}`).value) || 1;
    const idx = cart.findIndex(c => c.pharmacyName === item.pharmacyName && c.memo === item.memo);
    
    if (idx > -1) cart[idx].orderQty += orderQty;
    else cart.push({ ...item, orderQty });
    
    // [수정] true 인자를 전달하여 '단순 장바구니 업데이트'임을 알림
    updateCartUI(true);
    if (navigator.vibrate) navigator.vibrate(40);
};

window.openCartModal = () => {
    const modal = document.getElementById('cartModal');
    const listEl = document.getElementById('modalCartList');
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    
    if (cart.length === 0) {
        listEl.innerHTML = '<div class="py-20 text-center text-gray-400 font-bold">장바구니가 비어있습니다.</div>';
        return;
    }

    listEl.innerHTML = cart.map((item, index) => `
        <div class="flex justify-between items-center bg-gray-50 p-4 rounded-2xl border border-gray-100 mb-3 shadow-sm">
            <div class="flex-1">
                <span class="text-[9px] px-1.5 py-0.5 rounded bg-white border font-bold text-gray-500">${item.pharmacyName}</span>
                <p class="font-bold text-gray-800 text-sm mt-1">${item.memo}</p>
                <p class="text-xs text-blue-600 font-extrabold mt-0.5">주문 수량: ${item.orderQty}개</p>
            </div>
            <button onclick="removeFromCart(event, ${index})" class="p-2 text-red-400 active:bg-red-50 rounded-full">
                <i data-lucide="trash-2" class="w-5 h-5"></i>
            </button>
        </div>
    `).join('');
    if (window.lucide) lucide.createIcons();
};

window.closeCartModal = () => {
    document.getElementById('cartModal').classList.add('hidden');
    document.body.style.overflow = '';
};

window.removeFromCart = (e, index) => {
    e.stopPropagation();
    cart.splice(index, 1);
    updateCartUI();
    openCartModal(); // 모달 내용 갱신
};

window.clearCart = () => {
    if (!confirm("장바구니를 모두 비울까요?")) return;
    cart = [];
    updateCartUI();
    closeCartModal();
};

function updateCartUI(isFromCart = false) {
    document.getElementById('cartCount').innerText = cart.length;
    document.getElementById('cartStatusText').innerText = cart.length > 0 ? `${cart.length}개 품목 담김` : "장바구니가 비어있음";
    
    // 필터 함수에 장바구니 담기 여부 전달
    window.filterItems(isFromCart); 
}

/**
 * 6. 데이터 로드 및 필터
 */
async function loadAllData() {
    allItems = [];
    const fetchPromises = pharmacyConfigs.map(async (p) => {
        try {
            const app = initializeApp(p.config, p.name);
            const db = getFirestore(app);
            const q = query(collection(db, "transactions"), orderBy("date", "desc"));
            const snap = await getDocs(q);
            snap.forEach(doc => {
                const data = doc.data();
                if (EXCLUDE_WORDS.some(w => (data.memo || "").includes(w))) return;
                allItems.push({
                    id: `${p.name}-${doc.id}`, pharmacyName: p.name, pharmacyColor: p.color,
                    ...data, lastPurchaseQty: data.qty || 0, lastPurchaseDate: data.date || "날짜미상"
                });
            });
        } catch (err) { console.error(err); }
    });
    await Promise.all(fetchPromises);
    const uniqueMap = new Map();
    allItems.forEach(item => {
        const key = `${item.pharmacyName}-${item.memo}`;
        if (!uniqueMap.has(key)) uniqueMap.set(key, item);
    });
    allItems = Array.from(uniqueMap.values()).sort((a, b) => (a.memo || "").localeCompare(b.memo || "", 'ko'));
    renderSwiper(allItems);
}

window.filterItems = (isFromCart = false) => {
    const term = document.getElementById('searchInput').value.toLowerCase();
    const sel = document.getElementById('pharmacyFilter').value;
    
    const filtered = allItems.filter(i => {
        const mSearch = (i.memo?.toLowerCase().includes(term)) || (i.vendor?.toLowerCase().includes(term));
        const mPharm = (sel === 'all' || i.pharmacyName === sel);
        return mSearch && mPharm;
    });

    // 검색이나 필터링을 직접 할 때는 1페이지부터 보여줘야 하므로 인스턴스 파괴 후 재생성 시 index 0 사용
    // 하지만 장바구니 담기(isFromCart)일 때는 현재 위치를 유지하도록 renderSwiper 내부 로직에 맡김
    if(!isFromCart && swiperInstance) {
        swiperInstance.activeIndex = 0;
    }

    renderSwiper(filtered);
};

window.updateQty = (id, delta) => {
    const input = document.getElementById(`qty-${id}`);
    let val = (parseInt(input.value) || 1) + delta;
    input.value = val < 1 ? 1 : val;
};

window.generateOrderReport = () => {
    if (cart.length === 0) return alert("장바구니가 비어있습니다.");
    let content = `<html><head><title>주문서</title><style>table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ddd;padding:8px;text-align:left;}</style></head><body><h2>약국 주문 내역</h2><table><tr><th>약국</th><th>품목명</th><th>거래처</th><th>수량</th></tr>`;
    cart.forEach(i => { content += `<tr><td>${i.pharmacyName}</td><td>${i.memo}</td><td>${i.vendor || '-'}</td><td>${i.orderQty}</td></tr>`; });
    content += `</table></body></html>`;
    const win = window.open('', '_blank');
    win.document.write(content);
    win.document.close();
    win.print();
};

loadAllData();