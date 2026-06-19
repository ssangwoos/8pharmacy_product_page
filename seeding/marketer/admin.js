// ===========================================================================
// 지점 관리 (관리자 전용)
// - branches 컬렉션에 지점 문서를 추가/삭제
// - 관리자(admins/{uid} 보유)만 접근. 일반 마케터는 접근 차단 화면.
// ===========================================================================
(function () {
  "use strict";

  var BRANCHES = "branches";
  var branches = [];
  var unsub = null;
  var currentUser = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  function setMsg(t, kind) { var el = $("formMsg"); el.textContent = t || ""; el.className = "form-msg" + (kind ? " " + kind : ""); }

  // ----- auth -----
  function initAuth() {
    auth.onAuthStateChanged(function (user) {
      if (!user) {
        currentUser = null;
        showOnly("authGate");
        stopSync();
        return;
      }
      currentUser = user;
      // 관리자 확인
      db.collection("admins").doc(user.uid).get().then(function (doc) {
        if (doc.exists) {
          $("userTag").textContent = user.email;
          showOnly("app");
          startSync();
        } else {
          showOnly("noPerm");
        }
      }).catch(function () { showOnly("noPerm"); });
    });

    $("loginBtn").onclick = doLogin;
    $("authPassword").addEventListener("keydown", function (e) { if (e.key === "Enter") doLogin(); });
    $("logoutBtn").onclick = function () { auth.signOut(); };
    $("noPermLogout").onclick = function () { auth.signOut(); };
  }

  function showOnly(id) {
    ["authGate", "noPerm", "app"].forEach(function (x) {
      $(x).classList.toggle("hidden", x !== id);
    });
  }

  function doLogin() {
    var email = $("authEmail").value.trim(), pw = $("authPassword").value;
    var errEl = $("authError"); errEl.textContent = "";
    if (!email || !pw) { errEl.textContent = "이메일과 비밀번호를 입력하세요."; return; }
    $("loginBtn").textContent = "로그인 중…";
    auth.signInWithEmailAndPassword(email, pw)
      .then(function () { $("loginBtn").textContent = "로그인"; })
      .catch(function (e) {
        $("loginBtn").textContent = "로그인";
        errEl.textContent = "로그인 실패: 이메일/비밀번호를 확인하세요.";
      });
  }

  // ----- firestore -----
  function startSync() {
    stopSync();
    unsub = db.collection(BRANCHES).onSnapshot(function (snap) {
      branches = snap.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; });
      branches.sort(function (a, b) { return (a.name || "").localeCompare(b.name || ""); });
      render();
    }, function (err) {
      console.error(err); setMsg("목록을 불러오지 못했습니다: " + err.message, "error");
    });
  }
  function stopSync() { if (unsub) { unsub(); unsub = null; } branches = []; }

  function addBranch() {
    var name = $("branchName").value.trim();
    if (!name) { setMsg("지점 이름을 입력하세요.", "error"); return; }
    if (branches.some(function (b) { return b.name === name; })) {
      setMsg("이미 있는 지점입니다.", "error"); return;
    }
    $("addBranchBtn").disabled = true;
    setMsg("추가 중…");
    db.collection(BRANCHES).add({
      name: name,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () {
      setMsg("추가되었습니다.", "ok");
      $("branchName").value = "";
      $("branchName").focus();
    }).catch(function (e) {
      setMsg("추가 실패: " + e.message, "error");
    }).finally(function () { $("addBranchBtn").disabled = false; });
  }

  function deleteBranch(id, name) {
    if (!confirm("'" + name + "' 지점을 삭제할까요?\n(이미 등록된 방문 기록에는 영향 없습니다.)")) return;
    db.collection(BRANCHES).doc(id).delete().catch(function (e) {
      alert("삭제 실패: " + e.message);
    });
  }

  // ----- render -----
  function render() {
    $("countTag").textContent = branches.length + "개";
    var area = $("branchList");
    if (branches.length === 0) {
      area.innerHTML = '<div class="empty">아직 등록된 지점이 없습니다. 위에서 추가하세요.</div>';
      return;
    }
    area.innerHTML = '<div class="rows">' + branches.map(function (b) {
      return '<div class="vrow branch-row">' +
        '<div class="vrow-main"><span class="vrow-id">' + esc(b.name) + '</span></div>' +
        '<div class="vrow-actions"><button class="row-del" data-del="' + b.id + '" data-name="' + esc(b.name) + '">✕</button></div>' +
      '</div>';
    }).join("") + '</div>';
    Array.prototype.forEach.call(area.querySelectorAll("[data-del]"), function (btn) {
      btn.onclick = function () { deleteBranch(btn.getAttribute("data-del"), btn.getAttribute("data-name")); };
    });
  }

  // ----- wire -----
  $("addBranchBtn").onclick = addBranch;
  $("branchName").addEventListener("keydown", function (e) { if (e.key === "Enter") addBranch(); });
  initAuth();
})();