/* ══════════════════════════════════════════════════════════════════════
   EIGHT PHARMACY — 데이터 저장소 (Firestore)

   공개 페이지와 관리자 페이지가 함께 사용합니다.
   · Firestore 경로 : profile / config
   · 연결 실패 시   : data.js 의 DEFAULT_DATA 로 자동 폴백 → 페이지는 절대
                      비어 보이지 않습니다.
   ══════════════════════════════════════════════════════════════════════ */

const EP_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCygpc_WS2_35_8eYgdTEJwZCtNGJjHvY4",
  authDomain: "pharmacy-productlist.firebaseapp.com",
  projectId: "pharmacy-productlist",
  storageBucket: "pharmacy-productlist.firebasestorage.app",
  messagingSenderId: "409677826366",
  appId: "1:409677826366:web:dc825470ef673194e2446f"
};

const EP_COLLECTION = "profile";
const EP_DOC = "config";

let _epDb = null;

function epFirebaseReady(){
  return typeof firebase !== "undefined" && !!firebase.firestore;
}

function epDb(){
  if (_epDb) return _epDb;
  if (!epFirebaseReady()) return null;
  if (!firebase.apps.length) firebase.initializeApp(EP_FIREBASE_CONFIG);
  _epDb = firebase.firestore();
  return _epDb;
}

/* ── 정규화: 빠진 필드·언어를 채워 페이지가 깨지지 않게 ───────────────── */
function epNormalize(raw){
  const src = raw && typeof raw === "object" ? raw : {};
  const base = DEFAULT_DATA;

  const channels = Object.assign({ handle:"", instagram:"", tiktok:"" }, base.channels, src.channels || {});

  const regions = (Array.isArray(src.regions) && src.regions.length ? src.regions : base.regions)
    .map(r => {
      const label = {};
      LANG_CODES.forEach(c => { label[c] = (r.label && r.label[c]) || ""; });
      return { id: String(r.id || ""), label };
    })
    .filter(r => r.id);

  const branches = (Array.isArray(src.branches) ? src.branches : base.branches).map(b => {
    const text = {};
    LANG_CODES.forEach(c => {
      const t = (b.text && b.text[c]) || {};
      text[c] = { name:t.name||"", sub:t.sub||"", address:t.address||"", desc:t.desc||"" };
    });
    return {
      id:        String(b.id || ""),
      region:    String(b.region || ""),
      cityTag:   b.cityTag || "",
      photo:     b.photo || "",
      phone:     b.phone || "",
      nightOpen: !!b.nightOpen,
      hours: {
        weekday: (b.hours && b.hours.weekday) || "",
        sat:     (b.hours && b.hours.sat)     || "",
        sun:     (b.hours && b.hours.sun)     || ""
      },
      maps: {
        naver:  (b.maps && b.maps.naver)  || "",
        kakao:  (b.maps && b.maps.kakao)  || "",
        google: (b.maps && b.maps.google) || "",
        amap:   (b.maps && b.maps.amap)   || ""
      },
      social: {
        instagram: (b.social && b.social.instagram) || "",
        tiktok:    (b.social && b.social.tiktok)    || ""
      },
      text
    };
  });

  return { channels, regions, branches };
}

/* ── 언어별 텍스트 꺼내기 (빈 값이면 en → ko → 아무 값 순으로 대체) ──── */
function epText(branch, lang){
  const chain = [lang, "en", "ko"].concat(LANG_CODES);
  const out = { name:"", sub:"", address:"", desc:"" };
  ["name", "sub", "address", "desc"].forEach(field => {
    for (const c of chain) {
      const v = branch.text && branch.text[c] && branch.text[c][field];
      if (v) { out[field] = v; return; }
    }
  });
  return out;
}

function epRegionLabel(region, lang){
  return (region.label && (region.label[lang] || region.label.en || region.label.ko))
      || region.id;
}

/* ── 읽기 ────────────────────────────────────────────────────────────── */
async function epLoad(){
  const db = epDb();
  if (!db) {
    console.warn("[EIGHT] Firebase 미연결 — 기본 데이터로 표시합니다.");
    return { data: epNormalize(DEFAULT_DATA), source: "default" };
  }
  try {
    const snap = await db.collection(EP_COLLECTION).doc(EP_DOC).get();
    if (!snap.exists) {
      console.warn("[EIGHT] profile/config 문서가 없습니다 — 기본 데이터로 표시합니다.");
      return { data: epNormalize(DEFAULT_DATA), source: "default" };
    }
    return { data: epNormalize(snap.data()), source: "firestore" };
  } catch (e) {
    console.warn("[EIGHT] Firestore 읽기 실패 — 기본 데이터로 표시합니다:", e.message);
    return { data: epNormalize(DEFAULT_DATA), source: "default" };
  }
}

/* ── 쓰기 (관리자 전용 · 로그인 필요) ────────────────────────────────── */
async function epSave(data){
  const db = epDb();
  if (!db) throw new Error("Firebase에 연결되어 있지 않습니다.");
  const payload = epNormalize(data);
  payload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
  await db.collection(EP_COLLECTION).doc(EP_DOC).set(payload);
  return true;
}
