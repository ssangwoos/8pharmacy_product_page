/* ══════════════════════════════════════════════════════════════════════
   EIGHT PHARMACY — 공개 페이지 로직

   지점 내용은 관리자 페이지(admin.html)에서 수정합니다.
   이 파일은 화면을 그리는 역할만 합니다.
   ══════════════════════════════════════════════════════════════════════ */

/* ── 인라인 아이콘 (외부 아이콘 CDN 없이 동작) ───────────────────────── */
const ICON = {
  receipt:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3v18l2.5-1.6L10 21l2-1.6L14 21l2.5-1.6L19 21V3H5Z"/><path d="M9 8h6M9 12h6"/></svg>',
  shield:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 6v5.5c0 4.3 2.9 7.7 7 9.5 4.1-1.8 7-5.2 7-9.5V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg>',
  "badge-check":'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.4 2.4 4.6-4.8"/></svg>',
  "arrow-down":'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
  "arrow-up-right":'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7"/></svg>',
  pin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/></svg>',
  clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.2 2"/></svg>',
  phone:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6.2 4h3l1.5 3.7-2 1.4a11 11 0 0 0 5.2 5.2l1.4-2 3.7 1.5v3a1.7 1.7 0 0 1-1.9 1.7C10.4 17.8 6.2 13.6 4.5 5.9A1.7 1.7 0 0 1 6.2 4Z"/></svg>',
  naver:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#03C75A"/><path d="M13.6 12.3 10.2 7H7v10h3.3v-5.3L13.8 17H17V7h-3.4z" fill="#fff"/></svg>',
  kakao:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#FEE500"/><path d="M12 6c-3.3 0-6 2-6 4.5 0 1.6 1.1 3 2.8 3.8l-.6 2.3 2.6-1.5c.4.1.8.1 1.2.1 3.3 0 6-2 6-4.7S15.3 6 12 6Z" fill="#191600"/></svg>',
  google:'<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21.5s7-6.4 7-11.2A7 7 0 0 0 5 10.3c0 4.8 7 11.2 7 11.2Z" fill="#EA4335"/><circle cx="12" cy="10" r="2.7" fill="#fff"/></svg>',
  amap:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#00A0E9"/><path d="M12 5.5 6.5 18h2.6l1-2.5h3.8l1 2.5h2.6L12 5.5Zm-1.1 7.9L12 10.6l1.1 2.8h-2.2Z" fill="#fff"/></svg>',
  instagram:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3" y="3" width="18" height="18" rx="5.4"/><circle cx="12" cy="12" r="4.1"/><circle cx="17.3" cy="6.7" r="1.2" fill="currentColor" stroke="none"/></svg>',
  tiktok:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 3 15.65 6.34 6.34 0 0 0 9.35 22a6.34 6.34 0 0 0 6.34-6.35V9.17a8.16 8.16 0 0 0 4.8-1.58l-.9-2.9z"/></svg>'
};

const STORE_KEY = "ep-profile-lang";

let lang = detectLang();
let region = "all";
let onlyOpen = false;
let DATA = epNormalize(DEFAULT_DATA);

/* ── 언어 감지 ───────────────────────────────────────────────────────── */

/* "ja" "JP" "ja-JP" "japanese" 같은 여러 표기를 지원 언어 코드로 정리 */
function normalizeLangCode(raw){
  if (!raw) return "";
  const v = String(raw).trim().toLowerCase().replace(/_/g, "-");
  if (LANG_CODES.includes(v)) return v;                       // ja, zh, tw …
  const byShort = LANGS.find(l => l.short.toLowerCase() === v); // JP, CN, VN …
  if (byShort) return byShort.code;
  for (const [re, code] of LANG_MATCH) if (re.test(v)) return code;
  return "";
}

