// 🤖 logic-ai-vision.js: 서버(Cloud Function) 스캔 연동판 ㅡㅡ^
// 🔒 [보안] OpenAI 키는 더 이상 브라우저로 불러오지 않습니다. 판독은 전부 서버에서 처리됩니다.
currentFile = null;
uploadedImgUrl = "";
let ourPharmacyName = "";     // 우리 약국 이름 (수신처 확인용)
let recipientAliases = [];    // 우리 약국으로 인정한 수신처 별칭(정규화) 목록
let existingVendors = [];     // 기존 거래처 목록 (중복 방지 매칭용)
let lastAiResult = null;      // 🎓 마지막 AI 판독 결과 {vendor, items} — 저장 시 정확도 비교용

document.addEventListener("DOMContentLoaded", async () => {
    logMessage("[SYSTEM] 독립 검수 탭 부팅 완료. 스캔은 서버(Cloud Function)에서 안전하게 처리됩니다.");
    await loadOurPharmacyName();
    await loadExistingVendors();
});

// 우리 약국 이름 로드 (명세서 수신처가 우리 약국인지 확인용)
async function loadOurPharmacyName() {
    try {
        const d = await db.collection("settings").doc("pharmacy_info").get();
        if (d.exists) {
            ourPharmacyName = (d.data().pharmacyName || "").trim();
            recipientAliases = Array.isArray(d.data().recipientAliases) ? d.data().recipientAliases : [];
        }
    } catch (e) { console.error("약국명 로드 실패:", e); }
}

// 기존 거래처 목록 로드 (AI가 읽은 거래처와 매칭해 중복 장부 방지)
async function loadExistingVendors() {
    try {
        const snap = await db.collection("transactions").get();
        const set = new Set();
        snap.docs.forEach(doc => { const v = doc.data().vendor; if (v) set.add(String(v).trim()); });
        existingVendors = Array.from(set);
        logMessage(`[거래처 목록] 기존 거래처 ${existingVendors.length}건 로드 (자동 매칭 준비 완료)`);
    } catch (e) { console.error("거래처 목록 로드 실패:", e); }
}

