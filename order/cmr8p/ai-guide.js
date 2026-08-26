/* ==========================================================================
   🤖 ai-guide.js — AI 주문가이드
   사진 요청(photo_requests) 이미지를 AI로 읽어 제품을 파악하고,
   ① 등록 상품  ② 주문처(사이트/ID/PW/담당자)  ③ 최근 주문기록(order_history)
   ④ 장부 매입이력(ledger 프로젝트 transactions) 을 한 화면에 모아 보여준다.

   - 판독+장부검색은 ledger 프로젝트의 Cloud Function `scanProduct` 가 담당
   - 상품/거래처/주문기록 매칭은 여기(주문 프로젝트)에서 처리
   ========================================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";
import { getFirestore, collection, query, where, getDocs, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* --------------------------------------------------------------------------
   ⚠️ 장부는 약국마다 Firebase 프로젝트가 다르다.
   그래서 역할을 둘로 나눈다.

   [판독 서버] scanProduct 함수 — 딱 한 곳(pharmacy-ledger-fbca7)에만 배포.
               사진만 읽고 제품명을 돌려준다. 장부는 건드리지 않는다.
               모든 지점이 이 하나를 같이 쓴다. (지점마다 배포할 필요 없음)

   [장부 조회] 각 지점 브라우저가 '자기' 장부 프로젝트를 직접 읽는다.
               지점 config.js 에 LEDGER_CONFIG 를 export 하면 그걸 쓴다.
   -------------------------------------------------------------------------- */
const VISION_CONFIG = {          // scanProduct 함수가 배포된 프로젝트 (고정)
    apiKey: "AIzaSyBcMCqu39hwSw1Osm8Kd4GS5KMTG6BEgYA",
    authDomain: "pharmacy-ledger-fbca7.firebaseapp.com",
    projectId: "pharmacy-ledger-fbca7",
    storageBucket: "pharmacy-ledger-fbca7.firebasestorage.app",
    messagingSenderId: "243652172908",
    appId: "1:243652172908:web:a801ea5d71cdfec01fcc49"
};

let CTX = null;
let scanProductFn = null;
let ledgerDb = null;
let ledgerProjectId = "";

export function initAiGuide(ctx) {
    CTX = ctx;

    const visionApp = initializeApp(VISION_CONFIG, "aig-vision");
    scanProductFn = httpsCallable(getFunctions(visionApp, "us-central1"), "scanProduct");

    const lcfg = ctx.ledgerConfig || VISION_CONFIG;
    const ledgerApp = (lcfg.projectId === VISION_CONFIG.projectId)
        ? visionApp
        : initializeApp(lcfg, "aig-ledger");
    ledgerDb = getFirestore(ledgerApp);
    ledgerProjectId = lcfg.projectId;
    console.log(`📒 AI 주문가이드 · 장부=${ledgerProjectId} · 판독=${VISION_CONFIG.projectId}`);
}

const LEDGER_MONTHS = 12;   // 장부 조회 기간

/* ==========================================================================
   유틸
   ========================================================================== */
