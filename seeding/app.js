// ===========================================================================
// 시딩 보드 앱 로직
// - Firebase Auth(이메일/비밀번호)로 로그인한 사용자만 접근
// - Firestore "seeding" 컬렉션과 실시간 동기화
// - visitors 컬렉션은 건드리지 않음 (별도 공개 페이지에서 사용)
// ===========================================================================
(function () {
  "use strict";

  // ----- constants -----
  var STATUS_FLOW = ["대기", "보냄", "도착", "수령"];
  var STATUS_COLOR = { "대기": "#8b93a3", "보냄": "#4c8dff", "도착": "#fbbf24", "수령": "#34d399" };
  var PLATFORMS = ["Instagram", "YouTube", "TikTok", "Threads", "Blog", "기타"];

  // ----- state -----
  var records = [];           // Firestore 문서들 (id 포함)
  var unsub = null;           // onSnapshot 해제 함수
  var view = "board";
  var query = "", queryList = "";
  var statusFilter = "전체", platformFilter = "전체", platformFilterList = "전체", statusFilterList = "전체";
  var dateFromList = "", dateToList = "";
  var keywordFilter = null;
  var sortBy = "order";
  var listSort = { col: "order", dir: 1 };

  // ----- helpers -----
  function num(v) { var n = parseFloat(String(v == null ? "" : v).replace(/,/g, "")); return isNaN(n) ? 0 : n; }
  function fmt(n) { return Number(n).toLocaleString("ko-KR"); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  function roiOf(r) { return num(r.cost) ? ((num(r.revenue) - num(r.cost)) / num(r.cost)) * 100 : null; }
  function todayStr() { return new Date().toISOString().slice(0, 10); }
  function byId(id) { return records.find(function (r) { return r.id === id; }); }
  function $(id) { return document.getElementById(id); }

  function blank() {
    return {
      name: "", handle: "", platform: "Instagram", sns: "", followers: "",
      product: "", keywords: [], status: "대기", uploaded: false, contentUrl: "",
      recruitDate: todayStr(), sentDate: "", uploadDate: "",
      views: "", likes: "", conversions: "", cost: "", revenue: "", note: "",
      order: records.length + 1
    };
  }

  function setSaveTag(text) { var el = $("saveTag"); if (el) el.textContent = text; }

  // =========================================================================
  // AUTH
  // =========================================================================
  function initAuth() {
    auth.onAuthStateChanged(function (user) {
      if (user) {
        $("authGate").classList.add("hidden");
        $("app").classList.remove("hidden");
        $("userTag").textContent = user.email;
        startSync();
      } else {
        $("app").classList.add("hidden");
        $("authGate").classList.remove("hidden");
        stopSync();
      }
    });

    $("loginBtn").onclick = doLogin;
    $("authPassword").addEventListener("keydown", function (e) { if (e.key === "Enter") doLogin(); });
    $("authEmail").addEventListener("keydown", function (e) { if (e.key === "Enter") $("authPassword").focus(); });
    $("logoutBtn").onclick = function () { auth.signOut(); };
  }

  function doLogin() {
    var email = $("authEmail").value.trim();
    var pw = $("authPassword").value;
    var errEl = $("authError");
    errEl.textContent = "";
    if (!email || !pw) { errEl.textContent = "이메일과 비밀번호를 입력하세요."; return; }
    $("loginBtn").textContent = "로그인 중…";
    auth.signInWithEmailAndPassword(email, pw)
      .then(function () { $("loginBtn").textContent = "로그인"; })
      .catch(function (e) {
        $("loginBtn").textContent = "로그인";
        errEl.textContent = authErrorMsg(e.code);
      });
  }

  function authErrorMsg(code) {
    switch (code) {
      case "auth/invalid-email": return "이메일 형식이 올바르지 않습니다.";
      case "auth/user-disabled": return "비활성화된 계정입니다.";
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential": return "이메일 또는 비밀번호가 일치하지 않습니다.";
      case "auth/too-many-requests": return "시도가 너무 많습니다. 잠시 후 다시 시도하세요.";
      default: return "로그인에 실패했습니다. (" + code + ")";
    }
  }

  // =========================================================================
  // FIRESTORE SYNC (실시간)
  // =========================================================================
  function startSync() {
    if (unsub) return;
    setSaveTag("불러오는 중…");
    unsub = db.collection(SEEDING_COLLECTION)
      .onSnapshot(function (snap) {
        records = snap.docs.map(function (d) {
          var data = d.data();
          data.id = d.id;
          if (!Array.isArray(data.keywords)) data.keywords = [];
          return data;
        });
        setSaveTag(records.length + "건 · 동기화됨");
        populatePlatformSelects();
        renderAll();
      }, function (err) {
        setSaveTag("동기화 오류 ⚠");
        console.error("Firestore onSnapshot error:", err);
      });
  }
  function stopSync() { if (unsub) { unsub(); unsub = null; } records = []; }

  function createRecord(data) {
    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    setSaveTag("저장 중…");
    return db.collection(SEEDING_COLLECTION).add(data)
      .catch(function (e) { setSaveTag("저장 실패 ⚠"); console.error(e); alert("저장 실패: " + e.message); });
  }
  function updateRecord(id, data) {
    var payload = Object.assign({}, data);
    delete payload.id;
    setSaveTag("저장 중…");
    return db.collection(SEEDING_COLLECTION).doc(id).update(payload)
      .catch(function (e) { setSaveTag("저장 실패 ⚠"); console.error(e); alert("저장 실패: " + e.message); });
  }
  function deleteRecord(id) {
    return db.collection(SEEDING_COLLECTION).doc(id).delete()
      .catch(function (e) { console.error(e); alert("삭제 실패: " + e.message); });
  }

  // 카드/리스트에서 빠른 액션
  function cycleStatus(rec) {
    var i = STATUS_FLOW.indexOf(rec.status);
    var next = STATUS_FLOW[(i + 1) % STATUS_FLOW.length];
    var patch = { status: next };
    if (next === "보냄" && !rec.sentDate) patch.sentDate = todayStr();
    updateRecord(rec.id, patch);
  }
  function toggleUpload(rec) {
    var patch = { uploaded: !rec.uploaded };
    if (patch.uploaded && !rec.uploadDate) patch.uploadDate = todayStr();
    updateRecord(rec.id, patch);
  }

  // =========================================================================
  // DERIVED
  // =========================================================================
  function allKeywords() {
    var m = {};
    records.forEach(function (r) { (r.keywords || []).forEach(function (k) { m[k] = (m[k] || 0) + 1; }); });
    return Object.keys(m).map(function (k) { return [k, m[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
  }
  function stats() {
    var total = records.length, byStatus = {};
    STATUS_FLOW.forEach(function (s) { byStatus[s] = records.filter(function (r) { return r.status === s; }).length; });
    var uploaded = records.filter(function (r) { return r.uploaded; }).length;
    var sentOrMore = records.filter(function (r) { return r.status !== "대기"; }).length;
    var views = records.reduce(function (s, r) { return s + num(r.views); }, 0);
    var conv = records.reduce(function (s, r) { return s + num(r.conversions); }, 0);
    var cost = records.reduce(function (s, r) { return s + num(r.cost); }, 0);
    var rev = records.reduce(function (s, r) { return s + num(r.revenue); }, 0);
    return {
      total: total, byStatus: byStatus, uploaded: uploaded, sentOrMore: sentOrMore,
      views: views, conv: conv,
      roi: cost ? ((rev - cost) / cost) * 100 : 0,
      uploadRate: sentOrMore ? (uploaded / sentOrMore) * 100 : 0
    };
  }
  function cmpBy(key, a, b) {
    if (key === "order") return num(a.order) - num(b.order);
    if (key === "createdAt") return tsMs(b.createdAt) - tsMs(a.createdAt);
    if (key === "name") return (a.name || "").localeCompare(b.name || "");
    if (key === "followers") return num(b.followers) - num(a.followers);
    if (key === "views") return num(b.views) - num(a.views);
    if (key === "roi") return (roiOf(b) == null ? -Infinity : roiOf(b)) - (roiOf(a) == null ? -Infinity : roiOf(a));
    if (key === "recruitDate") return (b.recruitDate || "").localeCompare(a.recruitDate || "");
    if (key === "uploadDate") return (b.uploadDate || "").localeCompare(a.uploadDate || "");
    return 0;
  }
  function tsMs(ts) { return ts && ts.toMillis ? ts.toMillis() : (typeof ts === "number" ? ts : 0); }

  function filteredBoard() {
    var out = records.filter(function (r) {
      if (statusFilter !== "전체" && r.status !== statusFilter) return false;
      if (platformFilter !== "전체" && r.platform !== platformFilter) return false;
      if (keywordFilter && (r.keywords || []).indexOf(keywordFilter) < 0) return false;
      if (query) {
        var hay = [r.name, r.handle, r.product, (r.keywords || []).join(" ")].join(" ").toLowerCase();
        if (hay.indexOf(query.toLowerCase()) < 0) return false;
      }
      return true;
    });
    out.sort(function (a, b) { return cmpBy(sortBy, a, b); });
    return out;
  }
  function filteredList() {
    var out = records.filter(function (r) {
      if (statusFilterList !== "전체" && r.status !== statusFilterList) return false;
      if (platformFilterList !== "전체" && r.platform !== platformFilterList) return false;
      // 모집일 기간 필터 (recruitDate 기준, YYYY-MM-DD 문자열 비교)
      if (dateFromList && (!r.recruitDate || r.recruitDate < dateFromList)) return false;
      if (dateToList && (!r.recruitDate || r.recruitDate > dateToList)) return false;
      if (queryList) {
        var hay = [r.name, r.handle, r.product, (r.keywords || []).join(" ")].join(" ").toLowerCase();
        if (hay.indexOf(queryList.toLowerCase()) < 0) return false;
      }
      return true;
    });
    var c = listSort.col, d = listSort.dir;
    out.sort(function (a, b) {
      var v;
      if (c === "name") v = (a.name || "").localeCompare(b.name || "");
      else if (c === "platform") v = (a.platform || "").localeCompare(b.platform || "");
      else if (c === "status") v = STATUS_FLOW.indexOf(a.status) - STATUS_FLOW.indexOf(b.status);
      else if (c === "followers") v = num(a.followers) - num(b.followers);
      else if (c === "views") v = num(a.views) - num(b.views);
      else if (c === "roi") v = (roiOf(a) == null ? -Infinity : roiOf(a)) - (roiOf(b) == null ? -Infinity : roiOf(b));
      else if (c === "recruitDate") v = (a.recruitDate || "").localeCompare(b.recruitDate || "");
      else if (c === "sentDate") v = (a.sentDate || "").localeCompare(b.sentDate || "");
      else if (c === "uploadDate") v = (a.uploadDate || "").localeCompare(b.uploadDate || "");
      else v = num(a.order) - num(b.order);
      return v * d;
    });
    return out;
  }

  // =========================================================================
  // RENDER
  // =========================================================================
  function renderStats() {
    var s = stats();
    var cells = [
      ["전체", fmt(s.total), "", "var(--text)"],
      ["발송됨", fmt(s.sentOrMore), "/ " + s.total, "var(--blue)"],
      ["수령", fmt(s.byStatus["수령"]), "", "var(--green)"],
      ["업로드율", s.uploadRate.toFixed(0) + "%", s.uploaded + "건", "var(--violet)"],
      ["총 조회수", fmt(s.views), "", "var(--amber)"],
      ["전환", fmt(s.conv), "", "var(--text)"],
      ["ROI", s.roi.toFixed(0) + "%", "", s.roi >= 0 ? "var(--green)" : "var(--red)"]
    ];
    $("statStrip").innerHTML = cells.map(function (c) {
      return '<div class="stat"><div class="stat-label">' + c[0] + '</div><div><span class="stat-value" style="color:' + c[3] + '">' + c[1] + '</span>' + (c[2] ? '<span class="stat-sub">' + c[2] + '</span>' : '') + '</div></div>';
    }).join("");
  }

  function renderFunnel() {
    var s = stats();
    $("funnel").innerHTML = STATUS_FLOW.map(function (st) {
      var count = s.byStatus[st], pct = s.total ? (count / s.total) * 100 : 0;
      var active = statusFilter === st ? " active" : "";
      var bc = statusFilter === st ? STATUS_COLOR[st] : "var(--border)";
      return '<button class="funnel-cell' + active + '" data-status="' + st + '" style="border-color:' + bc + '">' +
        '<span class="funnel-dot" style="background:' + STATUS_COLOR[st] + '"></span>' +
        '<span class="funnel-label">' + st + '</span>' +
        '<span class="funnel-count">' + count + '</span>' +
        '<span class="funnel-bar"><span class="funnel-fill" style="width:' + pct + '%;background:' + STATUS_COLOR[st] + '"></span></span>' +
        '</button>';
    }).join("");
    Array.prototype.forEach.call($("funnel").querySelectorAll(".funnel-cell"), function (el) {
      el.onclick = function () { var st = el.getAttribute("data-status"); statusFilter = statusFilter === st ? "전체" : st; renderBoard(); };
    });
  }

  function renderKeywords() {
    var kws = allKeywords(), el = $("keywordRow");
    if (kws.length === 0) { el.innerHTML = ""; return; }
    var html = '<span class="keyword-row-label">키워드</span>';
    if (keywordFilter) html += '<button class="kw-clear" data-clear="1">✕ ' + esc(keywordFilter) + '</button>';
    html += kws.slice(0, 18).map(function (kc) {
      return '<button class="kw-chip' + (keywordFilter === kc[0] ? " active" : "") + '" data-kw="' + esc(kc[0]) + '">' + esc(kc[0]) + ' <span class="kw-count">' + kc[1] + '</span></button>';
    }).join("");
    el.innerHTML = html;
    Array.prototype.forEach.call(el.querySelectorAll("[data-kw]"), function (b) {
      b.onclick = function () { var k = b.getAttribute("data-kw"); keywordFilter = keywordFilter === k ? null : k; renderBoard(); };
    });
    var clr = el.querySelector("[data-clear]");
    if (clr) clr.onclick = function () { keywordFilter = null; renderBoard(); };
  }

  function metric(label, value, color) {
    return '<div class="metric"><div class="metric-label">' + label + '</div><div class="metric-value" style="color:' + (color || "var(--text)") + '">' + value + '</div></div>';
  }

  function renderCards() {
    var list = filteredBoard(), area = $("cardArea");
    if (list.length === 0) {
      area.innerHTML = '<div class="empty">' + (records.length === 0
        ? "아직 등록된 인플루언서가 없습니다. 오른쪽 위 ‘+ 인플루언서 추가’로 시작하세요."
        : "조건에 맞는 결과가 없습니다. 필터를 바꿔보세요.") + '</div>';
      return;
    }
    area.innerHTML = '<div class="card-grid">' + list.map(function (r) {
      var roi = roiOf(r);
      var roiTxt = roi == null ? "—" : roi.toFixed(0) + "%";
      var roiColor = roi == null ? "var(--text)" : (roi >= 0 ? "var(--green)" : "var(--red)");
      var dates = [];
      if (r.recruitDate) dates.push('모집 <b>' + esc(r.recruitDate) + '</b>');
      if (r.sentDate) dates.push('발송 <b>' + esc(r.sentDate) + '</b>');
      if (r.uploadDate) dates.push('업로드 <b>' + esc(r.uploadDate) + '</b>');
      var snsLink = r.sns || r.contentUrl;
      return '<div class="card">' +
        '<div class="card-top">' +
          '<div class="card-id" data-edit="' + r.id + '">' +
            '<div class="card-name">' + (esc(r.name) || "(이름 없음)") + '</div>' +
            '<div class="card-handle">' + (r.handle ? "@" + esc(r.handle.replace(/^@/, "")) : "—") + ' · ' + esc(r.platform) + (r.followers ? " · " + fmt(num(r.followers)) + " 팔로워" : "") + '</div>' +
          '</div>' +
          '<button class="status-pill" data-cycle="' + r.id + '" style="background:' + STATUS_COLOR[r.status] + '">' + esc(r.status) + ' ›</button>' +
        '</div>' +
        (r.product ? '<div class="card-product">📦 ' + esc(r.product) + '</div>' : '') +
        (dates.length ? '<div class="card-dates">' + dates.join("") + '</div>' : '') +
        ((r.keywords || []).length ? '<div class="card-keywords">' + r.keywords.map(function (k) { return '<button class="card-kw" data-kw="' + esc(k) + '">#' + esc(k) + '</button>'; }).join("") + '</div>' : '') +
        '<div class="card-metrics">' +
          metric("조회", r.views ? fmt(num(r.views)) : "—") +
          metric("좋아요", r.likes ? fmt(num(r.likes)) : "—") +
          metric("전환", r.conversions ? fmt(num(r.conversions)) : "—") +
          metric("ROI", roiTxt, roiColor) +
        '</div>' +
        '<div class="card-actions">' +
          '<button class="upload-toggle' + (r.uploaded ? " on" : "") + '" data-upload="' + r.id + '">' + (r.uploaded ? "✓ 업로드됨" : "업로드 대기") + '</button>' +
          (snsLink ? '<a class="link-btn" href="' + esc(snsLink) + '" target="_blank" rel="noreferrer">SNS ↗</a>' : '') +
          '<button class="edit-btn" data-edit="' + r.id + '">편집</button>' +
        '</div>' +
      '</div>';
    }).join("") + '</div>';
    wireCardEvents(area);
  }

  function wireCardEvents(area) {
    Array.prototype.forEach.call(area.querySelectorAll("[data-cycle]"), function (b) {
      b.onclick = function (e) { e.stopPropagation(); var r = byId(b.getAttribute("data-cycle")); if (r) cycleStatus(r); };
    });
    Array.prototype.forEach.call(area.querySelectorAll("[data-upload]"), function (b) {
      b.onclick = function (e) { e.stopPropagation(); var r = byId(b.getAttribute("data-upload")); if (r) toggleUpload(r); };
    });
    Array.prototype.forEach.call(area.querySelectorAll("[data-edit]"), function (b) {
      b.onclick = function () { var r = byId(b.getAttribute("data-edit")); if (r) openForm(r); };
    });
    Array.prototype.forEach.call(area.querySelectorAll(".card-kw[data-kw]"), function (b) {
      b.onclick = function (e) { e.stopPropagation(); keywordFilter = b.getAttribute("data-kw"); renderBoard(); };
    });
  }

  function renderTable() {
    var list = filteredList(), area = $("tableArea");
    if (records.length === 0) { area.innerHTML = '<div class="empty">아직 등록된 인플루언서가 없습니다.</div>'; return; }
    var cols = [
      ["name", "이름 / 핸들"], ["platform", "플랫폼"], ["followers", "팔로워"],
      ["status", "상태"], ["keywords", "키워드"], ["recruitDate", "모집일"], ["sentDate", "발송일"],
      ["uploadDate", "업로드일"], ["views", "조회수"], ["roi", "ROI"]
    ];
    var thead = "<tr>" + cols.map(function (c) {
      // 키워드 열은 정렬 대상이 아님
      if (c[0] === "keywords") return '<th>' + c[1] + '</th>';
      var arrow = listSort.col === c[0] ? (listSort.dir === 1 ? " ▲" : " ▼") : "";
      return '<th data-col="' + c[0] + '">' + c[1] + arrow + '</th>';
    }).join("") + "</tr>";
    var tbody = list.map(function (r) {
      var roi = roiOf(r);
      var roiTxt = roi == null ? "—" : roi.toFixed(0) + "%";
      var roiColor = roi == null ? "var(--muted)" : (roi >= 0 ? "var(--green)" : "var(--red)");
      return '<tr data-edit="' + r.id + '">' +
        '<td><div class="td-name">' + (esc(r.name) || "(이름 없음)") + '</div><div class="td-sub">' + (r.handle ? "@" + esc(r.handle.replace(/^@/, "")) : "") + (r.product ? " · " + esc(r.product) : "") + '</div></td>' +
        '<td>' + esc(r.platform) + '</td>' +
        '<td>' + (r.followers ? fmt(num(r.followers)) : "—") + '</td>' +
        '<td><span class="pill-sm" style="background:' + STATUS_COLOR[r.status] + '">' + esc(r.status) + '</span>' + (r.uploaded ? ' <span class="check">●</span>' : '') + '</td>' +
        '<td>' + ((r.keywords || []).length ? '<div class="td-kw">' + r.keywords.map(function (k) { return '<span class="td-kw-chip">#' + esc(k) + '</span>'; }).join("") + '</div>' : '<span class="nocheck">—</span>') + '</td>' +
        '<td>' + (r.recruitDate || "—") + '</td>' +
        '<td>' + (r.sentDate || "—") + '</td>' +
        '<td>' + (r.uploadDate ? r.uploadDate : '<span class="nocheck">미업로드</span>') + '</td>' +
        '<td>' + (r.views ? fmt(num(r.views)) : "—") + '</td>' +
        '<td style="color:' + roiColor + ';font-weight:700">' + roiTxt + '</td>' +
      '</tr>';
    }).join("");
    area.innerHTML = '<table><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table>';
    Array.prototype.forEach.call(area.querySelectorAll("th[data-col]"), function (th) {
      th.onclick = function () {
        var c = th.getAttribute("data-col");
        if (listSort.col === c) listSort.dir *= -1; else { listSort.col = c; listSort.dir = 1; }
        renderTable();
      };
    });
    Array.prototype.forEach.call(area.querySelectorAll("tr[data-edit]"), function (tr) {
      tr.onclick = function () { var r = byId(tr.getAttribute("data-edit")); if (r) openForm(r); };
    });
  }

  function renderBoard() { renderFunnel(); renderKeywords(); renderCards(); }
  function renderAll() {
    renderStats();
    if (view === "board") renderBoard(); else renderTable();
  }

  function populatePlatformSelects() {
    var found = {};
    records.forEach(function (r) { if (r.platform) found[r.platform] = true; });
    var opts = PLATFORMS.slice();
    Object.keys(found).forEach(function (p) { if (opts.indexOf(p) < 0) opts.push(p); });
    [["platformFilter", platformFilter], ["platformFilterList", platformFilterList]].forEach(function (pair) {
      var sel = $(pair[0]); if (!sel) return;
      sel.innerHTML = '<option value="전체">모든 플랫폼</option>' + opts.map(function (p) {
        return '<option value="' + esc(p) + '"' + (p === pair[1] ? " selected" : "") + '>' + esc(p) + '</option>';
      }).join("");
    });
  }

  // =========================================================================
  // MODAL FORM
  // =========================================================================
  function openForm(record) {
    var r = JSON.parse(JSON.stringify(record));
    if (!Array.isArray(r.keywords)) r.keywords = [];
    var isNew = !record.id;
    var root = $("modalRoot");

    function dateField(label, key) {
      return '<label class="field"><span class="field-label">' + label + '</span><input class="input" type="date" data-k="' + key + '" value="' + esc(r[key] || "") + '"></label>';
    }
    function textField(label, key, ph, numeric) {
      return '<label class="field"><span class="field-label">' + label + '</span><input class="input" data-k="' + key + '"' + (numeric ? ' inputmode="numeric"' : '') + ' value="' + esc(r[key] || "") + '" placeholder="' + (ph || "") + '"></label>';
    }

    root.innerHTML =
      '<div class="modal-overlay" id="overlay"><div class="modal">' +
        '<div class="modal-header"><div class="modal-title">' + (isNew ? "인플루언서 추가" : "정보 편집") + '</div><button class="close-btn" id="closeBtn">✕</button></div>' +
        '<div class="form-scroll">' +
          '<label class="field"><span class="field-label">이름 / 닉네임</span><input class="input" data-k="name" value="' + esc(r.name) + '" autofocus></label>' +
          '<div class="row">' + textField("핸들 (@)", "handle", "아이디") +
            '<label class="field"><span class="field-label">플랫폼</span><select class="input" data-k="platform">' + PLATFORMS.map(function (p) { return '<option' + (p === r.platform ? " selected" : "") + '>' + p + '</option>'; }).join("") + '</select></label>' +
          '</div>' +
          textField("SNS 링크", "sns", "https://www.instagram.com/...") +
          '<div class="row">' + textField("팔로워", "followers", "예: 12000", true) +
            '<label class="field"><span class="field-label">발송 상태</span><select class="input" data-k="status">' + STATUS_FLOW.map(function (s) { return '<option' + (s === r.status ? " selected" : "") + '>' + s + '</option>'; }).join("") + '</select></label>' +
          '</div>' +
          textField("보낸 제품", "product", "예: 마스크팩 6장 + 시카멜라 크림") +
          '<label class="field"><span class="field-label">소구 키워드 (Enter로 추가)</span>' +
            '<div class="kw-input-row"><input class="input" id="kwInput" placeholder="예: 보습, 여름, 가성비"><button class="add-kw-btn" id="addKw">추가</button></div>' +
            '<div class="form-kw-list" id="kwList"></div>' +
          '</label>' +
          '<div class="divider">날짜</div>' +
          '<div class="row">' + dateField("모집일", "recruitDate") + dateField("발송일", "sentDate") + '</div>' +
          dateField("업로드일", "uploadDate") +
          '<div class="divider">콘텐츠 & 성과</div>' +
          '<div class="row">' +
            '<label class="field"><span class="field-label">업로드 여부</span><button class="input upload-big' + (r.uploaded ? " on" : "") + '" id="uploadToggle">' + (r.uploaded ? "✓ 업로드됨" : "미업로드") + '</button></label>' +
            textField("콘텐츠 링크", "contentUrl", "https://") +
          '</div>' +
          '<div class="row">' + textField("조회수", "views", "", true) + textField("좋아요", "likes", "", true) + '</div>' +
          '<div class="row">' + textField("전환 수", "conversions", "", true) + textField("비용 (₩)", "cost", "제품원가+배송", true) + '</div>' +
          '<div class="row">' + textField("발생 매출 (₩)", "revenue", "", true) + textField("정렬순서 (order)", "order", "", true) + '</div>' +
          '<label class="field"><span class="field-label">메모</span><textarea class="input" data-k="note">' + esc(r.note) + '</textarea></label>' +
        '</div>' +
        '<div class="modal-footer">' +
          (isNew ? '' : '<button class="delete-btn" id="deleteBtn">삭제</button>') +
          '<div style="flex:1"></div>' +
          '<button class="btn-ghost" id="cancelBtn">취소</button>' +
          '<button class="btn-primary" id="saveBtn">저장</button>' +
        '</div>' +
      '</div></div>';

    function renderKwList() {
      $("kwList").innerHTML = (r.keywords || []).map(function (k) {
        return '<span class="form-kw">#' + esc(k) + '<button class="form-kw-x" data-rm="' + esc(k) + '">×</button></span>';
      }).join("");
      Array.prototype.forEach.call($("kwList").querySelectorAll("[data-rm]"), function (b) {
        b.onclick = function () { var k = b.getAttribute("data-rm"); r.keywords = r.keywords.filter(function (x) { return x !== k; }); renderKwList(); };
      });
    }
    renderKwList();

    function addKw() {
      var inp = $("kwInput"); var k = inp.value.trim().replace(/^#/, "");
      if (k && r.keywords.indexOf(k) < 0) r.keywords.push(k);
      inp.value = ""; renderKwList(); inp.focus();
    }
    $("addKw").onclick = addKw;
    $("kwInput").onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); addKw(); } };

    $("uploadToggle").onclick = function () {
      r.uploaded = !r.uploaded;
      if (r.uploaded && !r.uploadDate) { r.uploadDate = todayStr(); var df = document.querySelector('[data-k="uploadDate"]'); if (df) df.value = r.uploadDate; }
      this.className = "input upload-big" + (r.uploaded ? " on" : "");
      this.textContent = r.uploaded ? "✓ 업로드됨" : "미업로드";
    };

    function collect() {
      Array.prototype.forEach.call(document.querySelectorAll("[data-k]"), function (el) {
        r[el.getAttribute("data-k")] = el.value;
      });
      // 숫자 필드 정리
      ["followers", "views", "likes", "conversions", "cost", "revenue", "order"].forEach(function (k) {
        r[k] = r[k] === "" || r[k] == null ? "" : num(r[k]);
      });
      return r;
    }

    function close() { root.innerHTML = ""; }
    $("closeBtn").onclick = close;
    $("cancelBtn").onclick = close;
    // 바깥(오버레이) 클릭으로는 닫지 않음 — 작성 중 실수로 닫혀 내용이 날아가는 것을 방지.
    // 취소/저장/X 버튼으로만 닫힙니다.
    $("saveBtn").onclick = function () {
      var data = collect();
      if (isNew) { createRecord(data); }
      else { updateRecord(record.id, data); }
      close();
    };
    var del = $("deleteBtn");
    if (del) del.onclick = function () {
      if (confirm("이 인플루언서 기록을 삭제할까요?")) { deleteRecord(record.id); close(); }
    };
  }

  // =========================================================================
  // CSV EXPORT
  // =========================================================================
  function exportCsv() {
    var headers = ["이름", "핸들", "플랫폼", "SNS", "팔로워", "제품", "키워드", "상태", "모집일", "발송일", "업로드일", "업로드", "콘텐츠URL", "조회수", "좋아요", "전환", "비용", "매출", "ROI%", "order"];
    var rows = records.slice().sort(function (a, b) { return num(a.order) - num(b.order); }).map(function (r) {
      var roi = roiOf(r);
      return [r.name, r.handle, r.platform, r.sns, r.followers, r.product, (r.keywords || []).join("|"), r.status, r.recruitDate, r.sentDate, r.uploadDate, r.uploaded ? "Y" : "N", r.contentUrl, r.views, r.likes, r.conversions, r.cost, r.revenue, roi == null ? "" : roi.toFixed(0), r.order];
    });
    var csv = [headers].concat(rows).map(function (row) {
      return row.map(function (c) { return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"'; }).join(",");
    }).join("\n");
    var blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "시딩_" + todayStr() + ".csv"; a.click();
    URL.revokeObjectURL(url);
  }

  // =========================================================================
  // VIEW SWITCH + CONTROLS
  // =========================================================================
  function setView(v) {
    view = v;
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (t) {
      t.classList.toggle("active", t.getAttribute("data-view") === v);
    });
    $("boardView").classList.toggle("hidden", v !== "board");
    $("listView").classList.toggle("hidden", v !== "list");
    renderAll();
  }

  function wireControls() {
    $("addBtn").onclick = function () { openForm(blank()); };
    $("exportBtn").onclick = exportCsv;
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (t) {
      t.onclick = function () { setView(t.getAttribute("data-view")); };
    });
    $("search").oninput = function (e) { query = e.target.value; renderCards(); };
    $("sortBy").onchange = function (e) { sortBy = e.target.value; renderCards(); };
    $("platformFilter").onchange = function (e) { platformFilter = e.target.value; renderCards(); };
    $("searchList").oninput = function (e) { queryList = e.target.value; renderTable(); };
    $("platformFilterList").onchange = function (e) { platformFilterList = e.target.value; renderTable(); };
    $("statusFilterList").onchange = function (e) { statusFilterList = e.target.value; renderTable(); };
    $("dateFromList").onchange = function (e) { dateFromList = e.target.value; renderTable(); };
    $("dateToList").onchange = function (e) { dateToList = e.target.value; renderTable(); };
    $("dateClearList").onclick = function () {
      dateFromList = ""; dateToList = "";
      $("dateFromList").value = ""; $("dateToList").value = "";
      renderTable();
    };
  }

  // ----- init -----
  wireControls();
  initAuth();
})();