/* ══════════════════════════════════════════════════════════════════════
   EIGHT PHARMACY — 관리자 페이지 로직

   · 로그인   : Firebase Authentication (이메일/비밀번호)
   · 저장 위치: Firestore  profile / config
   · 비밀번호는 어디에도 저장하지 않습니다. Firebase가 직접 처리합니다.
   ══════════════════════════════════════════════════════════════════════ */

let draft = null;      // 편집 중인 데이터
let dirty = false;     // 저장하지 않은 변경 여부
const openBranches = new Set();
const branchLang = {}; // 지점별로 지금 보고 있는 언어 탭

const $ = id => document.getElementById(id);

/* ── 공통 유틸 ───────────────────────────────────────────────────────── */
function esc(s){
  return String(s == null ? "" : s)
    .replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
}
function getPath(obj, path){
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}
function setPath(obj, path, value){
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((o, k) => (o[k] = o[k] || {}), obj);
  target[last] = value;
}
function markDirty(on = true){
  dirty = on;
  $("dirtyFlag").hidden = !on;
  if (on) setSaveMsg("");
}
function setSaveMsg(text, kind){
  const el = $("saveMsg");
  el.textContent = text;
  el.className = "save-msg" + (kind ? " is-" + kind : "");
}
function showNotice(text){
  const el = $("notice");
  if (!text) { el.hidden = true; return; }
  el.textContent = text;
  el.hidden = false;
}

/* ── 로그인 ──────────────────────────────────────────────────────────── */
function authReady(){
  return typeof firebase !== "undefined" && !!firebase.auth;
}

function initAuth(){
  if (!authReady()) {
    $("loginMsg").textContent =
      "Firebase에 연결하지 못했습니다. 인터넷 연결을 확인하거나, 잠시 후 새로고침해 주세요.";
    return;
  }
  if (!firebase.apps.length) firebase.initializeApp(EP_FIREBASE_CONFIG);

  firebase.auth().onAuthStateChanged(user => {
    if (user) {
      $("gate").hidden = true;
      $("admin").hidden = false;
      $("barUser").textContent = user.email || "";
      bootstrap();
    } else {
      $("gate").hidden = false;
      $("admin").hidden = true;
    }
  });
}

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = $("loginBtn");
  const msg = $("loginMsg");
  msg.textContent = "";
  btn.disabled = true;
  btn.textContent = "로그인 중…";
  try {
    await firebase.auth().signInWithEmailAndPassword(
      $("loginEmail").value.trim(), $("loginPw").value
    );
  } catch (err) {
    msg.textContent = loginErrorText(err);
  } finally {
    btn.disabled = false;
    btn.textContent = "로그인";
    $("loginPw").value = "";
  }
});

function loginErrorText(err){
  const code = err && err.code ? err.code : "";
  if (code === "auth/invalid-email")       return "이메일 형식이 올바르지 않습니다.";
  if (code === "auth/user-not-found" ||
      code === "auth/wrong-password" ||
      code === "auth/invalid-credential")  return "이메일 또는 비밀번호가 올바르지 않습니다.";
  if (code === "auth/too-many-requests")   return "시도가 너무 많습니다. 잠시 후 다시 해주세요.";
  if (code === "auth/network-request-failed") return "네트워크 연결을 확인해 주세요.";
  if (code === "auth/operation-not-allowed")
    return "Firebase 콘솔에서 이메일/비밀번호 로그인이 아직 켜져 있지 않습니다.";
  if (code === "auth/unauthorized-domain")
    return "이 주소는 Firebase 승인된 도메인에 등록되어 있지 않습니다.";
  return "로그인에 실패했습니다. (" + (code || err.message) + ")";
}

$("logoutBtn").addEventListener("click", () => {
  if (dirty && !confirm("저장하지 않은 변경이 있습니다. 로그아웃할까요?")) return;
  firebase.auth().signOut();
});

/* ── 데이터 불러오기 ─────────────────────────────────────────────────── */
async function bootstrap(){
  if (draft) return;
  const res = await epLoad();
  draft = res.data;
  if (res.source === "default") {
    showNotice("아직 Firestore에 저장된 내용이 없습니다. 지금 보이는 값은 기본값이며, [저장]을 누르면 등록됩니다.");
  } else {
    showNotice("");
  }
  renderAll();
  markDirty(false);
}