/* 주소에 지정된 언어 읽기 — ?lang=ja / ?l=jp / #ja 모두 인식 */
function langFromUrl(){
  try {
    const q = new URLSearchParams(location.search);
    const fromQuery = normalizeLangCode(q.get("lang") || q.get("l") || q.get("hl"));
    if (fromQuery) return fromQuery;
    const h = (location.hash || "").replace(/^#/, "").replace(/^lang=/i, "");
    if (h && h.length <= 5) return normalizeLangCode(h);
  } catch (e) { /* 주소 해석 실패는 무시 */ }
  return "";
}

function detectLang(){
  // 0) 주소로 언어를 지정했으면 무조건 그 언어 (?lang=ja 처럼)
  const forced = langFromUrl();
  if (forced) {
    try {
      if (typeof REMEMBER_LANG === "undefined" || REMEMBER_LANG)
        localStorage.setItem(STORE_KEY, forced);
    } catch (e) { /* 저장 실패는 무시 */ }
    return forced;
  }

  // 1) 손님이 직접 고른 언어가 있으면 그것을 우선 (REMEMBER_LANG 이 true 일 때)
  if (typeof REMEMBER_LANG === "undefined" || REMEMBER_LANG) {
    try {
      const saved = localStorage.getItem(STORE_KEY);
      if (saved && LANG_CODES.includes(saved)) return saved;
    } catch (e) { /* 프라이빗 모드 등 — 아래 단계로 진행 */ }
  }

  // 2) 자동 감지를 켰다면 브라우저 언어에 맞춤 (data.js 의 AUTO_DETECT_LANG)
  if (typeof AUTO_DETECT_LANG !== "undefined" && AUTO_DETECT_LANG) {
    const list = (navigator.languages && navigator.languages.length)
      ? navigator.languages : [navigator.language || ""];
    for (const raw of list) {
      const tag = String(raw);
      for (const [re, code] of LANG_MATCH) if (re.test(tag)) return code;
    }
  }

  // 3) 기본 언어
  return (typeof DEFAULT_LANG !== "undefined" && LANG_CODES.includes(DEFAULT_LANG))
    ? DEFAULT_LANG : "en";
}

/* ── 영업 상태 (한국 시간 기준) ──────────────────────────────────────── */
function seoulNow(){
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
}
function toMin(hhmm){
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function rangeForDay(hours, day){
  if (day === 0) return hours.sun;
  if (day === 6) return hours.sat;
  return hours.weekday;
}
function statusOf(hours){
  const t = UI[lang];
  const now = seoulNow();
  const range = rangeForDay(hours, now.getDay());
  if (!range || !range.includes("-")) return { cls:"is-shut", label:t.stOff, open:false };

  const [openStr, closeStr] = range.split("-");
  let open = toMin(openStr), close = toMin(closeStr);
  if (close <= open) close += 1440;                    // 자정 넘김 (예: 22:00-01:00)
  let mins = now.getHours() * 60 + now.getMinutes();
  if (mins < open && close > 1440) mins += 1440;

  if (mins < open)   return { cls:"is-shut", label:openStr + " " + t.stOpensAt, open:false };
  if (mins >= close) return { cls:"is-shut", label:t.stShut, open:false };
  if (close - mins <= 60) return { cls:"is-soon", label:t.stSoon + " " + closeStr, open:true };
  return { cls:"is-open", label:t.stOpen + " · " + closeStr, open:true };
}

/* ── 유틸 ────────────────────────────────────────────────────────────── */
function esc(s){
  return String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
}
function ico(name){ return ICON[name] || ""; }

function hoursLine(h){
  const t = UI[lang];
  const fmt = v => (v && v.includes("-")) ? v.replace("-", " – ") : t.stOff;
  const vals = [h.weekday, h.sat, h.sun];
  if (vals[0] === vals[1] && vals[1] === vals[2]) return fmt(vals[0]);
  return [t.dWeekday, t.dSat, t.dSun].map((d, i) => d + " " + fmt(vals[i])).join("  ·  ");
}

/* ── 언어 선택기 ─────────────────────────────────────────────────────── */
function currentLangDef(){
  return LANGS.find(l => l.code === lang) || LANGS[0];
}

function renderLangSwitch(){
  const def = currentLangDef();
  const flag = document.getElementById("langFlag");
  flag.src = def.flag;
  flag.alt = def.short;
  flag.onerror = function(){ this.style.display = "none"; };
  document.getElementById("langShort").textContent = def.short;
  document.getElementById("langToggle").setAttribute("aria-label", UI[lang].langLabel);

  document.getElementById("langMenu").innerHTML = LANGS.map(l => `
    <button class="lang-item ${l.code === lang ? "is-current" : ""}" type="button"
            role="option" aria-selected="${l.code === lang}" data-lang="${l.code}">
      <img src="${l.flag}" alt="" width="20" height="14" onerror="this.style.display='none'">
      <span class="lang-item-label">${esc(l.label)}</span>
      <span class="lang-item-check">${l.code === lang ? ico("check") : ""}</span>
    </button>`).join("");
}

function openLangMenu(open){
  const menu = document.getElementById("langMenu");
  const btn = document.getElementById("langToggle");
  menu.hidden = !open;
  btn.setAttribute("aria-expanded", String(open));
  btn.classList.toggle("is-open", open);
}

/* ── 렌더 ────────────────────────────────────────────────────────────── */
function renderStaticIcons(){
  document.querySelectorAll("[data-ico]").forEach(el => {
    if (!el.dataset.icoDone) { el.innerHTML = ico(el.dataset.ico); el.dataset.icoDone = "1"; }
  });
}

function renderFilters(){
  const t = UI[lang];
  const rSel = document.getElementById("regionFilter");
  const used = DATA.regions.filter(r => DATA.branches.some(b => b.region === r.id));
  rSel.innerHTML =
    `<option value="all">${esc(t.optAllRegion)}</option>` +
    used.map(r => {
      const n = DATA.branches.filter(b => b.region === r.id).length;
      return `<option value="${esc(r.id)}">${esc(epRegionLabel(r, lang))} (${n})</option>`;
    }).join("");
  rSel.value = used.some(r => r.id === region) ? region : (region = "all");

  const sSel = document.getElementById("statusFilter");
  sSel.innerHTML =
    `<option value="all">${esc(t.optAllStatus)}</option>` +
    `<option value="open">${esc(t.optOpenNow)}</option>`;
  sSel.value = onlyOpen ? "open" : "all";
}

function renderChannels(){
  const c = DATA.channels;
  document.getElementById("channelHandle").textContent = c.handle || "";

  const rows = [
    ["instagram", "Instagram", c.instagram, "insta"],
    ["tiktok",    "TikTok",    c.tiktok,    "tiktok"]
  ].filter(r => r[2]);

  document.getElementById("channelList").innerHTML = rows.map(([key, name, url, cls]) => `
    <a class="channel-card ${cls}" href="${esc(url)}" target="_blank" rel="noopener">
      <span class="channel-ico">${ico(key)}</span>
      <span class="channel-meta">
        <span class="channel-name">${name}</span>
        <span class="channel-handle">${esc(UI[lang].follow)}</span>
      </span>
      <span class="channel-arrow">${ico("arrow-up-right")}</span>
    </a>`).join("");
}

function renderBranches(){
  const t = UI[lang];
  const list = DATA.branches.filter(b => {
    if (region !== "all" && b.region !== region) return false;
    if (onlyOpen && !statusOf(b.hours).open) return false;
    return true;
  });

  document.getElementById("branchCount").textContent =
    ["ko", "ja", "zh", "tw"].includes(lang)
      ? `${list.length}${t.countUnit}`
      : `${list.length} ${t.countUnit}`;
  document.getElementById("emptyNote").hidden = list.length > 0;

  document.getElementById("branchList").innerHTML = list.map(b => {
    const tx = epText(b, lang);
    const st = statusOf(b.hours);

    const mapBtns = [["naver", t.btnNaver], ["kakao", t.btnKakao], ["google", t.btnGoogle], ["amap", t.btnAmap]]
      .filter(([k]) => b.maps[k])
      .map(([k, label]) =>
        `<a class="map-btn" href="${esc(b.maps[k])}" target="_blank" rel="noopener">${ico(k)}<span>${esc(label)}</span></a>`)
      .join("");

    const socialBtns = [["instagram", "Instagram"], ["tiktok", "TikTok"]]
      .filter(([k]) => b.social[k])
      .map(([k, label]) =>
        `<a class="social-btn" href="${esc(b.social[k])}" target="_blank" rel="noopener">${ico(k)}<span>${label}</span></a>`)
      .join("");

    const call = b.phone
      ? `<a class="call-btn" href="tel:${esc(b.phone.replace(/[^0-9+]/g, ""))}">${ico("phone")}<span>${esc(b.phone)}</span></a>`
      : "";

    return `<article class="branch">
      <div class="branch-banner ${b.photo ? "has-photo" : ""}" ${b.photo ? `style="background-image:url('${esc(b.photo)}')"` : ""}>
        ${b.photo ? "" : '<span class="glyph" aria-hidden="true">8</span>'}
        ${b.cityTag ? `<span class="city-tag">${esc(b.cityTag)}</span>` : "<span></span>"}
        <span class="status ${st.cls}"><span class="dot"></span>${esc(st.label)}</span>
      </div>
      <div class="branch-body">
        <div class="branch-top">
          <h3 class="branch-name">${esc(tx.name)}</h3>
          ${tx.sub ? `<span class="branch-sub">${esc(tx.sub)}</span>` : ""}
        </div>
        ${tx.address ? `<p class="branch-row"><span class="ico">${ico("pin")}</span><span>${esc(tx.address)}</span></p>` : ""}
        <p class="branch-row"><span class="ico">${ico("clock")}</span><span><b>${esc(hoursLine(b.hours))}</b>${
          b.nightOpen ? ` · ${esc(t.nightOpen)}` : ""}</span></p>
        ${tx.desc ? `<p class="branch-desc">${esc(tx.desc)}</p>` : ""}
        ${mapBtns ? `<div class="map-row ${mapBtns.split("</a>").length - 1 === 4 ? "is-four" : ""}">${mapBtns}</div>` : ""}
        ${socialBtns ? `<div class="social-row">${socialBtns}</div>` : ""}
        ${call}
      </div>
    </article>`;
  }).join("");
}

function render(){
  const t = UI[lang];
  document.documentElement.lang = lang === "tw" ? "zh-Hant" : (lang === "zh" ? "zh-Hans" : lang);

  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (t[key] !== undefined) el.innerHTML = t[key];
  });

  renderStaticIcons();
  renderLangSwitch();
  renderFilters();
  renderChannels();
  renderBranches();
}

