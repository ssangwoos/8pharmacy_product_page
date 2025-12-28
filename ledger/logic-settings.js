/**
 * [설정 페이지 통합 로직]
 * 1. 초기 접속 시 비번 설정 유도
 * 2. 일반 설정(약국이름) 변경 (유연한 권한)
 * 3. 비번 개별 변경 (강력한 권한)
 */

// [A] 페이지 로드 시: 초기 설정 체크 및 UI 업데이트
// logic-index.js

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Firestore에서 약국 정보 가져오기
        const docRef = db.collection("settings").doc("pharmacy_info");
        const doc = await docRef.get();

        if (doc.exists) {
            const data = doc.data();
            const pharmacyName = data.pharmacyName || "우리약국";
            
            // 화면의 모든 약국 이름 표시 요소 업데이트
            updatePharmacyNameUI(pharmacyName);
        }
    } catch (e) {
        console.error("메인 화면 데이터 로드 실패:", e);
    }
});

// UI 업데이트 함수
function updatePharmacyNameUI(name) {
    // .pharmacy-name-display 클래스를 가진 모든 요소의 텍스트 변경
    const elements = document.querySelectorAll('.pharmacy-name-display');
    elements.forEach(el => {
        el.innerText = name;
    });
    
    // 브라우저 탭 제목도 변경 (선택 사항)
    document.title = name + " - 스마트 장부";
}

// [B] UI 업데이트 함수
function updateUI(name) {
    if (!name) return;
    document.title = name + " - 설정";
    const displays = document.querySelectorAll('.pharmacy-name-display');
    displays.forEach(el => el.innerText = name);
}

// [D] 비번 개별 변경 - 기존 비번 확인 절차 추가
// [1] 일반 설정 저장 (약국이름 등) - 유저비번 or 슈퍼비번 둘 다 가능
async function saveGeneralSettings() {
    const newName = document.getElementById('setPharmacyName').value;
    const confirmPw = prompt("설정을 저장하려면 비밀번호를 입력하세요.");

    try {
        const docRef = db.collection("settings").doc("pharmacy_info");
        const doc = await docRef.get();
        const data = doc.data();

        // 일반관리자 비번 혹은 슈퍼바이저 비번 중 하나라도 맞으면 통과
        if (confirmPw === data.userPassword || confirmPw === data.superPassword) {
            await docRef.update({ pharmacyName: newName });
            alert("✅ 약국 이름이 변경되었습니다.");
            updateUI(newName);
        } else {
            alert("❌ 비밀번호가 틀렸습니다.");
        }
    } catch (e) {
        alert("오류: " + e.message);
    }
}

// [2] 비밀번호 변경 - 권한별 차등 적용
async function updatePassword(field, inputId) {
    const newPw = document.getElementById(inputId).value;
    if (!newPw) return alert("새 비밀번호를 입력해주세요.");

    const confirmPw = prompt("권한 확인을 위해 현재 비밀번호를 입력하세요.");

    try {
        const docRef = db.collection("settings").doc("pharmacy_info");
        const doc = await docRef.get();
        const data = doc.data();

        let isAuthorized = false;

        // 권한 체크 로직
        if (field === 'userPassword') {
            // 일반비번 변경: 본인 비번 혹은 슈퍼바이저 비번이면 가능
            if (confirmPw === data.userPassword || confirmPw === data.superPassword) {
                isAuthorized = true;
            }
        } else if (field === 'superPassword') {
            // 슈퍼비번 변경: 오직 기존 슈퍼바이저 비번으로만 가능
            if (confirmPw === data.superPassword) {
                isAuthorized = true;
            }
        }

        if (isAuthorized) {
            let updateObj = {};
            updateObj[field] = newPw;
            await docRef.update(updateObj);
            alert("✅ 비밀번호가 성공적으로 변경되었습니다.");
            document.getElementById(inputId).value = ""; 
        } else {
            alert("❌ 변경 권한이 없습니다. 비밀번호를 확인하세요.");
        }
    } catch (e) {
        alert("오류: " + e.message);
    }
}