$("reloadBtn").addEventListener("click", async () => {
  if (dirty && !confirm("저장하지 않은 변경을 버리고 저장된 내용을 다시 불러올까요?")) return;
  draft = null;
  await bootstrap();
  setSaveMsg("저장된 내용을 다시 불러왔습니다.", "ok");
});

/* ── 저장 ────────────────────────────────────────────────────────────── */
async function save(){
  const btns = [$("saveBtn"), $("saveBtn2")];
  btns.forEach(b => { b.disabled = true; b.textContent = "저장 중…"; });
  try {
    await epSave(draft);
    markDirty(false);
    showNotice("");
    setSaveMsg("저장했습니다. 공개 페이지에 바로 반영됩니다.", "ok");
  } catch (err) {
    const code = err && err.code ? err.code : "";
    setSaveMsg(
      code === "permission-denied"
        ? "저장 권한이 없습니다. Firestore 보안 규칙에서 profile 문서 쓰기를 허용해 주세요."
        : "저장 실패: " + (err.message || code),
      "err"
    );
  } finally {
    btns.forEach(b => { b.disabled = false; b.textContent = "저장"; });
  }
}
$("saveBtn").addEventListener("click", save);
$("saveBtn2").addEventListener("click", save);

window.addEventListener("beforeunload", e => {
  if (!dirty) return;
  e.preventDefault();
  e.returnValue = "";
});

/* ── 렌더 ────────────────────────────────────────────────────────────── */
function renderAll(){
  renderSimpleFields();
  renderRegions();
  renderBranches();
}

function renderSimpleFields(){
  document.querySelectorAll("[data-path]").forEach(el => {
    if (el.closest("#regionList") || el.closest("#branchList")) return;
    el.value = getPath(draft, el.dataset.path) || "";
  });
}

function renderRegions(){
  $("regionList").innerHTML = draft.regions.map((r, i) => {
    const used = draft.branches.filter(b => b.region === r.id).length;
    return `<div class="region-row">
      <label class="field" style="flex:0 0 150px">
        <span class="field-name">코드 (영문)</span>
        <input type="text" data-region="${i}.id" value="${esc(r.id)}">
      </label>
      <div class="field" style="flex:0 0 auto">
        <span class="field-name">지점 수</span>
        <div style="padding:9px 2px;font-size:13px;color:var(--muted)">${used}</div>
      </div>
      <button class="btn btn-danger btn-sm" type="button" data-region-del="${i}"
        ${used ? 'disabled title="이 지역을 쓰는 지점이 있어 삭제할 수 없습니다"' : ""}>삭제</button>
      <div class="region-langs">
        ${LANGS.map(l => `
          <label class="field">
            <span class="field-name">${esc(l.short)} ${esc(l.label)}</span>
            <input type="text" data-region="${i}.label.${l.code}" value="${esc(r.label[l.code])}">
          </label>`).join("")}
      </div>
    </div>`;
  }).join("") || `<p class="panel-hint">등록된 지역이 없습니다.</p>`;
}

function branchTitle(b){
  const t = b.text.ko.name || b.text.en.name || "(이름 없음)";
  return t;
}