/* ── 이벤트 ──────────────────────────────────────────────────────────── */
document.getElementById("langToggle").addEventListener("click", e => {
  e.stopPropagation();
  openLangMenu(document.getElementById("langMenu").hidden);
});

document.getElementById("langMenu").addEventListener("click", e => {
  const btn = e.target.closest(".lang-item");
  if (!btn) return;
  lang = btn.dataset.lang;
  try {
    if (typeof REMEMBER_LANG === "undefined" || REMEMBER_LANG) localStorage.setItem(STORE_KEY, lang);
    else localStorage.removeItem(STORE_KEY);
  } catch (err) { /* 저장 실패 무시 */ }
  openLangMenu(false);
  render();
});

document.addEventListener("click", () => openLangMenu(false));
document.addEventListener("keydown", e => { if (e.key === "Escape") openLangMenu(false); });

document.getElementById("regionFilter").addEventListener("change", e => {
  region = e.target.value;
  renderBranches();
});
document.getElementById("statusFilter").addEventListener("change", e => {
  onlyOpen = e.target.value === "open";
  renderBranches();
});
document.getElementById("scrollBtn").addEventListener("click", () => {
  document.getElementById("branchSection").scrollIntoView({ behavior: "smooth", block: "start" });
});

/* 자정을 넘겨 열려 있어도 영업 상태가 갱신되도록 */
setInterval(renderBranches, 60000);

/* 먼저 기본 데이터로 즉시 그리고, Firestore 내용이 오면 다시 그립니다 */
render();
if (typeof epLoad === "function") {
  epLoad().then(res => {
    DATA = res.data;
    render();
  });
}