// 상호명 정규화: (주)·공백·기호 제거 후 소문자 (유사도 비교용)
function normalizeName(s) {
    return String(s || "").toLowerCase()
        .replace(/\(주\)|\(유\)|주식회사|㈜|유한회사|합자회사/g, "")
        .replace(/[\s\-_.,·`'"()\[\]]/g, "")
        .trim();
}

// AI가 읽은 거래처를 기존 목록과 매칭 (같으면 통일, 비슷하면 확인, 없으면 신규)
function matchVendorName(aiVendor) {
    const raw = (aiVendor || "").trim();
    if (!raw || existingVendors.length === 0) return raw;
    const nAi = normalizeName(raw);
    if (!nAi) return raw;

    // 1) 정규화 완전 일치 → 자동 통일
    const exact = existingVendors.find(v => normalizeName(v) === nAi);
    if (exact) {
        if (exact !== raw) logMessage(`[거래처 매칭] '${raw}' → 기존 '${exact}'(으)로 자동 통일`);
        return exact;
    }
    // 2) 포함 관계(부분 일치) → 사용자 확인
    const partial = existingVendors.find(v => {
        const nv = normalizeName(v);
        return nv && (nv.includes(nAi) || nAi.includes(nv));
    });
    if (partial) {
        const useExisting = confirm(
            `AI가 읽은 거래처 '${raw}'가\n기존 거래처 '${partial}'와(과) 같아 보입니다.\n\n[확인] 기존 '${partial}'로 통일 (장부 합침)\n[취소] '${raw}' 신규로 등록`
        );
        if (useExisting) { logMessage(`[거래처 매칭] '${raw}' → '${partial}'`); return partial; }
        logMessage(`[신규 등록] '${raw}' (사용자가 신규 선택)`);
        return raw;
    }
    // 3) 매칭 없음 → 신규 거래처
    logMessage(`[신규 거래처] '${raw}' (기존 목록에 없음)`);
    return raw;
}

// 🎓 [자동학습] 품목 서명 및 비교 (명세서 단위: 한 건도 안 고치면 clean)
function itemSig(it) {
    return `${String(it.memo || "").trim()}|${Number(it.qty) || 0}|${Number(it.supply) || 0}|${Number(it.vat) || 0}|${Number(it.total) || 0}`;
}
function signaturesEqual(a, b) {
    const sa = (a || []).filter(x => String(x.memo || "").trim()).map(itemSig).sort();
    const sb = (b || []).filter(x => String(x.memo || "").trim()).map(itemSig).sort();
    return sa.length === sb.length && sa.every((s, i) => s === sb[i]);
}

// 🎓 [자동학습] AI 원본 vs 사람이 저장한 최종본 비교 → 거래처 정확도·예시 기록
async function recordLearning(vendor, savedItems) {
    if (!lastAiResult) return;
    if (normalizeName(vendor) !== normalizeName(lastAiResult.vendor)) { lastAiResult = null; return; }
    const clean = signaturesEqual(lastAiResult.items, savedItems);
    try {
        const ref = centralDb.collection("ai_learning").doc(centralVendorKey(vendor));
        const doc = await ref.get();
        const d = doc.exists ? doc.data() : {};
        const scanned = (d.scanned || 0) + 1;
        const cleanCnt = (d.clean || 0) + (clean ? 1 : 0);
        const recent = (Array.isArray(d.recent) ? d.recent.slice(-29) : []);
        recent.push(clean ? 1 : 0);
        const examples = (Array.isArray(d.examples) ? d.examples.slice(-2) : []);
        examples.push({ items: savedItems });
        await ref.set({ vendor, scanned, clean: cleanCnt, recent, examples, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        const acc = Math.round(cleanCnt / scanned * 100);
        logMessage(`[자동학습] '${vendor}' 정확도 ${acc}% (${cleanCnt}/${scanned}) · 이번 ${clean ? "무수정 통과 ✅" : "수정됨 ✏️"}`);
    } catch (e) { console.error("학습 기록 실패:", e); }
    lastAiResult = null;
}

// 명세서 수신처가 우리 약국과 다르면 확인창 (맞으면 별칭으로 기억해 다음부턴 통과)
async function checkRecipient(recipient) {
    const rec = (recipient || "").trim();
    if (!rec || !ourPharmacyName) return;   // 못 읽었거나 약국명 없으면 스킵
    const nRec = normalizeName(rec);
    const nOur = normalizeName(ourPharmacyName);
    if (!nRec || !nOur) return;

    // 우리 약국명 또는 등록된 별칭과 포함관계면 통과 (예: "충무로에이트약국" ⊇ "에이트약국")
    if (nRec.includes(nOur) || nOur.includes(nRec)) return;
    if (recipientAliases.some(a => a && (nRec.includes(a) || a.includes(nRec)))) return;

    // 불일치 → 사용자 확인
    logMessage(`[수신처 확인] 명세서 수신='${rec}' vs 우리약국='${ourPharmacyName}'`);
    // 수정 가능한 창: 잘못 읽힌 이름을 그 자리에서 고쳐 넣을 수 있게 함(학습됨).
    const answer = prompt(
        `받는 곳(수신)이 '${rec}'로 읽혔습니다.\n` +
        `우리 약국이 맞으면, 아래 이름을 올바르게 고친 뒤 확인을 누르세요.\n` +
        `('${rec}'도 우리 약국으로 기억해 다음부턴 안 물어봐요.)\n` +
        `우리 약국이 아니면 취소를 누르세요.`,
        ourPharmacyName || rec
    );
    if (answer === null) return;   // 취소 = 다른 약국일 수 있음

    const aliases = [nRec];
    const nFix = normalizeName((answer || "").trim());
    if (nFix && nFix !== nOur && !aliases.includes(nFix)) aliases.push(nFix);
    aliases.forEach(a => { if (a && !recipientAliases.includes(a)) recipientAliases.push(a); });
    try {
        await db.collection("settings").doc("pharmacy_info")
            .update({ recipientAliases: firebase.firestore.FieldValue.arrayUnion(...aliases) });
        logMessage(`[학습] '${rec}'${nFix && nFix !== nOur ? " 및 '" + (answer || "").trim() + "'" : ""}을(를) 우리 약국 별칭으로 저장 (다음부턴 통과).`);
    } catch (e) { console.error("별칭 저장 실패:", e); }
}

function logMessage(msg) {
    const logBox = document.getElementById("statusLog");
    if (!logBox) return;
    logBox.innerHTML += `\n${msg}`;
    logBox.scrollTop = logBox.scrollHeight;
}

// 📸 [핵심] 원본 사진을 '화면 캡처본'과 똑같은 상태로 브라우저에서 한 번 굽는다.
// 손으로 스크린샷 찍어 올리면 잘 읽히는 이유 = 브라우저가 그린(방향·색·해상도 정리된) 픽셀을 다시 저장하기 때문.
// createImageBitmap(...,{imageOrientation:'from-image'}) 로 EXIF 방향까지 적용해 캔버스에 그리고 JPEG로 다시 뽑는다.
// => 업로드되는 파일 자체가 이미 '캡처본'. 서버·AI는 이걸 그대로 받아 더 빠르고 정확하게 읽는다.
async function bakeImageLikeScreenshot(file, maxSide = 2600) {
    // 1) 방향 적용해서 디코드 (createImageBitmap 우선, 안되면 <img> 폴백)
    let src, srcW, srcH, revoke = null;
    try {
        src = await createImageBitmap(file, { imageOrientation: "from-image" });
        srcW = src.width; srcH = src.height;
    } catch (e) {
        src = await new Promise((res, rej) => {
            const url = URL.createObjectURL(file);
            revoke = url;
            const im = new Image();
            im.onload = () => res(im);
            im.onerror = () => rej(new Error("이미지 로드 실패"));
            im.src = url;
        });
        srcW = src.naturalWidth; srcH = src.naturalHeight;
    }
    if (!srcW || !srcH) throw new Error("이미지 크기를 읽지 못함");

    // 2) 너무 크면만 축소 (긴 변 maxSide) — 화면 전체보기 캡처와 비슷한 해상도
    const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
    const cw = Math.max(1, Math.round(srcW * scale));
    const ch = Math.max(1, Math.round(srcH * scale));

    // 3) 캔버스에 그려서(=화면에 그리는 것과 동일) JPEG로 다시 저장
    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(src, 0, 0, cw, ch);
    if (revoke) URL.revokeObjectURL(revoke);
    if (src.close) src.close();

    const blob = await new Promise((res, rej) =>
        canvas.toBlob(b => b ? res(b) : rej(new Error("캡처본 생성 실패")), "image/jpeg", 0.92)
    );
    return blob;
}

// 1. 파일 선택 → 캡처본으로 변환 → 미리보기
async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    // 🔄 새 명세서 선택 시 이전 판독값 초기화 (거래처·지침·날짜·품목 잔상 제거)
    uploadedImgUrl = "";   // 새 파일이므로 재업로드 필요
    document.getElementById("metaVendor").value = "";
    document.getElementById("metaDate").value = "";
    document.getElementById("customGuidelineInput").value = "";
    if (typeof renderInspectedGrid === "function") renderInspectedGrid([], []);
    const banner = document.getElementById("arithBanner");
    if (banner) banner.style.display = "none";

    const btn = document.getElementById("btnStartScan");
    if (btn) btn.disabled = true;
    logMessage(`[파일 선택] ${file.name} (${Math.round(file.size/1024)} KB) → 캡처본으로 변환 중...`);

    // 📸 업로드 전에 캡처본으로 변환. 실패하면 원본 그대로 사용(차선).
    try {
        const blob = await bakeImageLikeScreenshot(file);
        const baseName = (file.name || "scan").replace(/\.[^.]+$/, "");
        currentFile = new File([blob], baseName + ".jpg", { type: "image/jpeg" });
        logMessage(`[변환 완료] 캡처본 ${Math.round(currentFile.size/1024)} KB 로 업로드 준비 (원본 대신 사용)`);
    } catch (e) {
        currentFile = file;
        logMessage(`[변환 실패 → 원본 사용] ${e.message}`);
    }

    // 미리보기는 실제로 업로드될 이미지(캡처본)를 보여줌
    const imgElement = document.getElementById("imagePreview");
    imgElement.src = URL.createObjectURL(currentFile);
    imgElement.style.display = "block";
    if (btn) btn.disabled = false;
}

// 2. 거래처별 오답노트 가이드 지침 불러오기
async function loadCustomGuideline(vendorName) {
    const textarea = document.getElementById("customGuidelineInput");
    if (!textarea) return;

    const name = (vendorName || "").trim();
    // 거래처가 비어 있으면 지침칸도 비운다 (이전 거래처 지침 잔상 제거)
    if (!name) { textarea.value = ""; return; }
    if (typeof db === 'undefined') return;

    try {
        const doc = await centralDb.collection("ai_learning").doc(centralVendorKey(name)).get();
        if (doc.exists && doc.data().customPrompt) {
            textarea.value = doc.data().customPrompt;
            logMessage(`[학습 데이터 로드] '${name}' 거래처 맞춤 지침 반영 (중앙 공유).`);
        } else {
            textarea.value = "";   // 이 거래처는 지침이 없으므로 반드시 비움
            logMessage(`[신규 양식] '${name}'의 축적된 지침이 없습니다.`);
        }
    } catch (error) {
        textarea.value = "";
        console.error("지침 로드 오류:", error);
    }
}

// 3. 약사님의 피드백 가이드 실시간 누적 저장 (양식 자동 학습 메커니즘)
async function saveCustomGuideline() {
    const vendorName = document.getElementById("metaVendor").value.trim();
    const guidelineText = document.getElementById("customGuidelineInput").value;
    
    if (!vendorName) {
        alert("거래처명이 비어있습니다. AI 분석을 먼저 수행하거나 직접 입력해 주세요.");
        return;
    }
    if (typeof db === 'undefined') return;

    try {
        await centralDb.collection("ai_learning").doc(centralVendorKey(vendorName)).set({
            vendor: vendorName,
            customPrompt: guidelineText,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        logMessage(`[학습 데이터 갱신] '${vendorName}' 오답노트 저장 완료.`);
        alert(`'${vendorName}' 거래처의 인공지능 지침이 기록되었습니다.`);
    } catch (error) {
        alert("지침 저장 실패: " + error.message);
    }
}

// 4. 🔥 [서버 스캔 엔진] 이미지 업로드 후, 서버(Cloud Function)에서 GPT-4o가 판독 ㅡㅡ^
async function startAiVisionScan() {
    if (!currentFile || typeof storage === 'undefined') return;

    try {
        document.getElementById("btnStartScan").disabled = true;

        // 1. 업로드 (이 파일에 대해 아직 안 올렸을 때만)
        if (!uploadedImgUrl) {
            logMessage("[1/3] Firebase Storage에 명세서 이미지 업로드 중...");
            const storageRef = storage.ref(`pending_uploads/${Date.now()}_${currentFile.name}`);
            const snapshot = await storageRef.put(currentFile);
            uploadedImgUrl = await snapshot.ref.getDownloadURL();
            logMessage("[성공] 이미지 업로드 완료");
        }

        // 2. 1차 판독 (거래처 파악용). 지침이 있으면 자동으로 2차 재판독까지 이어짐
        await runScanPass("", false);

    } catch (error) {
        const msg = (error && error.message) ? error.message : String(error);
        logMessage(`[에러 발생] 스캔 실패: ${msg}`);
        alert("스캔 실패: " + msg);
        document.getElementById("btnStartScan").disabled = false;
    }
}

// 판독 1회 실행. isRetry=false(1차): 거래처 파악 → 지침 있으면 자동 2차 호출.
// isRetry=true(2차): 이미 매칭된 거래처의 지침을 적용해 최종 판독.
async function runScanPass(vendorHint, isRetry) {
    logMessage(isRetry
        ? `[재판독] '${vendorHint}' 거래처 지침을 적용해 다시 판독 중...`
        : "[2/3] 서버(Cloud Function)에 GPT-4o 판독 요청 중... (🔒 키는 브라우저에 노출되지 않음)");

    const scanFn = centralScanFn(); // 🧠 중앙 허브의 스캔 함수 호출
    const res = await scanFn({ imageUrl: uploadedImgUrl, vendor: vendorHint });
    const data = res.data;
    if (!data || !data.ok) throw new Error("서버가 유효한 결과를 반환하지 않았습니다.");

    document.getElementById("metaDate").value = data.date || "";

    let finalVendor;
    if (isRetry) {
        // 2차: 1차에서 이미 매칭·확정된 거래처 사용 (재매칭/재확인/수신처경고 생략)
        finalVendor = vendorHint;
    } else {
        await checkRecipient(data.recipient); // 수신처 확인은 1차에만
        finalVendor = matchVendorName(data.vendor || "");
        document.getElementById("metaVendor").value = finalVendor;
    }

    renderInspectedGrid(data.items || [], data.rows || []);
    showArithmeticBanner(data.allArithmeticOk, (data.items || []).length);

    if (!isRetry) {
        // 이 거래처에 저장된 지침이 있으면, 지침을 적용해 자동으로 한 번 더 판독
        await loadCustomGuideline(finalVendor);
        const guideline = document.getElementById("customGuidelineInput").value.trim();
        if (guideline) {
            logMessage(`[지침 발견] '${finalVendor}' 지침 적용을 위해 자동 재판독합니다.`);
            await runScanPass(finalVendor, true);
            return; // 최종 완료 로그는 2차에서 출력
        }
    }

    // 🎓 [자동학습] 최종 AI 결과 기억 (검수 저장 시 사람이 고친 것과 비교)
    lastAiResult = { vendor: finalVendor, items: (data.items || []).map(x => ({ memo: x.memo, qty: x.qty, supply: x.supply, vat: x.vat, total: x.total })) };

    logMessage(`[완료] 🎉 판독 완료! 거래처: [${finalVendor}] · 산수검증: ${data.allArithmeticOk ? "전 품목 일치 ✅" : "⚠️ 불일치 항목 있음(빨강 표시) — 확인 필요"}${isRetry ? " · 지침 적용됨" : ""}`);
    document.getElementById("btnCommit").disabled = false;
    document.getElementById("btnStartScan").disabled = false;
}

// 4-1. 산수 검증 결과 배너 (자동/반자동 판단 근거를 화면에 표시)
function showArithmeticBanner(allOk, count) {
    const banner = document.getElementById("arithBanner");
    if (!banner) return;
    if (!count) {
        banner.style.display = "none";
        return;
    }
    banner.style.display = "block";
    if (allOk) {
        banner.style.background = "#dcfce7";
        banner.style.color = "#15803d";
        banner.style.border = "1px solid #86efac";
        banner.innerHTML = `<i class="fas fa-check-circle"></i> 산수 검증 통과 — 모든 품목의 공급가+세액=합계가 일치합니다 (자동 저장 가능 수준).`;
    } else {
        banner.style.background = "#fef3c7";
        banner.style.color = "#b45309";
        banner.style.border = "1px solid #fde68a";
        banner.innerHTML = `<i class="fas fa-exclamation-triangle"></i> 일부 품목의 <b>공급가+세액≠합계</b> — 아래 빨간 칸을 확인하고 수정 후 저장하세요.`;
    }
}

// 5. 검수 테이블 렌더링 및 실시간 총합계 라인 출력
function renderInspectedGrid(items, rows) {
    rows = rows || [];
    const tbody = document.getElementById("gridTbody");
    tbody.innerHTML = "";

    if (items.length === 0) {
        tbody.innerHTML = `<tr id="emptyRow"><td colspan="6" style="color: #94a3b8; padding: 40px;">인식된 품목 데이터가 없습니다. 다시 스캔해 주세요.</td></tr>`;
        updateTotalSummary();
        return;
    }

    items.forEach((item, i) => {
        // 산수 불일치(공급가+세액≠합계) 행은 합계 칸을 빨갛게 강조
        const rowOk = rows[i] ? rows[i].ok : true;
        const totalStyle = rowOk
            ? "background:#f8fafc; font-weight:bold; color:#1e293b;"
            : "background:#fef2f2; font-weight:bold; color:#dc2626; border:2px solid #f87171;";
        const totalTitle = rowOk ? "" : `title="공급가+세액=${(rows[i].expected).toLocaleString()} 인데 합계가 다릅니다. 확인 필요"`;

        const tr = document.createElement("tr");
        tr.className = "inspect-row";
        tr.innerHTML = `
            <td class="left"><input type="text" class="cell-memo" value="${item.memo}"></td>
            <td><input type="number" class="cell-qty" value="${item.qty}" oninput="recalculateRow(this)"></td>
            <td class="right"><input type="number" class="cell-supply" value="${item.supply}" oninput="recalculateRow(this)"></td>
            <td class="right"><input type="number" class="cell-vat" value="${item.vat}" oninput="recalculateRow(this)"></td>
            <td class="right"><input type="number" class="cell-total" value="${item.total}" readonly ${totalTitle} style="${totalStyle}"></td>
            <td><button class="row-del-btn" onclick="this.closest('tr').remove(); updateTotalSummary();"><i class="fas fa-minus-circle"></i></button></td>
        `;
        tbody.appendChild(tr);
    });

    updateTotalSummary();
}

function recalculateRow(input) {
    const tr = input.closest("tr");
    const supply = Number(tr.querySelector(".cell-supply").value) || 0;
    
    if (input.classList.contains("cell-supply")) {
        tr.querySelector(".cell-vat").value = Math.round(supply * 0.1);
    }
    const vat = Number(tr.querySelector(".cell-vat").value) || 0;
    tr.querySelector(".cell-total").value = supply + vat;

    updateTotalSummary();
}

function updateTotalSummary() {
    const oldSummary = document.getElementById("totalSummaryRow");
    if (oldSummary) oldSummary.remove();

    const rows = document.querySelectorAll(".inspect-row");
    if (rows.length === 0) return;

    let totalSupply = 0;
    let totalVat = 0;
    let totalSum = 0;

    rows.forEach(row => {
        totalSupply += Number(row.querySelector(".cell-supply").value) || 0;
        totalVat += Number(row.querySelector(".cell-vat").value) || 0;
        totalSum += Number(row.querySelector(".cell-total").value) || 0;
    });

    const tbody = document.getElementById("gridTbody");
    const tr = document.createElement("tr");
    tr.id = "totalSummaryRow";
    tr.style.background = "#f1f5f9";
    tr.style.fontWeight = "bold";

    tr.innerHTML = `
        <td style="text-align:center; color:#475569;"><i class="fas fa-calculator"></i> 명세서 총합계</td>
        <td></td>
        <td style="text-align:right; padding-right:15px; color:#1e293b;">${totalSupply.toLocaleString()}원</td>
        <td style="text-align:right; padding-right:15px; color:#1e293b;">${totalVat.toLocaleString()}원</td>
        <td style="text-align:right; padding-right:15px; color:#2563eb; font-size:1.05rem;">${totalSum.toLocaleString()}원</td>
        <td></td>
    `;
    
    tbody.appendChild(tr);
}

// 6. 실제 파이어스토어 장부 일괄 최종 업로드
async function commitInspectedData() {
    if (typeof db === 'undefined') return;
    
    const date = document.getElementById("metaDate").value;
    const type = document.getElementById("metaType").value;
    const vendor = document.getElementById("metaVendor").value.trim();
    const rows = document.querySelectorAll(".inspect-row");

    if (!date || !vendor || rows.length === 0) {
        alert("검수 데이터가 비어있습니다.");
        return;
    }

    if (!confirm(`검수 완료된 ${rows.length}개 품목을 실제 장부(transactions)에 일괄 저장하시겠습니까?`)) return;

    try {
        document.getElementById("btnCommit").disabled = true;
        logMessage("[장부 저장] 파이어스토어 대량 입고 배치 처리 중...");

        const batch = db.batch();
        const savedItems = []; // 🎓 [자동학습] 최종 저장 품목

        rows.forEach(row => {
            const memo = row.querySelector(".cell-memo").value;
            const qty = Number(row.querySelector(".cell-qty").value) || 0;
            const supply = Number(row.querySelector(".cell-supply").value) || 0;
            const vat = Number(row.querySelector(".cell-vat").value) || 0;
            const total = Number(row.querySelector(".cell-total").value) || 0;
            const docRef = db.collection("transactions").doc();
            batch.set(docRef, {
                date: date, type: type, vendor: vendor,
                memo: memo, qty: qty, supply: supply, vat: vat, total: total,
                img: uploadedImgUrl,
                rotation: 0,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            savedItems.push({ memo, qty, supply, vat, total });
        });

        await batch.commit();

        // 🎓 [자동학습] AI로 채운 건이면 사람이 고친 정도를 거래처 정확도로 기록
        await recordLearning(vendor, savedItems);

        logMessage(`[성공 완료] 총 ${rows.length}건이 완벽히 장부에 기록되었습니다!`);
        alert("🎉 검수 완료된 데이터가 실제 장부에 영구 기록되었습니다.");
        
        document.getElementById("gridTbody").innerHTML = `<tr id="emptyRow"><td colspan="6" style="color: #94a3b8; padding: 40px;">인식된 품목 데이터가 없습니다. 사진을 스캔해 주세요.</td></tr>`;
        document.getElementById("imagePreview").style.display = "none";
        document.getElementById("btnCommit").disabled = true;
        currentFile = null;
        
    } catch (error) {
        logMessage(`[에러] 저장 실패: ${error.message}`);
        document.getElementById("btnCommit").disabled = false;
    }
}

// 📡 [실시간 클라우드 중계 메커니즘] ㅡㅡ^

// 🚨 페이지 로드 시 구형 에러 유발 타이머 함수를 완벽히 제거하고, 현재 가동 중인 백그라운드가 있으면 전광판만 자동 동기화합니다.
document.addEventListener("DOMContentLoaded", async () => {
    if (typeof db !== 'undefined') {
        const doc = await db.collection("system_status").doc("learning").get();
        if (doc.exists && doc.data().status === "RUNNING") {
            logMessage("[SYSTEM] 현재 백그라운드에서 구글 서버가 자가 학습을 구동 중인 것을 감지했습니다. 전광판을 동기화합니다.");
            startLiveServerMonitoring();
        }
    }
});

// 📡 [최종 개정] 구글 서버 원격 시동 및 실시간 전광판 연결 함수
async function triggerCloudLearning() {
    if (typeof firebase === 'undefined') {
        alert("파이어베이스 라이브러리가 로드되지 않았습니다.");
        return;
    }
    
    if (!confirm("정말 구글 클라우드 서버에서 수천 장의 과거 장부 전체 자가 복습을 시작하시겠습니까?\n시작 후에는 약사님 컴퓨터를 끄고 퇴근하셔도 혼자 작동합니다.")) return;

    const startBtn = document.getElementById("btnStartCloudLearning");
    const liveLogBox = document.getElementById("liveServerLogBox");
    
    try {
        startBtn.disabled = true;
        startBtn.style.background = "#64748b";
        startBtn.innerText = "🤖 구글 서버에 시동 신호 전송 중...";
        
        if (liveLogBox) liveLogBox.value = "[SYSTEM] 구글 클라우드 보안 통행증 발급 중...\n";

        const startFn = firebase.app().functions('us-central1').httpsCallable('startCloudSelfLearning');
        const res = await startFn(); 
        
        if (res.data && res.data.success) {
            alert(res.data.message);
            startLiveServerMonitoring(); // 정석 실시간 감시탑 정상 가동
        } else {
            alert("서버 응답 경고: " + (res.data ? res.data.message : "알 수 없는 응답"));
            startBtn.disabled = false;
            startBtn.style.background = "#4f46e5";
            startBtn.innerText = "과거 전체 데이터 기반 자가 복습 개시 (컴퓨터 OFF 가능)";
        }
        
    } catch (err) {
        console.error("원격 시동 실패 에러:", err);
        alert("서버 시동 실패: " + err.message);
        startBtn.disabled = false;
        startBtn.style.background = "#4f46e5";
        startBtn.innerText = "과거 전체 데이터 기반 자가 복습 개시 (컴퓨터 OFF 가능)";
    }
}

// 🛰️ 1.5초마다 파이어베이스 본진을 쑤셔서 로그를 훔쳐오는 감시탑 실체
let cloudMonitorTimer = null;
function startLiveServerMonitoring() {
    if (cloudMonitorTimer) clearInterval(cloudMonitorTimer);
    
    const progressBar = document.getElementById("cloudProgressBar");
    const progressText = document.getElementById("cloudProgressText");
    const liveLogBox = document.getElementById("liveServerLogBox");
    
    cloudMonitorTimer = setInterval(async () => {
        try {
            const doc = await db.collection("system_status").doc("learning").get();
            if (!doc.exists) return;
            
            const data = doc.data();
            
            if (liveLogBox && data.logs) {
                liveLogBox.value = data.logs;
                liveLogBox.scrollTop = liveLogBox.scrollHeight; 
            }
            
            if (progressBar && progressText) {
                progressBar.style.width = `${data.progress || 0}%`;
                if (data.status === "RUNNING") {
                    progressText.innerText = `🔥 구글 서버 복습 중... [${data.current || 0} / ${data.total || 0} 장] (${data.progress || 0}%)`;
                } else if (data.status === "DONE") {
                    progressText.innerText = `🎉 자가 학습 완료! 전 품목 초지능 각성 완료 (100%)`;
                    clearInterval(cloudMonitorTimer);
                } else if (data.status === "ERROR") {
                    progressText.innerText = `🚨 서버 중단됨 (에러 발생)`;
                    clearInterval(cloudMonitorTimer);
                }
            }
        } catch (e) {
            console.error(e);
        }
    }, 1500);
}