function renderBranches(){
  $("branchCountChip").textContent = draft.branches.length + "개";

  $("branchList").innerHTML = draft.branches.map((b, i) => {
    const open = openBranches.has(b.id);
    const cur = branchLang[b.id] || "ko";
    return `<div class="branch-item ${open ? "is-open" : ""}">
      <div class="branch-head" data-toggle="${esc(b.id)}">
        <span class="idx">${String(i + 1).padStart(2, "0")}</span>
        <span class="title">
          <b>${esc(branchTitle(b))}</b>
          <small>${esc(b.id)}</small>
        </span>
        <span class="tools">
          <button class="btn-icon" type="button" data-move="${i}|-1" ${i === 0 ? "disabled" : ""} title="위로">↑</button>
          <button class="btn-icon" type="button" data-move="${i}|1" ${i === draft.branches.length - 1 ? "disabled" : ""} title="아래로">↓</button>
          <button class="btn-icon" type="button" data-del="${i}" title="삭제">✕</button>
          <button class="btn-icon" type="button" data-toggle-btn="${esc(b.id)}" title="펼치기">${open ? "▴" : "▾"}</button>
        </span>
      </div>

      ${open ? `<div class="branch-body">

        <div class="sub-block">
          <div class="sub-head">기본 정보</div>
          <label class="field field-hero">
            <span class="field-name">지점명 (한국어) — 손님 화면에 크게 표시됩니다</span>
            <input type="text" data-branch="${i}.text.ko.name" value="${esc(b.text.ko.name)}"
                   placeholder="예: 강남 본점">
          </label>
          <div class="grid-4">
            <label class="field">
              <span class="field-name">지점 코드 (영문)</span>
              <input type="text" data-branch="${i}.id" value="${esc(b.id)}">
            </label>
            <label class="field">
              <span class="field-name">지역</span>
              <select data-branch="${i}.region">
                ${draft.regions.map(r =>
                  `<option value="${esc(r.id)}" ${r.id === b.region ? "selected" : ""}>${esc(r.label.ko || r.id)}</option>`
                ).join("")}
              </select>
            </label>
            <label class="field">
              <span class="field-name">도시 태그 (카드 상단)</span>
              <input type="text" data-branch="${i}.cityTag" value="${esc(b.cityTag)}" placeholder="SEOUL · GANGNAM">
            </label>
            <label class="field">
              <span class="field-name">전화번호</span>
              <input type="tel" data-branch="${i}.phone" value="${esc(b.phone)}" placeholder="02-1234-5678">
            </label>
          </div>
          <label class="field">
            <span class="field-name">지점 사진 URL (비우면 그린 배너로 표시)</span>
            <input type="text" data-branch="${i}.photo" value="${esc(b.photo)}" placeholder="../images/branch-gangnam.jpg">
          </label>
        </div>

        <div class="sub-block">
          <div class="sub-head">영업시간</div>
          <div class="hours-grid">
            ${["weekday|평일", "sat|토요일", "sun|일요일"].map(pair => {
              const [key, label] = pair.split("|");
              const v = b.hours[key] || "";
              const off = !v.includes("-");
              const [o, c] = off ? ["", ""] : v.split("-");
              return `
                <span class="day">${label}</span>
                <input type="time" data-hours="${i}|${key}|open"  value="${esc(o)}" ${off ? "disabled" : ""}>
                <span class="tilde">–</span>
                <input type="time" data-hours="${i}|${key}|close" value="${esc(c)}" ${off ? "disabled" : ""}>
                <label class="check"><input type="checkbox" data-hoursoff="${i}|${key}" ${off ? "checked" : ""}>휴무</label>`;
            }).join("")}
          </div>
          <label class="check">
            <input type="checkbox" data-branch-check="${i}.nightOpen" ${b.nightOpen ? "checked" : ""}>
            심야 영업 표시
          </label>
        </div>

        <div class="sub-block">
          <div class="sub-head">지도 링크</div>
          <div class="grid-4">
            <label class="field"><span class="field-name">네이버지도</span>
              <input type="url" data-branch="${i}.maps.naver" value="${esc(b.maps.naver)}" placeholder="https://naver.me/..."></label>
            <label class="field"><span class="field-name">카카오맵</span>
              <input type="url" data-branch="${i}.maps.kakao" value="${esc(b.maps.kakao)}" placeholder="https://kko.to/..."></label>
            <label class="field"><span class="field-name">구글맵</span>
              <input type="url" data-branch="${i}.maps.google" value="${esc(b.maps.google)}" placeholder="https://maps.app.goo.gl/..."></label>
            <label class="field"><span class="field-name">고덕지도 (高德 · 중국)</span>
              <input type="url" data-branch="${i}.maps.amap" value="${esc(b.maps.amap)}" placeholder="https://surl.amap.com/..."></label>
          </div>
          <p class="panel-hint">비워두면 해당 버튼은 카드에 나타나지 않습니다.</p>
        </div>

        <div class="sub-block">
          <div class="sub-head">지점 SNS (지점 전용 계정이 있을 때만)</div>
          <div class="grid-2">
            <label class="field"><span class="field-name">인스타그램</span>
              <input type="url" data-branch="${i}.social.instagram" value="${esc(b.social.instagram)}"></label>
            <label class="field"><span class="field-name">틱톡</span>
              <input type="url" data-branch="${i}.social.tiktok" value="${esc(b.social.tiktok)}"></label>
          </div>
        </div>

        <div class="sub-block">
          <div class="sub-head">언어별 내용</div>
          <div class="lang-tabs">
            ${LANGS.map(l => {
              const filled = !!(b.text[l.code] && b.text[l.code].name);
              return `<button class="lang-tab ${l.code === cur ? "is-active" : ""} ${filled ? "has-content" : ""}"
                        type="button" data-langtab="${esc(b.id)}|${l.code}">
                        <span class="dot"></span>${esc(l.short)}
                      </button>`;
            }).join("")}
          </div>
          ${LANGS.map(l => {
            const tx = b.text[l.code];
            return `<div class="lang-pane" data-pane="${esc(b.id)}|${l.code}" ${l.code === cur ? "" : "hidden"}>
              <div class="grid-2">
                <label class="field"><span class="field-name">지점명 (${esc(l.label)})</span>
                  <input type="text" data-branch="${i}.text.${l.code}.name" value="${esc(tx.name)}"></label>
                <label class="field"><span class="field-name">한 줄 태그</span>
                  <input type="text" data-branch="${i}.text.${l.code}.sub" value="${esc(tx.sub)}"></label>
              </div>
              <label class="field"><span class="field-name">주소</span>
                <input type="text" data-branch="${i}.text.${l.code}.address" value="${esc(tx.address)}"></label>
              <label class="field"><span class="field-name">설명</span>
                <textarea data-branch="${i}.text.${l.code}.desc">${esc(tx.desc)}</textarea></label>
            </div>`;
          }).join("")}
        </div>

      </div>` : ""}
    </div>`;
  }).join("") || `<p class="panel-hint">등록된 지점이 없습니다. [+ 지점 추가]를 눌러 시작하세요.</p>`;
}