const norm = (s) => String(s || "").toLowerCase()
    .replace(/[\s\-_.,·`'"()\[\]{}/\\|+*~!?:;]/g, "").trim();
const won = (n) => (Number(n) || 0).toLocaleString() + "원";
const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function monthsAgoStr(m) {
    const d = new Date();
    d.setMonth(d.getMonth() - m);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* 키워드 점수: AI가 뽑은 검색어가 대상 문자열에 몇 글자나 맞는지 */
function scoreText(text, keys) {
    const t = norm(text);
    let score = 0, hit = 0;
    for (const k of keys) {
        const nk = norm(k);
        if (nk.length >= 2 && t.includes(nk)) { score += nk.length * nk.length; hit++; }
    }
    return hit ? score + hit * 2 : 0;
}

/* ==========================================================================
   ⓪ 장부(transactions) — 이 약국의 '자기' 장부 프로젝트에서 직접 검색
   ========================================================================== */

// 규격/단위 토큰은 검색어에서 뺀다 (30정, 100ml 같은 게 섞이면 오탐이 는다)
const UNIT_RE = /^(\d+)?(정|캡슐|포|매|병|박스|박스입|ea|t|tab|cap|ml|l|g|mg|kg|%|개|입|팩|세트|호|미리|리터)$/i;

function buildKeywords(product, extra) {
    const bag = [];
    const push = (v) => {
        const t = norm(v);
        if (t && t.length >= 2 && !UNIT_RE.test(t) && !/^\d+$/.test(t)) bag.push(t);
    };
    (product.keywords || []).forEach(push);
    push(product.name); push(product.brand); push(product.maker);
    String(extra || "").split(/[\s,]+/).forEach(push);
    const n = norm(product.name);
    if (n.length >= 4) bag.push(n.slice(0, 4));   // 제형 접미사 차이 흡수 ("○○정" vs "○○캡슐")
    return [...new Set(bag)].slice(0, 12);
}

/* --- 장부 캐시: 첫 사용 때 12개월치를 받고, 이후엔 새로 생긴 날짜만 추가로 받는다 --- */
let ledgerRows = null;          // 이 페이지 세션 동안 메모리 보관
const cacheKey = () => `aig_ledger_${ledgerProjectId}`;

function rowsFromDoc(id, x) {
    if (!x) return [];
    if (x.type && x.type !== "buy" && x.type !== "입고") return [];   // 매입만
    const list = (Array.isArray(x.items) && x.items.length)
        ? x.items
        : [{ memo: x.memo, qty: x.qty, supply: x.supply, total: x.total }];
    const out = [];
    list.forEach((it, i) => {
        if (!it || !it.memo) return;
        const qty = Number(it.qty) || 0;
        const supply = Number(it.supply) || 0;
        const total = Number(it.total) || 0;
        out.push({
            k: id + "_" + i,
            d: x.date || "",
            v: x.vendor || "",
            m: String(it.memo),
            q: qty, s: supply, t: total
        });
    });
    return out;
}

async function loadLedger() {
    if (ledgerRows) return ledgerRows;

    const cutoff = monthsAgoStr(LEDGER_MONTHS);
    let cached = [];
    let since = cutoff;

    try {
        const raw = localStorage.getItem(cacheKey());
        if (raw) {
            const c = JSON.parse(raw);
            if (c && Array.isArray(c.rows)) {
                cached = c.rows.filter(r => r.d >= cutoff);
                if (c.maxDate && c.maxDate > cutoff) since = c.maxDate;   // 그 날짜부터만 다시 받는다
            }
        }
    } catch (e) { /* 캐시가 깨졌으면 그냥 전체를 받는다 */ }

    const fresh = [];
    try {
        const snap = await getDocs(query(collection(ledgerDb, "transactions"), where("date", ">=", since)));
        snap.forEach(d => fresh.push(...rowsFromDoc(d.id, d.data())));
    } catch (e) {
        console.warn("[AI가이드] 장부 조회 실패", e);
        if (!cached.length) throw new Error("장부를 읽지 못했습니다: " + (e.message || e));
    }

    // 겹치는 구간은 새로 받은 것으로 덮어쓴다
    const map = new Map(cached.map(r => [r.k, r]));
    fresh.forEach(r => map.set(r.k, r));
    const all = [...map.values()].filter(r => r.d >= cutoff);

    let maxDate = cutoff;
    all.forEach(r => { if (r.d > maxDate) maxDate = r.d; });
    try {
        localStorage.setItem(cacheKey(), JSON.stringify({ maxDate, savedAt: Date.now(), rows: all }));
    } catch (e) { /* 용량 초과면 캐시 없이 간다 */ }

    ledgerRows = all.map(r => ({ ...r, n: norm(r.m) }));
    console.log(`📒 장부 ${ledgerRows.length}건 (${cutoff}~, 신규 ${fresh.length}건)`);
    return ledgerRows;
}

async function searchLedger(keys, maxGroups = 6) {
    if (!keys.length) return [];
    const rows = await loadLedger();

    const groups = new Map();
    for (const r of rows) {
        let score = 0, hit = 0;
        for (const k of keys) { if (r.n.includes(k)) { score += k.length * k.length; hit++; } }
        if (!hit) continue;
        score += hit * 2;

        const gk = r.v + "|" + r.n;
        if (!groups.has(gk)) groups.set(gk, { memo: r.m, vendor: r.v, score, count: 0, lastDate: "", records: [] });
        const g = groups.get(gk);
        g.count++;
        g.score = Math.max(g.score, score);
        if (r.d > g.lastDate) g.lastDate = r.d;
        g.records.push({
            date: r.d, qty: r.q, supply: r.s, total: r.t,
            unitSupply: r.q > 0 ? Math.round(r.s / r.q) : 0,
            unitTotal: r.q > 0 ? Math.round(r.t / r.q) : 0
        });
    }

    return [...groups.values()].map(g => {
        g.records.sort((a, b) => (a.date < b.date ? 1 : -1));
        const units = g.records.map(x => x.unitSupply).filter(x => x > 0);
        g.minUnitSupply = units.length ? Math.min(...units) : 0;
        g.maxUnitSupply = units.length ? Math.max(...units) : 0;
        g.lastUnitSupply = g.records[0] ? g.records[0].unitSupply : 0;
        g.records = g.records.slice(0, 5);
        return g;
    }).sort((a, b) => (b.score - a.score) || (a.lastDate < b.lastDate ? 1 : -1))
      .slice(0, maxGroups);
}

/* ==========================================================================
   ① 등록 상품 매칭 (products)
   ========================================================================== */
function matchProducts(product, keys) {
    const list = (CTX.getProducts() || []);
    const scored = [];
    for (const p of list) {
        let s = scoreText(`${p.name} ${p.company || ""}`, keys);
        // 제품명 통짜 일치는 크게 가산
        if (product.name && norm(p.name).includes(norm(product.name))) s += 100;
        if (product.maker && norm(p.company || "").includes(norm(product.maker))) s += 20;
        if (s > 0) scored.push({ p, s });
    }
    return scored.sort((a, b) => b.s - a.s).slice(0, 5).map(x => x.p);
}

/* ==========================================================================
   ② 주문처 (suppliers + supplier_details)
   ========================================================================== */
async function findSupplier(companyName) {
    if (!companyName) return null;
    const sup = (CTX.getSuppliers() || []).find(s => norm(s.name) === norm(companyName))
        || (CTX.getSuppliers() || []).find(s => norm(s.name).includes(norm(companyName)) || norm(companyName).includes(norm(s.name)));
    if (!sup) return { name: companyName, notRegistered: true };

    const out = { id: sup.id, name: sup.name };
    try {
        const snap = await getDoc(doc(CTX.db, "supplier_details", `${sup.id}_${CTX.shopId}`));
        if (snap.exists()) Object.assign(out, snap.data());
        else if (CTX.shopId === "main" && sup.siteId) Object.assign(out, sup);   // 본점 레거시
    } catch (e) { console.warn("[AI가이드] 거래처 상세 로드 실패", e); }
    return out;
}

/* ==========================================================================
   ③ 최근 주문기록 (order_history — 이 시스템에서 실제로 주문한 이력)
   ========================================================================== */
async function findOrderHistory(product, keys, matchedProducts) {
    const cutoff = monthsAgoStr(LEDGER_MONTHS);
    const ids = new Set(matchedProducts.map(p => p.id));
    const out = [];
    try {
        const snap = await getDocs(query(collection(CTX.db, "order_history"), where("date", ">=", cutoff)));
        snap.forEach(d => {
            const h = d.data();
            if (h.shopId && h.shopId !== CTX.shopId) return;
            (h.items || []).forEach(it => {
                const pid = it.product && it.product.id;
                const nameHit = it.product ? scoreText(it.product.name, keys) : 0;
                if ((pid && ids.has(pid)) || nameHit > 0) {
                    out.push({
                        date: h.date,
                        name: it.product ? it.product.name : "",
                        company: it.product ? it.product.company : "",
                        optionName: it.optionName || "",
                        qty: it.qty || 0,
                        unitPrice: it.unitPrice || 0,
                        totalPrice: it.totalPrice || 0
                    });
                }
            });
        });
    } catch (e) { console.warn("[AI가이드] 주문기록 조회 실패", e); }
    return out.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);
}

/* ==========================================================================
   화면
   ========================================================================== */
function ensureModal() {
    let m = document.getElementById("ai-guide-modal");
    if (m) return m;
    m = document.createElement("div");
    m.id = "ai-guide-modal";
    m.style.cssText = "display:none; position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:100000; align-items:center; justify-content:center;";
    m.innerHTML = `
      <div style="background:#fff; width:min(860px,94vw); max-height:88vh; border-radius:12px; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,.35);">
        <div style="padding:16px 20px; border-bottom:1px solid #eee; display:flex; align-items:center; gap:10px;">
          <strong style="font-size:1.1rem;">🤖 AI 주문가이드</strong>
          <span id="aig-model" style="font-size:.75rem; color:#aaa;"></span>
          <button id="aig-close" style="margin-left:auto; background:none; border:none; font-size:1.6rem; line-height:1; cursor:pointer; color:#888;">&times;</button>
        </div>
        <div id="aig-body" style="padding:18px 20px; overflow-y:auto;"></div>
      </div>`;
    document.body.appendChild(m);
    m.querySelector("#aig-close").onclick = () => { m.style.display = "none"; };
    m.onclick = (e) => { if (e.target === m) m.style.display = "none"; };
    return m;
}

const card = (title, inner) => `
  <div style="border:1px solid #e8e8e8; border-radius:10px; margin-bottom:14px; overflow:hidden;">
    <div style="background:#fafafa; padding:9px 14px; font-weight:700; font-size:.9rem; color:#34495e; border-bottom:1px solid #eee;">${title}</div>
    <div style="padding:14px;">${inner}</div>
  </div>`;

const muted = (t) => `<div style="color:#aaa; font-size:.88rem;">${t}</div>`;

function renderResult(bodyEl, data, extras, imageUrl) {
    const { product, hits, searched, model } = data;
    const { products, supplier, history } = extras;

    /* 인식 결과 + 직접 수정 */
    const idBlock = `
      <div style="display:flex; gap:16px; align-items:flex-start;">
        <img src="${esc(imageUrl)}" style="width:110px; height:110px; object-fit:cover; border-radius:8px; border:1px solid #eee;">
        <div style="flex:1;">
          <div style="font-size:1.15rem; font-weight:700; margin-bottom:4px;">${esc(product.name) || '<span style="color:#e74c3c;">인식 실패</span>'}</div>
          <div style="color:#666; font-size:.9rem;">
            ${product.maker ? `제조사 <b>${esc(product.maker)}</b>` : ""}
            ${product.spec ? ` · 규격 <b>${esc(product.spec)}</b>` : ""}
            ${product.barcode ? ` · 바코드 ${esc(product.barcode)}` : ""}
          </div>
          <div style="margin-top:10px; display:flex; gap:6px;">
            <input id="aig-keyword" value="${esc(product.name)}" placeholder="제품명을 직접 고쳐서 다시 찾기"
                   style="flex:1; padding:8px 10px; border:1px solid #ddd; border-radius:6px; font-size:.9rem;">
            <button id="aig-research" style="padding:8px 14px; background:#34495e; color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:.85rem;">다시 찾기</button>
          </div>
        </div>
      </div>`;

    /* 등록 상품 */
    const prodBlock = products.length ? products.map(p => `
        <div style="display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px dashed #f0f0f0;">
          <div style="flex:1;">
            <div style="font-weight:600;">${esc(p.name)}</div>
            <div style="font-size:.82rem; color:#888;">${esc(p.category || "")} · ${esc(p.company || "")}
              ${(p.options || []).slice(0, 3).map(o => ` · ${esc(o.name)} ${won(o.price)}`).join("")}</div>
          </div>
          <button class="aig-pick" data-id="${esc(p.id)}" style="padding:7px 14px; background:#27ae60; color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:.85rem; white-space:nowrap;">이 상품으로 주문</button>
        </div>`).join("")
        : muted("주문 시스템에 등록되지 않은 상품입니다. 상품 관리에서 먼저 등록하거나, 아래 장부 이력을 보고 직접 주문하세요.");

    /* 주문처 */
    let supBlock;
    if (!supplier) {
        supBlock = muted("연결된 거래처 정보가 없습니다.");
    } else if (supplier.notRegistered) {
        supBlock = muted(`'${esc(supplier.name)}' 은(는) 거래처로 등록되어 있지 않습니다.`);
    } else {
        const line = (label, val, extra = "") => val
            ? `<div style="display:flex; gap:8px; padding:3px 0; font-size:.9rem;"><span style="color:#888; width:70px;">${label}</span><b style="flex:1;">${esc(val)}</b>${extra}</div>` : "";
        supBlock = `
          <div style="font-weight:700; margin-bottom:6px;">${esc(supplier.name)}</div>
          ${supplier.website ? `<div style="padding:3px 0;"><a href="${esc(supplier.website)}" target="_blank" rel="noopener" style="color:#2980b9; font-weight:600;">🔗 주문 사이트 열기</a></div>` : ""}
          ${line("아이디", supplier.siteId)}
          ${line("비밀번호", supplier.sitePw)}
          ${line("담당자", supplier.curManagerName)}
          ${supplier.curManagerPhone ? line("연락처", supplier.curManagerPhone,
            `<a href="tel:${esc(supplier.curManagerPhone)}" style="color:#27ae60; font-weight:600; margin-left:6px;">전화</a>
             <a href="sms:${esc(supplier.curManagerPhone)}" style="color:#2980b9; font-weight:600; margin-left:8px;">문자</a>`) : ""}
          ${(!supplier.website && !supplier.siteId && !supplier.curManagerPhone) ? muted("등록된 주문 경로 정보가 없습니다. 거래처 관리에서 채워두면 다음부터 여기 뜹니다.") : ""}`;
    }

    /* 이 시스템 주문기록 */
    const histBlock = history.length ? `
        <table style="width:100%; border-collapse:collapse; font-size:.88rem;">
          <thead><tr style="color:#888; text-align:left;">
            <th style="padding:4px 0;">날짜</th><th>상품 / 옵션</th><th style="text-align:right;">수량</th><th style="text-align:right;">단가</th><th style="text-align:right;">금액</th></tr></thead>
          <tbody>${history.map(h => `
            <tr style="border-top:1px solid #f2f2f2;">
              <td style="padding:6px 0;">${esc(h.date)}</td>
              <td>${esc(h.name)}<span style="color:#aaa;"> ${esc(h.optionName)}</span></td>
              <td style="text-align:right;">${h.qty}</td>
              <td style="text-align:right;">${won(h.unitPrice)}</td>
              <td style="text-align:right; font-weight:600;">${won(h.totalPrice)}</td>
            </tr>`).join("")}</tbody>
        </table>` : muted("이 시스템으로 주문한 기록이 없습니다.");

    /* 장부 매입이력 */
    const ledgerBlock = hits.length ? hits.map(g => {
        const cheap = g.minUnitSupply, high = g.maxUnitSupply;
        const gap = (high > 0 && cheap > 0 && high !== cheap)
            ? `<span style="color:#e74c3c; font-size:.8rem; margin-left:6px;">최저 ${won(cheap)} ~ 최고 ${won(high)}</span>` : "";
        return `
          <div style="padding:10px 0; border-bottom:1px dashed #f0f0f0;">
            <div style="display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">
              <b style="color:#2c3e50;">${esc(g.vendor)}</b>
              <span style="font-size:.88rem; color:#555;">${esc(g.memo)}</span>
              <span style="margin-left:auto; font-size:.82rem; color:#888;">최근 ${esc(g.lastDate)} · ${g.count}건</span>
            </div>
            <div style="margin-top:4px; font-size:.85rem;">
              최근 단가 <b>${won(g.lastUnitSupply)}</b> <span style="color:#aaa;">(공급가 기준)</span>${gap}
            </div>
            <table style="width:100%; border-collapse:collapse; font-size:.82rem; color:#666; margin-top:6px;">
              ${g.records.map(r => `
                <tr>
                  <td style="padding:2px 0;">${esc(r.date)}</td>
                  <td style="text-align:right;">${r.qty}개</td>
                  <td style="text-align:right;">단가 ${won(r.unitSupply)}</td>
                  <td style="text-align:right;">공급가 ${won(r.supply)}</td>
                  <td style="text-align:right;">합계 ${won(r.total)}</td>
                </tr>`).join("")}
            </table>
          </div>`;
    }).join("") : muted(`최근 ${LEDGER_MONTHS}개월 장부에서 매입 기록을 찾지 못했습니다. 제품명을 고쳐서 다시 찾아보세요.`);

    bodyEl.innerHTML =
        idBlock +
        `<div style="height:14px;"></div>` +
        card("📦 등록 상품", prodBlock) +
        card("🏢 주문처 · 접속 정보", supBlock) +
        card("🧾 이 시스템 주문기록", histBlock) +
        card(`📒 장부 매입이력 <span style="font-weight:400; color:#aaa; font-size:.8rem;">최근 ${LEDGER_MONTHS}개월 · ${searched.scanned}건 조회</span>`, ledgerBlock);

    document.getElementById("aig-model").textContent = model ? `(${model})` : "";
}

/* ==========================================================================
   진입점
   ========================================================================== */
export async function openAiOrderGuide(photoReq) {
    if (!CTX) { alert("AI 가이드가 초기화되지 않았습니다."); return; }

    const modal = ensureModal();
    const body = document.getElementById("aig-body");
    modal.style.display = "flex";
    body.innerHTML = `<div style="padding:50px; text-align:center; color:#888;">
        <div style="font-size:2rem; margin-bottom:10px;">🔍</div>사진을 읽고 주문 이력을 찾는 중입니다...<br>
        <span style="font-size:.85rem; color:#bbb;">10~20초 정도 걸립니다</span></div>`;

    const run = async (keyword) => {
        try {
            // 판독 결과(제품명)는 문서에 캐시해 두고 재사용한다 → 같은 사진은 AI를 두 번 부르지 않는다.
            const cached = (photoReq.aiScan && photoReq.aiScan.product && photoReq.aiScan.product.name)
                ? photoReq.aiScan.product : null;

            let product, model = "";
            if (keyword) {
                // 사람이 고쳐서 다시 찾기 → 서버 호출 없음. 장부만 다시 훑는다 (즉시·무료)
                product = { name: keyword, brand: "", maker: "", spec: "", barcode: "", keywords: [] };
                if (cached) { product.maker = cached.maker; product.spec = cached.spec; }
            } else if (cached) {
                product = cached;
                model = (photoReq.aiScan && photoReq.aiScan.model) || "";
            } else {
                const res = await scanProductFn({ imageUrl: photoReq.imageUrl, ledger: false });
                const data = res.data;
                if (!data || !data.ok) throw new Error("서버가 유효한 결과를 반환하지 않았습니다.");
                product = data.product;
                model = data.model || "";
                photoReq.aiScan = { product, model };
                updateDoc(doc(CTX.db, "photo_requests", photoReq.id), {
                    aiScan: photoReq.aiScan, aiScanAt: new Date()
                }).catch(e => console.warn("[AI가이드] 결과 캐시 실패", e));
            }

            const keys = buildKeywords(product, keyword);

            // 장부는 이 약국 '자기' 프로젝트에서 매번 새로 훑는다 (어제 산 기록이 빠지면 안 되니까)
            const hits = await searchLedger(keys);
            const products = matchProducts(product, keys);
            const supplier = await findSupplier(
                (products[0] && products[0].company) || product.maker || product.brand
            );
            const history = await findOrderHistory(product, keys, products);

            const data = { product, hits, model, searched: { scanned: (ledgerRows || []).length } };
            renderResult(body, data, { products, supplier, history }, photoReq.imageUrl);

            /* 상품 선택 → 기존 주문 흐름으로 */
            body.querySelectorAll(".aig-pick").forEach(btn => {
                btn.onclick = () => {
                    const p = (CTX.getProducts() || []).find(x => x.id === btn.dataset.id);
                    if (!p) return;
                    modal.style.display = "none";
                    const viewer = document.getElementById("photo-viewer-modal");
                    if (viewer) viewer.style.display = "none";
                    CTX.onPickProduct(p, photoReq.id);
                };
            });

            /* 제품명 고쳐서 다시 찾기 (사진이 흐릴 때의 탈출구) */
            const btnRe = document.getElementById("aig-research");
            if (btnRe) btnRe.onclick = () => {
                const kw = document.getElementById("aig-keyword").value.trim();
                if (!kw) return;
                body.innerHTML = `<div style="padding:50px; text-align:center; color:#888;">'${esc(kw)}' 로 다시 찾는 중...</div>`;
                run(kw);
            };

        } catch (e) {
            console.error("[AI가이드]", e);
            body.innerHTML = `<div style="padding:40px; text-align:center; color:#e74c3c;">
                실패: ${esc(e.message || e)}<br>
                <span style="color:#aaa; font-size:.85rem;">함수가 배포되어 있는지, 네트워크가 정상인지 확인해 주세요.</span></div>`;
        }
    };

    run("");
}
