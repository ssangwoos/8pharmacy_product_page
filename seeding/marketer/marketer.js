// ===========================================================================
// 마케터 체험단 방문 등록 페이지
// - 로그인한 마케터는 본인이 등록한 visitors 문서만 조회/수정/삭제
// - 관리자(admins/{uid} 문서 보유)는 전체 조회
// - 등록 시 visitors 컬렉션에 바로 추가 → 방문관리 페이지에 즉시 반영
//   (visitors 기존 필드 date/time/sns/gift/gift_ds/gift_others/id_name/image/order
//    를 모두 채우고, ownerUid/ownerEmail을 추가로 박음)
// ===========================================================================
(function () {
  "use strict";

  // ----- state -----
  var records = [];     // 화면에 보이는 visitors 문서들
  var unsub = null;
  var currentUser = null;
  var isAdmin = false;
  var query = "";
  var view = "cards";
  var queryTable = "";
  var dateFrom = "", dateTo = "";
  var tableSort = { col: "date", dir: -1 };
  var branchList = [];   // 지점 드롭다운 목록
  var branchUnsub = null;

  // ----- helpers -----
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  function todayStr() { return new Date().toISOString().slice(0, 10); }
  function byId(id) { return records.find(function (r) { return r.id === id; }); }

  function setFormMsg(text, kind) {
    var el = $("formMsg");
    el.textContent = text || "";
    el.className = "form-msg" + (kind ? " " + kind : "");
  }

  // =========================================================================
  // AUTH
  // =========================================================================
  function initAuth() {
    auth.onAuthStateChanged(function (user) {
      if (user) {
        currentUser = user;
        $("authGate").classList.add("hidden");
        $("app").classList.remove("hidden");
        $("userTag").textContent = user.email;
        $("fDate").value = todayStr();
        checkAdminThenSync(user);
      } else {
        currentUser = null;
        isAdmin = false;
        $("app").classList.add("hidden");
        $("authGate").classList.remove("hidden");
        stopSync();
        stopBranchSync();
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

  // 관리자 여부 확인 → 그에 맞는 구독 시작
  function checkAdminThenSync(user) {
    db.collection("admins").doc(user.uid).get()
      .then(function (doc) {
        isAdmin = doc.exists;
        $("adminBadge").classList.toggle("hidden", !isAdmin);
        $("adminLink").classList.toggle("hidden", !isAdmin);
        $("listTitle").textContent = isAdmin ? "전체 등록 목록 (관리자)" : "내 등록 목록";
        startSync();
        startBranchSync();
      })
      .catch(function () {
        // admins 읽기 실패 시 일반 마케터로 처리
        isAdmin = false;
        $("adminBadge").classList.add("hidden");
        $("adminLink").classList.add("hidden");
        startSync();
        startBranchSync();
      });
  }

  // 지점 드롭다운 목록 구독
  function startBranchSync() {
    if (branchUnsub) return;
    branchUnsub = db.collection("branches").onSnapshot(function (snap) {
      branchList = snap.docs.map(function (d) { return d.data().name; })
        .filter(Boolean)
        .sort(function (a, b) { return a.localeCompare(b); });
      fillBranchSelect();
    }, function (err) { console.error("branches error:", err); });
  }
  function stopBranchSync() { if (branchUnsub) { branchUnsub(); branchUnsub = null; } branchList = []; }

  function fillBranchSelect() {
    var sel = $("fIdName");
    var cur = sel.value;
    sel.innerHTML = '<option value="">지점 선택…</option>' +
      branchList.map(function (n) { return '<option value="' + esc(n) + '">' + esc(n) + '</option>'; }).join("");
    // 기존 선택 유지
    if (cur && branchList.indexOf(cur) >= 0) sel.value = cur;
    if (branchList.length === 0) {
      sel.innerHTML = '<option value="">지점이 없습니다 (관리자가 등록 필요)</option>';
    }
  }

  // =========================================================================
  // FIRESTORE
  // =========================================================================
  function startSync() {
    stopSync();
    var ref = db.collection(VISITORS_COLLECTION);
    var q;
    if (isAdmin) {
      q = ref; // 관리자: 전체
    } else {
      // 마케터: 본인 것만. (보안 규칙이 공개 읽기라 화면 필터지만,
      //  쿼리로도 본인 것만 받아 트래픽을 줄임)
      q = ref.where("ownerUid", "==", currentUser.uid);
    }
    unsub = q.onSnapshot(function (snap) {
      records = snap.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; });
      render();
    }, function (err) {
      console.error("onSnapshot error:", err);
      setFormMsg("목록을 불러오지 못했습니다: " + err.message, "error");
    });
  }
  function stopSync() { if (unsub) { unsub(); unsub = null; } records = []; }

  // 등록
  function submitNew() {
    if (!currentUser) return;
    var idName = $("fIdName").value.trim();
    var sns = $("fSns").value.trim();
    var date = $("fDate").value;
    var time = $("fTime").value;
    var gift = $("fGift").value.trim();
    var giftDs = $("fGiftDs").classList.contains("on");
    var others = $("fOthers").value.trim();

    if (!sns) { setFormMsg("SNS 링크는 필수입니다.", "error"); $("fSns").focus(); return; }
    if (!idName) { setFormMsg("지점을 선택하세요.", "error"); $("fIdName").focus(); return; }

    // 디에스 포함이면 gift 텍스트 뒤에 표기 (방문관리 페이지는 gift 텍스트만 보여줌)
    var giftText = gift;
    if (giftDs) giftText = gift ? (gift + " + 디에스") : "디에스";

    // visitors 기존 스키마에 맞춰 채움
    var data = {
      id_name: idName,
      sns: sns,
      date: date || "",
      time: time || "미정",
      gift: giftText,
      gift_ds: false,        // 방문관리 페이지에서 gift_ds = '방문 완료 체크'. 등록 시엔 항상 미완료(false).
      gift_others: others,
      image: "",
      order: 0,              // 방문관리 페이지가 order 오름차순 정렬 → 새 등록을 맨 위로
      // 소유자 표시 (격리/필터용)
      ownerUid: currentUser.uid,
      ownerEmail: currentUser.email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    $("submitBtn").disabled = true;
    setFormMsg("등록 중…");
    db.collection(VISITORS_COLLECTION).add(data)
      .then(function () {
        setFormMsg("등록되었습니다. 방문관리 페이지에 바로 반영됩니다.", "ok");
        clearForm();
      })
      .catch(function (e) {
        console.error(e);
        setFormMsg("등록 실패: " + e.message, "error");
      })
      .finally(function () { $("submitBtn").disabled = false; });
  }

  function nextOrder() {
    var max = 0;
    records.forEach(function (r) { var n = parseInt(r.order, 10); if (!isNaN(n) && n > max) max = n; });
    return max + 1;
  }

  function clearForm() {
    $("fIdName").value = "";
    $("fSns").value = "";
    $("fTime").value = "";
    $("fGift").value = "";
    $("fOthers").value = "";
    $("fGiftDs").classList.add("on");
    $("fGiftDs").textContent = "✓ 디에스 포함";
    $("fDate").value = todayStr();
    $("fSns").focus();
  }

  function updateRecord(id, patch) {
    return db.collection(VISITORS_COLLECTION).doc(id).update(patch)
      .catch(function (e) { console.error(e); alert("수정 실패: " + e.message); });
  }
  function deleteRecord(id) {
    return db.collection(VISITORS_COLLECTION).doc(id).delete()
      .catch(function (e) { console.error(e); alert("삭제 실패: " + e.message); });
  }

  // =========================================================================
  // RENDER
  // =========================================================================
  function filtered() {
    var out = records.filter(function (r) {
      if (!query) return true;
      var hay = [r.id_name, r.sns, r.gift, r.gift_others, r.ownerEmail].join(" ").toLowerCase();
      return hay.indexOf(query.toLowerCase()) >= 0;
    });
    // 날짜 → order 순
    out.sort(function (a, b) {
      var d = (b.date || "").localeCompare(a.date || "");
      if (d !== 0) return d;
      return (parseInt(a.order, 10) || 0) - (parseInt(b.order, 10) || 0);
    });
    return out;
  }

  function render() {
    if (view === "cards") renderCards(); else renderTable();
  }

  function renderCards() {
    var list = filtered();
    $("countTag").textContent = list.length + "건";
    var area = $("listArea");
    if (records.length === 0) {
      area.innerHTML = '<div class="empty">아직 등록한 방문이 없습니다. 위 양식으로 등록하세요.</div>';
      return;
    }
    if (list.length === 0) {
      area.innerHTML = '<div class="empty">검색 결과가 없습니다.</div>';
      return;
    }
    area.innerHTML = '<div class="rows">' + list.map(function (r) {
      var handle = snsHandle(r.sns);
      return '<div class="vrow">' +
        '<div class="vrow-main">' +
          '<div class="vrow-top">' +
            '<span class="vrow-id">' + (esc(r.id_name) || "—") + '</span>' +
            (r.date ? '<span class="vrow-date">' + esc(r.date) + '</span>' : '') +
            (r.time ? '<span class="vrow-time">' + esc(r.time) + '</span>' : '') +
            (isAdmin && r.ownerEmail ? '<span class="vrow-owner">' + esc(r.ownerEmail) + '</span>' : '') +
          '</div>' +
          '<a class="vrow-sns" href="' + esc(r.sns) + '" target="_blank" rel="noreferrer">' + esc(handle) + ' ↗</a>' +
          '<div class="vrow-gift">' +
            (r.gift ? '<span class="gift-chip">' + esc(r.gift) + '</span>' : '') +
            (r.gift_ds ? '<span class="done-chip">방문완료</span>' : '') +
            (r.gift_others ? '<span class="others-text">' + esc(r.gift_others) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="vrow-actions">' +
          '<button class="row-edit" data-edit="' + r.id + '">편집</button>' +
          '<button class="row-del" data-del="' + r.id + '">✕</button>' +
        '</div>' +
      '</div>';
    }).join("") + '</div>';

    Array.prototype.forEach.call(area.querySelectorAll("[data-edit]"), function (b) {
      b.onclick = function () { var r = byId(b.getAttribute("data-edit")); if (r) openEdit(r); };
    });
    Array.prototype.forEach.call(area.querySelectorAll("[data-del]"), function (b) {
      b.onclick = function () {
        var r = byId(b.getAttribute("data-del"));
        if (r && confirm("이 방문 등록을 삭제할까요?\n방문관리 페이지에서도 사라집니다.")) deleteRecord(r.id);
      };
    });
  }

  function snsHandle(url) {
    if (!url) return "(링크 없음)";
    var m = String(url).match(/instagram\.com\/([^\/?#]+)/i);
    if (m) return "@" + m[1];
    return url.length > 40 ? url.slice(0, 40) + "…" : url;
  }

  // ----- 리스트 조회 (표) -----
  function filteredTable() {
    var out = records.filter(function (r) {
      if (dateFrom && (!r.date || r.date < dateFrom)) return false;
      if (dateTo && (!r.date || r.date > dateTo)) return false;
      if (queryTable) {
        var hay = [r.id_name, r.sns, r.gift, r.gift_others, r.ownerEmail].join(" ").toLowerCase();
        if (hay.indexOf(queryTable.toLowerCase()) < 0) return false;
      }
      return true;
    });
    var c = tableSort.col, d = tableSort.dir;
    out.sort(function (a, b) {
      var v;
      if (c === "id_name") v = (a.id_name || "").localeCompare(b.id_name || "");
      else if (c === "gift") v = (a.gift || "").localeCompare(b.gift || "");
      else if (c === "time") v = (a.time || "").localeCompare(b.time || "");
      else if (c === "owner") v = (a.ownerEmail || "").localeCompare(b.ownerEmail || "");
      else v = (a.date || "").localeCompare(b.date || ""); // date 기본
      return v * d;
    });
    return out;
  }

  function renderTable() {
    var list = filteredTable();
    $("countTagTable").textContent = list.length + "건";
    var area = $("tableArea");
    if (records.length === 0) {
      area.innerHTML = '<div class="empty">아직 등록한 방문이 없습니다.</div>';
      return;
    }
    if (list.length === 0) {
      area.innerHTML = '<div class="empty">조건에 맞는 결과가 없습니다.</div>';
      return;
    }
    var cols = [["id_name", "업체명"], ["sns", "SNS"], ["date", "방문일"], ["time", "시간"], ["gift", "제품"], ["others", "비고"]];
    if (isAdmin) cols.push(["owner", "등록 마케터"]);
    var thead = "<tr>" + cols.map(function (col) {
      if (col[0] === "sns" || col[0] === "others") return '<th>' + col[1] + '</th>';
      var arrow = tableSort.col === col[0] ? (tableSort.dir === 1 ? " ▲" : " ▼") : "";
      return '<th data-col="' + col[0] + '">' + col[1] + arrow + '</th>';
    }).join("") + "</tr>";
    var tbody = list.map(function (r) {
      return '<tr data-edit="' + r.id + '">' +
        '<td class="t-id">' + (esc(r.id_name) || "—") + '</td>' +
        '<td><a href="' + esc(r.sns) + '" target="_blank" rel="noreferrer" onclick="event.stopPropagation()">' + esc(snsHandle(r.sns)) + ' ↗</a></td>' +
        '<td>' + (r.date || "—") + '</td>' +
        '<td>' + (esc(r.time) || "—") + '</td>' +
        '<td class="t-gift">' + (esc(r.gift) || "—") + (r.gift_ds ? ' <span class="done-chip">방문완료</span>' : '') + '</td>' +
        '<td class="t-others">' + (esc(r.gift_others) || "—") + '</td>' +
        (isAdmin ? '<td class="t-owner">' + (esc(r.ownerEmail) || "—") + '</td>' : '') +
      '</tr>';
    }).join("");
    area.innerHTML = '<table><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table>';
    Array.prototype.forEach.call(area.querySelectorAll("th[data-col]"), function (th) {
      th.onclick = function () {
        var c = th.getAttribute("data-col");
        if (tableSort.col === c) tableSort.dir *= -1; else { tableSort.col = c; tableSort.dir = 1; }
        renderTable();
      };
    });
    Array.prototype.forEach.call(area.querySelectorAll("tr[data-edit]"), function (tr) {
      tr.onclick = function () { var r = byId(tr.getAttribute("data-edit")); if (r) openEdit(r); };
    });
  }

  function setView(v) {
    view = v;
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (t) {
      t.classList.toggle("active", t.getAttribute("data-view") === v);
    });
    $("cardsView").classList.toggle("hidden", v !== "cards");
    $("listView").classList.toggle("hidden", v !== "list");
    render();
  }

  // =========================================================================
  // EDIT MODAL
  // =========================================================================
  function openEdit(r0) {
    var r = JSON.parse(JSON.stringify(r0));
    var root = $("modalRoot");
    var branchOpts = '<option value="">지점 선택…</option>' +
      branchList.map(function (n) { return '<option value="' + esc(n) + '"' + (n === r.id_name ? " selected" : "") + '>' + esc(n) + '</option>'; }).join("");
    // 현재 값이 목록에 없으면(과거 데이터 등) 그 값도 옵션으로 넣어줌
    if (r.id_name && branchList.indexOf(r.id_name) < 0) {
      branchOpts += '<option value="' + esc(r.id_name) + '" selected>' + esc(r.id_name) + ' (목록 외)</option>';
    }

    root.innerHTML =
      '<div class="modal-overlay"><div class="modal">' +
        '<div class="modal-header"><div class="modal-title">방문 등록 수정</div><button class="close-btn" id="mClose">✕</button></div>' +
        '<div class="form-scroll">' +
          '<label class="field"><span class="field-label">업체명 (호점/지점)</span><select class="input" id="mIdName">' + branchOpts + '</select></label>' +
          '<label class="field"><span class="field-label">SNS 링크</span><input class="input" id="mSns" value="' + esc(r.sns) + '"></label>' +
          '<div class="row">' +
            '<label class="field"><span class="field-label">방문일</span><input class="input" type="date" id="mDate" value="' + esc(r.date) + '"></label>' +
            '<label class="field"><span class="field-label">시간</span><input class="input" id="mTime" value="' + esc(r.time) + '" placeholder="예: 18:00 또는 미정"></label>' +
          '</div>' +
          '<label class="field"><span class="field-label">제품 (디에스 포함 시 직접 표기: 예) test + 디에스)</span><input class="input" id="mGift" value="' + esc(r.gift) + '"></label>' +
          '<label class="field"><span class="field-label">비고 / 기타</span><input class="input" id="mOthers" value="' + esc(r.gift_others) + '"></label>' +
          '<div class="visit-status ' + (r.gift_ds ? "done" : "") + '">방문 상태: ' + (r.gift_ds ? "✓ 방문 완료" : "방문 전") + ' <span class="visit-status-note">(체크는 매장에서 방문관리 페이지로 처리)</span></div>' +
        '</div>' +
        '<div class="modal-footer">' +
          '<button class="row-del-big" id="mDelete">삭제</button>' +
          '<div style="flex:1"></div>' +
          '<button class="btn-ghost" id="mCancel">취소</button>' +
          '<button class="btn-primary" id="mSave">저장</button>' +
        '</div>' +
      '</div></div>';

    function close() { root.innerHTML = ""; }
    $("mClose").onclick = close;
    $("mCancel").onclick = close;
    // 바깥 클릭으로는 닫히지 않음 (작성 내용 보호)
    $("mSave").onclick = function () {
      // gift_ds(방문 완료 체크)는 일부러 건드리지 않음 → 매장의 체크 상태 유지
      var patch = {
        id_name: $("mIdName").value.trim(),
        sns: $("mSns").value.trim(),
        date: $("mDate").value,
        time: $("mTime").value.trim() || "미정",
        gift: $("mGift").value.trim(),
        gift_others: $("mOthers").value.trim()
      };
      updateRecord(r0.id, patch).then(close);
    };
    $("mDelete").onclick = function () {
      if (confirm("이 방문 등록을 삭제할까요?")) deleteRecord(r0.id).then(close);
    };
  }

  // =========================================================================
  // WIRE
  // =========================================================================
  function wire() {
    $("submitBtn").onclick = submitNew;
    $("search").oninput = function (e) { query = e.target.value; renderCards(); };
    // 탭 전환
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (t) {
      t.onclick = function () { setView(t.getAttribute("data-view")); };
    });
    // 리스트 조회 컨트롤
    $("searchTable").oninput = function (e) { queryTable = e.target.value; renderTable(); };
    $("dateFrom").onchange = function (e) { dateFrom = e.target.value; renderTable(); };
    $("dateTo").onchange = function (e) { dateTo = e.target.value; renderTable(); };
    $("dateClear").onclick = function () {
      dateFrom = ""; dateTo = "";
      $("dateFrom").value = ""; $("dateTo").value = "";
      renderTable();
    };
    var ds = $("fGiftDs");
    ds.onclick = function () {
      var on = ds.classList.toggle("on");
      ds.textContent = on ? "✓ 디에스 포함" : "디에스 미포함";
    };
    // 폼에서 Enter로 빠르게 등록 (비고 칸 제외)
    ["fIdName", "fSns", "fGift"].forEach(function (id) {
      $(id).addEventListener("keydown", function (e) { if (e.key === "Enter") submitNew(); });
    });
  }

  wire();
  initAuth();
})();