/* ── 입력 반영 ───────────────────────────────────────────────────────── */
$("form").addEventListener("input", e => {
  const el = e.target;

  if (el.dataset.path) {
    setPath(draft, el.dataset.path, el.value);
    return markDirty();
  }
  if (el.dataset.branch) {
    setPath(draft.branches, el.dataset.branch, el.value);
    // 같은 값을 가리키는 다른 입력칸(기본 정보 ↔ 언어별 내용)도 함께 갱신
    document.querySelectorAll(`[data-branch="${el.dataset.branch}"]`).forEach(twin => {
      if (twin !== el && twin.value !== el.value) twin.value = el.value;
    });
    if (/\.text\.ko\.name$/.test(el.dataset.branch)) {
      const item = el.closest(".branch-item");
      if (item) item.querySelector(".branch-head .title b").textContent = el.value || "(이름 없음)";
    }
    if (/\.text\.[a-z]+\.name$/.test(el.dataset.branch)) {
      const code = el.dataset.branch.split(".")[2];
      const item = el.closest(".branch-item");
      const tab = item && item.querySelector(`[data-langtab$="|${code}"]`);
      if (tab) tab.classList.toggle("has-content", !!el.value);
    }
    return markDirty();
  }
  if (el.dataset.region) {
    setPath(draft.regions, el.dataset.region, el.value);
    return markDirty();
  }
  if (el.dataset.hours) {
    const [i, key] = el.dataset.hours.split("|");
    const row = el.closest(".hours-grid");
    const o = row.querySelector(`[data-hours="${i}|${key}|open"]`).value;
    const c = row.querySelector(`[data-hours="${i}|${key}|close"]`).value;
    draft.branches[+i].hours[key] = (o && c) ? `${o}-${c}` : "";
    return markDirty();
  }
});

$("form").addEventListener("change", e => {
  const el = e.target;
  if (el.dataset.branchCheck) {
    setPath(draft.branches, el.dataset.branchCheck, el.checked);
    return markDirty();
  }
  if (el.dataset.hoursoff) {
    const [i, key] = el.dataset.hoursoff.split("|");
    const row = el.closest(".hours-grid");
    const oEl = row.querySelector(`[data-hours="${i}|${key}|open"]`);
    const cEl = row.querySelector(`[data-hours="${i}|${key}|close"]`);
    if (el.checked) {
      draft.branches[+i].hours[key] = "";
      oEl.disabled = cEl.disabled = true;
    } else {
      oEl.disabled = cEl.disabled = false;
      if (!oEl.value) oEl.value = "09:00";
      if (!cEl.value) cEl.value = "22:00";
      draft.branches[+i].hours[key] = `${oEl.value}-${cEl.value}`;
    }
    return markDirty();
  }
  if (el.dataset.branch && el.tagName === "SELECT") {
    setPath(draft.branches, el.dataset.branch, el.value);
    return markDirty();
  }
});

/* ── 클릭 동작 ───────────────────────────────────────────────────────── */
$("form").addEventListener("click", e => {
  const t = e.target;

  const tab = t.closest("[data-langtab]");
  if (tab) {
    const [bid, code] = tab.dataset.langtab.split("|");
    branchLang[bid] = code;
    const item = tab.closest(".branch-item");
    item.querySelectorAll("[data-langtab]").forEach(x =>
      x.classList.toggle("is-active", x.dataset.langtab === tab.dataset.langtab));
    item.querySelectorAll("[data-pane]").forEach(p =>
      p.hidden = p.dataset.pane !== `${bid}|${code}`);
    return;
  }

  const toggle = t.closest("[data-toggle-btn]") || t.closest("[data-toggle]");
  if (toggle && !t.closest(".tools button:not([data-toggle-btn])")) {
    const id = toggle.dataset.toggleBtn || toggle.dataset.toggle;
    if (openBranches.has(id)) openBranches.delete(id); else openBranches.add(id);
    return renderBranches();
  }

  const move = t.closest("[data-move]");
  if (move) {
    const [i, dir] = move.dataset.move.split("|").map(Number);
    const j = i + dir;
    if (j < 0 || j >= draft.branches.length) return;
    [draft.branches[i], draft.branches[j]] = [draft.branches[j], draft.branches[i]];
    markDirty();
    return renderBranches();
  }

  const del = t.closest("[data-del]");
  if (del) {
    const i = +del.dataset.del;
    const name = branchTitle(draft.branches[i]);
    if (!confirm(`'${name}' 지점을 삭제할까요? 저장을 눌러야 실제로 반영됩니다.`)) return;
    draft.branches.splice(i, 1);
    markDirty();
    return renderBranches();
  }

  const rdel = t.closest("[data-region-del]");
  if (rdel) {
    draft.regions.splice(+rdel.dataset.regionDel, 1);
    markDirty();
    renderRegions();
    return renderBranches();
  }
});

$("addBranchBtn").addEventListener("click", () => {
  const b = blankBranch();
  if (draft.regions[0]) b.region = draft.regions[0].id;
  draft.branches.push(b);
  openBranches.add(b.id);
  markDirty();
  renderBranches();
  const items = document.querySelectorAll(".branch-item");
  const last = items[items.length - 1];
  if (last) last.scrollIntoView({ behavior: "smooth", block: "center" });
});

$("addRegionBtn").addEventListener("click", () => {
  draft.regions.push(blankRegion());
  markDirty();
  renderRegions();
  renderBranches();
});

/* ── 백업 ────────────────────────────────────────────────────────────── */
$("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  const d = new Date();
  const stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
  a.href = URL.createObjectURL(blob);
  a.download = `eight-profile-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  setSaveMsg("JSON 파일을 내려받았습니다.", "ok");
});

$("importInput").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      draft = epNormalize(JSON.parse(reader.result));
      openBranches.clear();
      renderAll();
      markDirty();
      setSaveMsg("불러왔습니다. 확인 후 [저장]을 눌러주세요.", "ok");
    } catch (err) {
      setSaveMsg("JSON 파일을 읽을 수 없습니다.", "err");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});

/* ── 시작 ────────────────────────────────────────────────────────────── */
initAuth();
