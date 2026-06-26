// Import Firebase SDK (from ESM CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, doc, collection, addDoc, updateDoc, deleteDoc, onSnapshot, setDoc, getDocs
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==================== STATE MANAGEMENT ====================
let db = null;
let isFirebaseActive = false;
let nickname = "";
let selectedMainSentenceId = null;

let mainSentences = [];
let patternCards = [];

let mainSentencesUnsubscribe = null;
let patternCardsUnsubscribe = null;
let nicknamesUnsubscribe = null;
let allNicknames = [];

let shuffledMainSentences = null;
let shuffledPatternCards = null;

// Flash Card State
let fcFailDeck = [];
let fcFailIndex = 0;
let fcSuccessDeck = [];
let fcSuccessIndex = 0;

function shuffleArray(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// 닉네임 삭제 확인 타겟
let targetNicknameToDelete = "";

// ==================== INITIALIZATION ====================
document.addEventListener("DOMContentLoaded", async () => {
  // 1. Firebase Config 로드 및 초기화
  let firebaseConfig = null;
  
  // A. firebase-config.json 파일에서 로드 시도
  try {
    const response = await fetch(`./firebase-config.json?cb=${Date.now()}`, { cache: 'no-store' });
    if (response.ok) {
      const config = await response.json();
      if (config && config.apiKey && config.apiKey !== "YOUR_API_KEY") {
        firebaseConfig = config;
        console.log("Loaded Firebase configuration from firebase-config.json successfully.");
      } else {
        console.log("firebase-config.json contains placeholder values. Checking localStorage fallback...");
      }
    }
  } catch (e) {
    console.log("No firebase-config.json found or failed to parse. Checking localStorage fallback...");
  }

  // B. 로컬 파일 로드 실패 시 localStorage에서 로드 시도
  if (!firebaseConfig) {
    const storedConfig = localStorage.getItem("firebase_config");
    if (storedConfig) {
      try {
        firebaseConfig = JSON.parse(storedConfig);
        console.log("Loaded Firebase configuration from localStorage.");
      } catch (e) {
        console.error("Stored Firebase configuration is invalid:", e);
      }
    }
  }

  // Firebase 초기화 시도
  if (firebaseConfig) {
    try {
      const app = initializeApp(firebaseConfig);
      db = getFirestore(app);
      isFirebaseActive = true;
      console.log("Firebase Firestore connected successfully!");
    } catch (error) {
      console.error("Firebase connection failed. Switched to Mock mode:", error);
      isFirebaseActive = false;
    }
  } else {
    console.log("No Firebase configuration available. Switched to Mock mode.");
    isFirebaseActive = false;
  }

  // 2. UI 초기화 및 세션 체크
  checkSession();
  setupEventListeners();
  startCountdownTimer();
  
  // 3. Firestore에서 닉네임 실시간 동기화 시작 (Firebase 활성화 상태인 경우)
  startNicknameSync();
});

// ==================== NICKNAME LISTS & SESSION ====================
function checkSession() {
  const savedNickname = localStorage.getItem("nickname");
  renderNicknameList();
  
  const titleEl = document.getElementById("header-title");
  
  if (savedNickname) {
    nickname = savedNickname;
    if (titleEl) titleEl.innerText = `${nickname}의 영어 놀이터`;
    const userBadge = document.getElementById("user-badge");
    if (userBadge) userBadge.style.display = "flex";
    document.getElementById("btn-logout-header").style.display = "inline-flex";
    document.getElementById("auth-view").style.display = "none";
    document.getElementById("main-view").style.display = "block";
    startSync();
  } else {
    if (titleEl) titleEl.innerText = "소소한 가족의 영어 놀이터";
    const userBadge = document.getElementById("user-badge");
    if (userBadge) userBadge.style.display = "none";
    document.getElementById("btn-logout-header").style.display = "none";
    document.getElementById("auth-view").style.display = "flex";
    document.getElementById("main-view").style.display = "none";
    
    // 패턴 패널이 열려있다면 닫기
    closePatternPanel();
  }
}

// 닉네임 실시간 동기화 시작 (Firestore users 컬렉션 감지)
function startNicknameSync() {
  if (nicknamesUnsubscribe) nicknamesUnsubscribe();

  if (isFirebaseActive && db) {
    const usersColRef = collection(db, "users");
    nicknamesUnsubscribe = onSnapshot(usersColRef, (snapshot) => {
      allNicknames = snapshot.docs.map(docSnap => docSnap.id);
      // 로컬 스토리지도 백업용으로 업데이트
      localStorage.setItem("all_nicknames", JSON.stringify(allNicknames));
      renderNicknameList();
    }, (error) => {
      console.error("Firestore users/nicknames Sync Error:", error);
      showToast("닉네임 목록 서버 동기화에 실패했습니다. (파이어베이스 보안 규칙을 확인하세요) ⚠️", "error");
      fallbackLocalNicknames();
    });
  } else {
    fallbackLocalNicknames();
  }
}

function fallbackLocalNicknames() {
  allNicknames = JSON.parse(localStorage.getItem("all_nicknames") || "[]");
  renderNicknameList();
}

// 닉네임 목록 렌더링
function renderNicknameList() {
  const listContainer = document.getElementById("nickname-list");
  const nicknames = allNicknames;
  const loginBtn = document.getElementById("btn-login");
  const inputVal = document.getElementById("input-nickname").value.trim();

  if (nicknames.length === 0) {
    listContainer.innerHTML = `<div class="empty-state-small">등록된 닉네임이 없습니다. 새 닉네임을 적어 추가해 주세요! 🧸</div>`;
    if (loginBtn) loginBtn.style.display = "block";
    return;
  }

  // 닉네임이 있더라도 입력 필드에 글자가 입력되어 있으면 입장하기 버튼 노출
  if (loginBtn) {
    loginBtn.style.display = inputVal !== "" ? "block" : "none";
  }

  listContainer.innerHTML = nicknames.map(nick => `
    <div class="nickname-item-card" data-nick="${nick}">
      <div class="nickname-info">
        <span class="nickname-avatar">🧸</span>
        <span>${nick}</span>
      </div>
      <button class="btn-delete-nickname" data-nick="${nick}" title="닉네임 삭제">
        <i data-lucide="trash-2"></i>
      </button>
    </div>
  `).join("");

  lucide.createIcons();
  setupNicknameCardEvents();
}

// 닉네임 카드 클릭 및 삭제 버튼 이벤트 바인딩
function setupNicknameCardEvents() {
  document.querySelectorAll(".nickname-item-card").forEach(card => {
    card.addEventListener("click", (e) => {
      // 만약 삭제 버튼을 눌렀다면 입장하지 않음
      if (e.target.closest(".btn-delete-nickname")) return;
      
      const nick = card.dataset.nick;
      localStorage.setItem("nickname", nick);
      checkSession();
    });
  });

  document.querySelectorAll(".btn-delete-nickname").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const nick = btn.dataset.nick;
      openDeleteNicknameModal(nick);
    });
  });
}

// 닉네임 추가 및 바로 로그인
async function handleAddNickname() {
  const input = document.getElementById("input-nickname");
  const value = input.value.trim();
  if (value === "") {
    showToast("새 닉네임을 입력해 주세요!", "error");
    return;
  }

  // 1. Firebase 활성화 시 Firestore에 사용자 문서 생성
  if (isFirebaseActive && db) {
    try {
      await setDoc(doc(db, "users", value), {
        nickname: value,
        createdAt: new Date()
      });
    } catch (error) {
      console.error("Failed to add user to Firestore:", error);
      showToast("서버에 사용자를 등록하지 못했습니다. (보안 규칙 또는 네트워크 확인 필요) ⚠️", "error");
      return; // Firestore 등록에 실패하면 로컬 세션 진행을 중단합니다.
    }
  }

  // 2. 로컬 스토리지/전역 상태 목록에 추가 (백업/Mock용)
  if (!allNicknames.includes(value)) {
    allNicknames.push(value);
    localStorage.setItem("all_nicknames", JSON.stringify(allNicknames));
  }

  // 바로 세션 활성화 및 렌더
  localStorage.setItem("nickname", value);
  input.value = "";
  checkSession();
}

// 닉네임 삭제 확인 모달
function openDeleteNicknameModal(nick) {
  targetNicknameToDelete = nick;
  document.getElementById("delete-nickname-desc").innerText = `닉네임 "${nick}"의 모든 학습 데이터가 영구 삭제됩니다.`;
  document.getElementById("input-delete-nickname-confirm").value = "";
  document.getElementById("btn-confirm-delete-nickname").disabled = true;
  openModal("modal-delete-nickname");
}

function handleNicknameDeleteConfirmText(e) {
  const text = e.target.value.trim();
  const btn = document.getElementById("btn-confirm-delete-nickname");
  btn.disabled = (text !== targetNicknameToDelete);
}

async function executeNicknameDeletion() {
  if (targetNicknameToDelete === "") return;

  // 1. Firestore에서 해당 닉네임 및 데이터 일괄 삭제
  if (isFirebaseActive && db) {
    try {
      // 1-1. 닉네임 문서 삭제
      await deleteDoc(doc(db, "users", targetNicknameToDelete));
      
      // 1-2. 해당 사용자의 대표 문장(mainSentences) 삭제
      const mainColRef = collection(db, "users", targetNicknameToDelete, "mainSentences");
      const mainSnapshot = await getDocs(mainColRef);
      for (const docSnap of mainSnapshot.docs) {
        await deleteDoc(doc(db, "users", targetNicknameToDelete, "mainSentences", docSnap.id));
      }

      // 1-3. 해당 사용자의 패턴 카드(patternCards) 삭제
      const patternColRef = collection(db, "users", targetNicknameToDelete, "patternCards");
      const patternSnapshot = await getDocs(patternColRef);
      for (const docSnap of patternSnapshot.docs) {
        await deleteDoc(doc(db, "users", targetNicknameToDelete, "patternCards", docSnap.id));
      }
    } catch (error) {
      console.error("Failed to delete user data from Firestore:", error);
      showToast("서버에서 데이터를 삭제하는 중 오류가 발생했습니다.", "error");
    }
  }

  // 2. 닉네임 목록에서 제외
  allNicknames = allNicknames.filter(n => n !== targetNicknameToDelete);
  localStorage.setItem("all_nicknames", JSON.stringify(allNicknames));

  // 3. 해당 닉네임의 로컬 데이터 전부 삭제
  localStorage.removeItem(`mock_mainSentences_${targetNicknameToDelete}`);
  localStorage.removeItem(`mock_patternCards_${targetNicknameToDelete}`);

  // 4. 만약 현재 로그인된 닉네임이라면 로그아웃 처리
  const currentNick = localStorage.getItem("nickname");
  if (currentNick === targetNicknameToDelete) {
    localStorage.removeItem("nickname");
  }

  closeModal("modal-delete-nickname");
  showToast(`닉네임 "${targetNicknameToDelete}" 데이터가 성공적으로 삭제되었습니다.`, "info");
  targetNicknameToDelete = "";
  checkSession();
}

// ==================== CUTE CONFIRM DIALOG HELPER ====================
function showCuteConfirm(title, desc) {
  return new Promise((resolve) => {
    document.getElementById("delete-confirm-title").innerText = title;
    document.getElementById("delete-confirm-desc").innerText = desc;
    
    const modal = document.getElementById("modal-cute-confirm");
    modal.classList.add("active");
    
    const btnOk = document.getElementById("btn-delete-ok");
    const btnCancel = document.getElementById("btn-delete-cancel");
    
    const handleOk = () => {
      modal.classList.remove("active");
      btnOk.removeEventListener("click", handleOk);
      btnCancel.removeEventListener("click", handleCancel);
      resolve(true);
    };
    
    const handleCancel = () => {
      modal.classList.remove("active");
      btnOk.removeEventListener("click", handleOk);
      btnCancel.removeEventListener("click", handleCancel);
      resolve(false);
    };
    
    btnOk.addEventListener("click", handleOk);
    btnCancel.addEventListener("click", handleCancel);
  });
}

// ==================== FIREBASE/MOCK SYNC & CRUD ====================
function startSync() {
  if (mainSentencesUnsubscribe) mainSentencesUnsubscribe();
  if (patternCardsUnsubscribe) patternCardsUnsubscribe();

  shuffledMainSentences = null;
  shuffledPatternCards = null;

  if (isFirebaseActive && db) {
    const mainColRef = collection(db, "users", nickname, "mainSentences");
    mainSentencesUnsubscribe = onSnapshot(mainColRef, (snapshot) => {
      mainSentences = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      mainSentences.sort((a, b) => new Date(parseDate(b.createdAt)) - new Date(parseDate(a.createdAt)));
      renderMainSentences();
      renderReviewSection();
    }, (error) => {
      console.error("Firestore mainSentences Sync Error:", error);
      showToast("대표 문장 서버 동기화에 실패했습니다. (보안 규칙 확인 필요) ⚠️", "error");
    });

    const patternColRef = collection(db, "users", nickname, "patternCards");
    patternCardsUnsubscribe = onSnapshot(patternColRef, (snapshot) => {
      patternCards = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      renderPatternCards();
      renderReviewSection();
    }, (error) => {
      console.error("Firestore patternCards Sync Error:", error);
      showToast("패턴 카드 서버 동기화에 실패했습니다. (보안 규칙 확인 필요) ⚠️", "error");
    });
  } else {
    triggerLocalUpdate();
  }
}

function triggerLocalUpdate() {
  if (isFirebaseActive) return;

  shuffledMainSentences = null;
  shuffledPatternCards = null;

  const mainKey = `mock_mainSentences_${nickname}`;
  mainSentences = JSON.parse(localStorage.getItem(mainKey) || "[]");
  mainSentences.sort((a, b) => new Date(parseDate(b.createdAt)) - new Date(parseDate(a.createdAt)));

  const patternKey = `mock_patternCards_${nickname}`;
  patternCards = JSON.parse(localStorage.getItem(patternKey) || "[]");

  renderMainSentences();
  renderPatternCards();
  renderReviewSection();
}

function parseDate(val) {
  if (val && val.toDate) {
    return val.toDate();
  }
  return val;
}

// 영어 첫 글자 대문자 변환 도구
function capitalizeEnglish(text) {
  if (!text) return "";
  const trimmed = text.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

// ---------------- CRUD API ----------------
async function addMainSentence(ko, en) {
  const formattedEn = capitalizeEnglish(en);
  
  if (isFirebaseActive && db) {
    const colRef = collection(db, "users", nickname, "mainSentences");
    await addDoc(colRef, {
      korean: ko,
      english: formattedEn,
      createdAt: new Date()
    });
  } else {
    const mainKey = `mock_mainSentences_${nickname}`;
    const list = JSON.parse(localStorage.getItem(mainKey) || "[]");
    list.push({
      id: "mock_main_" + Date.now() + "_" + Math.floor(Math.random()*1000),
      korean: ko,
      english: formattedEn,
      createdAt: new Date().toISOString()
    });
    localStorage.setItem(mainKey, JSON.stringify(list));
    triggerLocalUpdate();
  }
}

async function addPatternCard(mainSentenceId, ko, en) {
  const formattedEn = capitalizeEnglish(en);

  if (isFirebaseActive && db) {
    const colRef = collection(db, "users", nickname, "patternCards");
    await addDoc(colRef, {
      mainSentenceId: mainSentenceId,
      korean: ko,
      english: formattedEn,
      status: 'new', 
      successCount: 0,
      lastSuccessAt: null,
      nextTestAt: null,
      createdAt: new Date()
    });
  } else {
    const patternKey = `mock_patternCards_${nickname}`;
    const list = JSON.parse(localStorage.getItem(patternKey) || "[]");
    list.push({
      id: "mock_pattern_" + Date.now() + "_" + Math.floor(Math.random()*1000),
      mainSentenceId: mainSentenceId,
      korean: ko,
      english: formattedEn,
      status: 'new',
      successCount: 0,
      lastSuccessAt: null,
      nextTestAt: null,
      createdAt: new Date().toISOString()
    });
    localStorage.setItem(patternKey, JSON.stringify(list));
    triggerLocalUpdate();
  }
}

async function deleteMainSentence(id) {
  const confirmed = await showCuteConfirm("대표 문장 삭제 확인", "이 대표 문장과 관련된 모든 패턴 카드가 함께 삭제됩니다. 정말 삭제하시겠습니까? 😢");
  if (confirmed) {
    if (isFirebaseActive && db) {
      const docRef = doc(db, "users", nickname, "mainSentences", id);
      await deleteDoc(docRef);

      const subCards = patternCards.filter(c => c.mainSentenceId === id);
      for (const card of subCards) {
        const subDocRef = doc(db, "users", nickname, "patternCards", card.id);
        await deleteDoc(subDocRef);
      }
    } else {
      const mainKey = `mock_mainSentences_${nickname}`;
      let list = JSON.parse(localStorage.getItem(mainKey) || "[]");
      list = list.filter(item => item.id !== id);
      localStorage.setItem(mainKey, JSON.stringify(list));

      const patternKey = `mock_patternCards_${nickname}`;
      let plist = JSON.parse(localStorage.getItem(patternKey) || "[]");
      plist = plist.filter(item => item.mainSentenceId !== id);
      localStorage.setItem(patternKey, JSON.stringify(plist));

      triggerLocalUpdate();
    }
    
    if (selectedMainSentenceId === id) {
      selectedMainSentenceId = null;
      closePatternPanel();
    }
  }
}

async function deletePatternCard(id) {
  const confirmed = await showCuteConfirm("패턴 카드 삭제 확인", "이 패턴 카드를 암기장에서 삭제할까요? 😢");
  if (confirmed) {
    if (isFirebaseActive && db) {
      const docRef = doc(db, "users", nickname, "patternCards", id);
      await deleteDoc(docRef);
    } else {
      const patternKey = `mock_patternCards_${nickname}`;
      let list = JSON.parse(localStorage.getItem(patternKey) || "[]");
      list = list.filter(item => item.id !== id);
      localStorage.setItem(patternKey, JSON.stringify(list));
      triggerLocalUpdate();
    }
  }
}

async function updatePatternCard(id, updates) {
  if (isFirebaseActive && db) {
    const docRef = doc(db, "users", nickname, "patternCards", id);
    await updateDoc(docRef, updates);
  } else {
    const patternKey = `mock_patternCards_${nickname}`;
    const list = JSON.parse(localStorage.getItem(patternKey) || "[]");
    const idx = list.findIndex(c => c.id === id);
    if (idx !== -1) {
      list[idx] = {
        ...list[idx],
        ...updates,
        lastSuccessAt: updates.lastSuccessAt instanceof Date ? updates.lastSuccessAt.toISOString() : updates.lastSuccessAt,
        nextTestAt: updates.nextTestAt instanceof Date ? updates.nextTestAt.toISOString() : updates.nextTestAt,
      };
      localStorage.setItem(patternKey, JSON.stringify(list));
      triggerLocalUpdate();
    }
  }
}

// ==================== RENDERING UI ====================

// 1. 대표 문장 카드 렌더링 (영어가 위에 크게 완전히 공개되어 보임, 한글이 밑에 작게)
function renderMainSentences() {
  const container = document.getElementById("main-sentences-list");
  
  // 1. 헤더 옆에 총 개수 표시
  const countEl = document.getElementById("main-sentences-count");
  if (countEl) {
    countEl.innerText = `(${mainSentences.length})`;
  }

  if (mainSentences.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>등록된 대표 문장이 없습니다.<br>첫 번째 대표 문장을 등록해 보세요! ⭐</p>
      </div>`;
    return;
  }

  // 셔블 순서가 지정되어 있으면 셔플 리스트를 사용하고, 그렇지 않으면 기본 정렬 리스트 사용
  const listToRender = shuffledMainSentences || mainSentences;

  container.innerHTML = listToRender.map((sentence, index) => {
    const isActive = sentence.id === selectedMainSentenceId ? "active" : "";
    return `
      <div class="sentence-card ${isActive}" data-id="${sentence.id}">
        <div class="card-top">
          <div class="card-top-left">
            <span class="card-index">#${index + 1}</span>
          </div>
          <div class="card-actions-row">
            <button class="btn-card-action btn-edit-main" data-id="${sentence.id}" title="편집">
              <i data-lucide="edit-3"></i>
            </button>
            <button class="btn-card-action btn-delete" data-id="${sentence.id}" title="삭제">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </div>
        <div class="card-english-wrapper">
          <div class="card-english-column">
            <!-- 대표문장은 영어 기본 가림(blurred) 처리 후 누르고 있는 동안 공개 -->
            <div class="card-english blurred" id="en-${sentence.id}">${sentence.english}</div>
            <div class="card-korean">${sentence.korean}</div>
          </div>
          <button class="btn-card-action btn-speak" data-text="${sentence.english}" title="발음 듣기">
            <i data-lucide="volume-2"></i>
          </button>
        </div>
      </div>
    `;
  }).join("");

  lucide.createIcons();
  setupMainSentenceCardClicks();
}

// 2. 패턴 카드 렌더링 (우측/하단 슬라이드 오버 패널)
function renderPatternCards() {
  const container = document.getElementById("pattern-cards-list");
  const overlayPanel = document.getElementById("pattern-overlay-panel");
  const overlayBackdrop = document.getElementById("pattern-overlay-backdrop");

  if (!selectedMainSentenceId) {
    closePatternPanel();
    return;
  }

  // 선택된 대표 문장 정보 로드
  const activeMain = mainSentences.find(s => s.id === selectedMainSentenceId);
  if (activeMain) {
    document.getElementById("pattern-column-title").innerHTML = `
      <span class="emoji">💡</span> "${activeMain.english}"의 패턴 카드
    `;
  }

  const filteredCards = patternCards.filter(c => c.mainSentenceId === selectedMainSentenceId);

  // 1. 헤더 옆에 총 개수 표시
  const countEl = document.getElementById("pattern-cards-count");
  if (countEl) {
    countEl.innerText = `(${filteredCards.length})`;
  }

  if (filteredCards.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>선택한 대표 문장에 속한 패턴 카드가 없습니다.<br>새 패턴 카드를 추가해 보세요!</p>
      </div>`;
  } else {
    // 셔플 순서가 지정되어 있으면 셔플 리스트를 사용하고, 그렇지 않으면 기본 리스트 사용
    const listToRender = shuffledPatternCards || filteredCards;

    container.innerHTML = listToRender.map((card, index) => {
      let statusText = "신규";
      let badgeClass = "badge-new";
      if (card.status === 'success') {
        statusText = `성공 ${card.successCount}회`;
        badgeClass = "badge-success";
      } else if (card.status === 'fail') {
        statusText = "실패";
        badgeClass = "badge-fail";
      }

      return `
        <div class="sentence-card" id="card-${card.id}">
          <div class="card-top">
            <div class="card-top-left">
              <span class="card-index">#${index + 1}</span>
              <span class="card-badge ${badgeClass}">${statusText}</span>
            </div>
            <div class="card-actions-row">
              <button class="btn-card-action btn-edit-pattern" data-id="${card.id}" title="편집">
                <i data-lucide="edit-3"></i>
              </button>
              <button class="btn-card-action btn-delete-pattern" data-id="${card.id}" title="삭제">
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </div>
          <div class="card-english-wrapper">
            <div class="card-english-column">
              <!-- 패턴카드는 공부를 위해 탭하여 볼 수 있게 블러(blurred) 처리 지원 -->
              <div class="card-english blurred" id="en-${card.id}">${card.english}</div>
              <div class="card-korean">${card.korean}</div>
            </div>
            <button class="btn-card-action btn-speak" data-text="${card.english}" title="발음 듣기">
              <i data-lucide="volume-2"></i>
            </button>
          </div>
          <div class="card-controls">
            <!-- 자가 채점용 성공/실패 버튼 상시 표시 (단, 복습 완료 후 대기 중인 경우는 제외) -->
            <div class="self-assess-btn-group">
              <button class="btn-assess btn-assess-success" data-id="${card.id}">
                성공 👍
              </button>
              <button class="btn-assess btn-assess-fail" data-id="${card.id}">
                실패 👎
              </button>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  // 슬라이드 패널 활성화
  overlayPanel.classList.add("active");
  overlayBackdrop.classList.add("active");

  lucide.createIcons();
  setupPatternCardEvents();
}

function closePatternPanel() {
  document.getElementById("pattern-overlay-panel").classList.remove("active");
  document.getElementById("pattern-overlay-backdrop").classList.remove("active");
  selectedMainSentenceId = null;
  shuffledPatternCards = null;
  // 대표 문장 리스트의 액티브 상태 제거
  document.querySelectorAll("#main-sentences-list .sentence-card").forEach(c => c.classList.remove("active"));
}

// 3. 복습 보관함 렌더링
function renderReviewSection() {
  // 실패한 카드
  const failedContainer = document.getElementById("failed-cards-list");
  const failedList = patternCards.filter(c => c.status === 'fail');
  document.getElementById("failed-count").innerText = failedList.length;

  if (failedList.length === 0) {
    failedContainer.innerHTML = `<div class="empty-state-small">실패한 카드가 없습니다. 참 잘하고 있어요! 🎉</div>`;
  } else {
    failedContainer.innerHTML = failedList.map((card, index) => `
      <div class="sentence-card" id="card-${card.id}">
        <div class="card-top">
          <div class="card-top-left">
            <span class="card-index">#${index + 1}</span>
            <span class="card-badge badge-fail">실패</span>
          </div>
          <div class="card-actions-row">
            <button class="btn-card-action btn-edit-pattern" data-id="${card.id}" title="편집">
              <i data-lucide="edit-3"></i>
            </button>
            <button class="btn-card-action btn-delete-pattern" data-id="${card.id}">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </div>
        <div class="card-english-wrapper">
          <div class="card-english-column">
            <div class="card-english blurred" id="en-${card.id}">${card.english}</div>
            <div class="card-korean">${card.korean}</div>
          </div>
          <button class="btn-card-action btn-speak" data-text="${card.english}">
            <i data-lucide="volume-2"></i>
          </button>
        </div>
        <div class="card-controls">
          <div class="self-assess-btn-group">
            <button class="btn-assess btn-assess-success" data-id="${card.id}">
              성공 👍
            </button>
          </div>
        </div>
      </div>
    `).join("");
  }

  // 성공한 카드 (1회 ~ 7회 마스터 단계)
  const readyCardsCount = { val: 0 };
  
  for (let i = 1; i <= 7; i++) {
    const stageContainer = document.getElementById(`success-stage-${i}`);
    if (!stageContainer) continue;

    let stageList = [];
    if (i === 7) {
      stageList = patternCards.filter(c => c.status === 'success' && c.successCount >= 7);
    } else if (i === 6) {
      stageList = patternCards.filter(c => c.status === 'success' && c.successCount === 6);
    } else {
      stageList = patternCards.filter(c => c.status === 'success' && c.successCount === i);
    }

    // 그룹 헤더 옆 개수 갱신
    const groupEl = document.querySelector(`.success-group[data-stage="${i}"]`);
    if (groupEl) {
      const titleEl = groupEl.querySelector(".group-title");
      if (titleEl) {
        const originalTitles = {
          1: '🌱 1회 성공 (대기: <span class="stage-time">2주</span>)',
          2: '🌿 2회 성공 (대기: <span class="stage-time">1달</span>)',
          3: '🍀 3회 성공 (대기: <span class="stage-time">3달</span>)',
          4: '🌳 4회 성공 (대기: <span class="stage-time">6달</span>)',
          5: '👑 5회 성공 (대기: <span class="stage-time">1년</span>)',
          6: '✨ 6회 성공 (대기: <span class="stage-time">2년</span>)',
          7: '🏆 마스터 (암기 완료! 🎉)'
        };
        titleEl.innerHTML = `${originalTitles[i]} <span class="header-count" style="margin-left:4px; font-size:0.8rem; background-color: rgba(160, 196, 255, 0.15); padding: 1px 6px; border-radius: 50px;">${stageList.length}</span>`;
      }
    }

    if (stageList.length === 0) {
      stageContainer.innerHTML = `<div class="empty-state-small" style="grid-column: 1 / -1;">비어 있음</div>`;
    } else {
      stageContainer.innerHTML = stageList.map((card, index) => {
        const isSpeedy = document.getElementById("toggle-speedy-mode")?.checked || false;
        let finalNextTestAt = parseDate(card.nextTestAt);
        if (isSpeedy && card.lastSuccessAt) {
          const lastSuccess = new Date(parseDate(card.lastSuccessAt));
          finalNextTestAt = new Date(lastSuccess.getTime() + 30000);
        }
        const finalIsReady = finalNextTestAt ? (new Date() >= new Date(finalNextTestAt)) : true;
        
        if (finalIsReady && i < 7) {
          readyCardsCount.val++;
        }

        // 대기 중이면 시간 표시, 대기가 끝났으면 자가 채점 버튼 대신 "복습 대기 완료" 라벨 노출 (플래시카드 탭에서 학습)
        // 단, 7단계 마스터 단계는 복습 대상이 아니므로 완료 배지 고정 노출
        let controlsHtml = "";
        if (i === 7) {
          controlsHtml = `
            <div class="countdown-timer-text" style="color: #3F6EB8;">
              🏆 마스터 완료!
            </div>
          `;
        } else if (finalIsReady) {
          controlsHtml = `
            <div class="countdown-timer-text" style="color: #27ae60; font-weight: bold;">
              ⏳ 복습 가능 (플래시카드)
            </div>
          `;
        } else {
          controlsHtml = `
            <div class="countdown-timer-text" data-next-test-at="${finalNextTestAt ? new Date(finalNextTestAt).toISOString() : ''}">
              ⏳ 계산 중...
            </div>
          `;
        }

        const badgeText = i === 7 ? "🏆 마스터" : `${card.successCount}회 성공`;

        return `
          <div class="sentence-card" id="card-${card.id}">
            <div class="card-top">
              <div class="card-top-left">
                <span class="card-index">#${index + 1}</span>
                <span class="card-badge badge-success">${badgeText}</span>
              </div>
              <div class="card-actions-row">
                <button class="btn-card-action btn-edit-pattern" data-id="${card.id}" title="편집">
                  <i data-lucide="edit-3"></i>
                </button>
                <button class="btn-card-action btn-delete-pattern" data-id="${card.id}">
                  <i data-lucide="trash-2"></i>
                </button>
              </div>
            </div>
            <div class="card-english-wrapper">
              <div class="card-english-column">
                <div class="card-english blurred" id="en-${card.id}">${card.english}</div>
                <div class="card-korean">${card.korean}</div>
              </div>
              <button class="btn-card-action btn-speak" data-text="${card.english}">
                <i data-lucide="volume-2"></i>
              </button>
            </div>
            <div class="card-controls">
              ${controlsHtml}
            </div>
          </div>
        `;
      }).join("");
    }
  }

  const totalReviewNeed = failedList.length + readyCardsCount.val;
  const badge = document.getElementById("review-count-badge");
  if (badge) {
    badge.innerText = totalReviewNeed;
    badge.style.display = totalReviewNeed > 0 ? "inline-block" : "none";
  }

  lucide.createIcons();
  setupPatternCardEvents();

  // 플래시카드 탭의 카드 수 갱신
  updateFlashCardCounts();
}

// 4. 타이머 카운트다운 로직
let countdownTimer = null;
function startCountdownTimer() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    const timers = document.querySelectorAll(".countdown-timer-text");
    timers.forEach(timer => {
      const targetStr = timer.getAttribute("data-next-test-at");
      if (!targetStr) return;

      const targetDate = new Date(targetStr);
      const now = new Date();
      const diff = targetDate - now;

      if (diff <= 0) {
        // 타이머가 만료되면 카드 섹션 리렌더링하여 자가 채점 버튼 활성화
        renderReviewSection();
      } else {
        const seconds = Math.floor((diff / 1000) % 60);
        const minutes = Math.floor((diff / (1000 * 60)) % 60);
        const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days > 0) {
          timer.innerText = `⏳ ${days}일 ${hours}시간 남음`;
        } else if (hours > 0) {
          timer.innerText = `⏳ ${hours}시간 ${minutes}분 남음`;
        } else if (minutes > 0) {
          timer.innerText = `⏳ ${minutes}분 ${seconds}초 남음`;
        } else {
          timer.innerText = `⏳ ${seconds}초 남음`;
        }
      }
    });
  }, 1000);
}

// ==================== LEITNER INTERVALS ====================
function calculateNextTestTime(successCount, isSpeedy) {
  const now = new Date();
  let msToAdd = 0;

  if (isSpeedy) {
    // 가속 복습 주기: 1회 ~ 6회 성공 모두 각 30초씩 적용
    msToAdd = 30 * 1000;
  } else {
    // 실제 주기: 2주, 1달, 3달, 6달, 1년, 2년
    const DAY = 24 * 60 * 60 * 1000;
    const intervals = [
      14 * DAY,
      30 * DAY,
      90 * DAY,
      180 * DAY,
      365 * DAY,
      730 * DAY
    ];
    const idx = Math.min(successCount - 1, intervals.length - 1);
    msToAdd = intervals[idx];
  }

  return new Date(now.getTime() + msToAdd);
}

// ==================== self-assessment control ====================
async function handleSelfAssessment(cardId, outcome) {
  const card = patternCards.find(c => c.id === cardId);
  if (!card) return;

  const isSpeedy = document.getElementById("toggle-speedy-mode").checked;

  if (outcome === 'success') {
    const newSuccessCount = (card.successCount || 0) + 1;
    const nextTest = calculateNextTestTime(newSuccessCount, isSpeedy);

    await updatePatternCard(card.id, {
      status: 'success',
      successCount: newSuccessCount,
      lastSuccessAt: new Date(),
      nextTestAt: nextTest
    });
  } else {
    // 실패 시 0회 성공으로 리셋 후 실패로 상태 변환
    await updatePatternCard(card.id, {
      status: 'fail',
      successCount: 0,
      lastSuccessAt: null,
      nextTestAt: null
    });
  }

  // 만약 현재 패턴 패널에 떠 있다면 패턴 카드 리스트 갱신
  if (selectedMainSentenceId) {
    renderPatternCards();
  }
}

// ==================== TTS & STT (WEB SPEECH API) ====================

// 영어 발음 재생 (TTS)
function playTTS(text) {
  if (!('speechSynthesis' in window)) {
    showToast("이 브라우저는 음성 합성을 지원하지 않습니다.", "error");
    return;
  }
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";

  const voices = window.speechSynthesis.getVoices();
  const enVoice = voices.find(v => v.lang.startsWith("en-US") && v.name.includes("Google")) ||
                  voices.find(v => v.lang.startsWith("en-US")) ||
                  voices.find(v => v.lang.startsWith("en"));
  if (enVoice) {
    utterance.voice = enVoice;
  }

  window.speechSynthesis.speak(utterance);
}

// 음성 입력받기 (STT)
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
}

let isInputRecording = false;

function startInputVoice(targetInputId, lang = "ko-KR") {
  if (!recognition) {
    showToast("이 브라우저에서는 음성 인식을 지원하지 않습니다. (크롬 권장)", "error");
    return;
  }

  if (isInputRecording) {
    recognition.stop();
    return;
  }

  recognition.lang = lang;
  let statusDiv = null;
  
  if (targetInputId.startsWith("main")) {
    statusDiv = document.getElementById("voice-recording-status-main");
  } else {
    statusDiv = document.getElementById("voice-recording-status-pattern");
  }

  recognition.onstart = () => {
    isInputRecording = true;
    if (statusDiv) statusDiv.style.display = "flex";
  };

  recognition.onresult = (event) => {
    let text = event.results[0][0].transcript;
    if (lang.startsWith("en")) {
      text = capitalizeEnglish(text);
    }
    document.getElementById(targetInputId).value = text;
  };

  recognition.onerror = (e) => {
    console.error("STT Input Error", e);
    showToast(`음성 인식 오류: ${e.error}`, "error");
  };

  recognition.onend = () => {
    isInputRecording = false;
    if (statusDiv) statusDiv.style.display = "none";
  };

  recognition.start();
}

// ==================== EVENT LISTENERS SETUP ====================
function safeAddListener(id, event, callback) {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener(event, callback);
  } else {
    console.warn(`Element with id "${id}" was not found in the DOM.`);
  }
}

// ==================== FLASH CARDS ====================
function updateFlashCardCounts() {
  const isSpeedy = document.getElementById("toggle-speedy-mode")?.checked || false;
  const failCount = patternCards.filter(c => c.status === 'fail').length;
  const successDueCards = patternCards.filter(c => {
    if (c.status !== 'success' || (c.successCount || 0) < 1 || (c.successCount || 0) >= 7) return false;
    let nextTestAt = parseDate(c.nextTestAt);
    if (isSpeedy && c.lastSuccessAt) {
      const lastSuccess = new Date(parseDate(c.lastSuccessAt));
      nextTestAt = new Date(lastSuccess.getTime() + 30000);
    }
    return nextTestAt ? (new Date() >= new Date(nextTestAt)) : true;
  });
  const successCount = successDueCards.length;

  const failBadge = document.getElementById('fail-fc-count');
  const successBadge = document.getElementById('success-fc-count');
  if (failBadge) failBadge.textContent = `${failCount}장`;
  if (successBadge) successBadge.textContent = `${successCount}장`;

  const startBtn = document.getElementById('btn-start-success-fc');
  const readyEl = document.getElementById('success-fc-ready');

  if (startBtn && readyEl) {
    if (successCount > 0) {
      startBtn.disabled = false;
      readyEl.innerHTML = `
        <div class="fc-ready-icon">🌟</div>
        <p>성공한 카드를 직접 복습해요.<br>맞추면 <strong>다음 단계</strong>로, 틀리면 <strong>실패</strong>로 이동해요!</p>
      `;
    } else {
      startBtn.disabled = true;
      const pendingSuccessCards = patternCards.filter(c => c.status === 'success' && (c.successCount || 0) < 7);
      if (pendingSuccessCards.length === 0) {
        readyEl.innerHTML = `
          <div class="fc-ready-icon">🌟</div>
          <p>성공한 카드가 아직 없습니다.<br>암기장에 패턴 카드를 추가하고 성공을 체크해 보세요! ✨</p>
        `;
      } else {
        const sorted = pendingSuccessCards.map(c => {
          let nextDate = parseDate(c.nextTestAt);
          if (isSpeedy && c.lastSuccessAt) {
            const lastSuccess = new Date(parseDate(c.lastSuccessAt));
            nextDate = new Date(lastSuccess.getTime() + 30000);
          }
          return {
            ...c,
            nextDate: nextDate
          };
        }).filter(c => c.nextDate && c.nextDate > new Date())
          .sort((a, b) => a.nextDate - b.nextDate);

        if (sorted.length > 0) {
          const earliest = sorted[0].nextDate;
          const diff = earliest - new Date();
          const seconds = Math.max(0, Math.floor((diff / 1000) % 60));
          const minutes = Math.max(0, Math.floor((diff / (1000 * 60)) % 60));
          const hours = Math.max(0, Math.floor((diff / (1000 * 60 * 60)) % 24));
          const days = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
          
          let timeStr = "";
          if (days > 0) timeStr = `${days}일 ${hours}시간 ${minutes}분`;
          else if (hours > 0) timeStr = `${hours}시간 ${minutes}분 ${seconds}초`;
          else if (minutes > 0) timeStr = `${minutes}분 ${seconds}초`;
          else timeStr = `${seconds}초`;

          readyEl.innerHTML = `
            <div class="fc-ready-icon">⏳</div>
            <p>복습 대기 중입니다.<br>다음 연습까지 남은 시간:<br><strong style="font-size: 1.25rem; color: #7AA2E3;">${timeStr}</strong></p>
          `;
        } else {
          readyEl.innerHTML = `
            <div class="fc-ready-icon">🌟</div>
            <p>복습할 카드가 없습니다.<br>새로운 카드를 연습해보세요!</p>
          `;
        }
      }
    }
  }
}

// ---------- 실패 카드 연습 ----------
function startFailPractice() {
  fcFailDeck = shuffleArray(patternCards.filter(c => c.status === 'fail'));
  fcFailIndex = 0;
  if (fcFailDeck.length === 0) {
    showToast('연습할 실패 카드가 없어요! 👍', 'info');
    return;
  }
  showFailFCCard();
}

// ==================== FLASH CARD INPUT & AUTO ADVANCE ====================
// Helper to evaluate typed or voice answer
function evaluateAnswer(section, userAnswer) {
  const card = section === 'fail' ? fcFailDeck[fcFailIndex] : fcSuccessDeck[fcSuccessIndex];
  if (!card) return;
  const normalized = userAnswer.trim().toLowerCase();
  const correct = normalized === card.english.trim().toLowerCase();

  // Show feedback and unblur english
  const feedbackEl = document.getElementById(`${section}-fc-feedback`);
  const englishEl  = document.getElementById(`${section}-fc-english`);
  const assessRow  = document.getElementById(`${section}-fc-assess-row`);

  if (englishEl) englishEl.classList.remove('blurred');
  if (feedbackEl) {
    feedbackEl.textContent = correct ? '🎉 정답입니다!' : `❌ 오답 — 정답: "${card.english}"`;
    feedbackEl.className   = `fc-feedback ${correct ? 'correct' : 'wrong'}`;
  }
  if (assessRow) assessRow.style.display = 'flex';

  const autoAdvance = document.getElementById(`${section}-fc-auto-advance`)?.checked;
  const proceed = () => {
    if (correct) {
      section === 'fail' ? handleFailCardCorrect() : handleSuccessCardCorrect();
    } else {
      section === 'fail' ? handleFailCardWrong() : handleSuccessCardWrong();
    }
  };

  if (autoAdvance) {
    const countdownEl = document.getElementById(`${section}-fc-countdown`);
    let remaining = 3;
    if (countdownEl) {
      countdownEl.textContent = `다음 카드까지 ${remaining}초`;
      countdownEl.style.display = 'block';
    }
    const timer = setInterval(() => {
      remaining -= 1;
      if (countdownEl) countdownEl.textContent = `다음 카드까지 ${remaining}초`;
      if (remaining <= 0) {
        clearInterval(timer);
        if (countdownEl) countdownEl.style.display = 'none';
        proceed();
      }
    }, 1000);
  } else {
    // Manual mode: just show buttons, don't auto-proceed
  }
}


// Voice recognition helper (Web Speech API)
function startVoiceRecognition(section) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast('음성 인식이 지원되지 않는 브라우저입니다.', 'warning');
    return;
  }
  const recog = new SpeechRecognition();
  recog.lang = 'en-US';
  recog.interimResults = false;
  recog.maxAlternatives = 1;

  const btn = document.getElementById(`${section}-fc-voice-btn`);
  if (btn) btn.classList.add('listening');

  recog.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    const inputEl = document.getElementById(`${section}-fc-input`);
    if (inputEl) inputEl.value = transcript;
    evaluateAnswer(section, transcript);
  };
  recog.onerror = (e) => {
    showToast('음성 인식 오류: ' + e.error, 'warning');
  };
  recog.onend = () => {
    if (btn) btn.classList.remove('listening');
  };
  recog.start();
}

// Event listeners for answer input & voice (added to setupEventListeners)
function addFlashCardInputListeners() {
  // ---------- 실패 카드 ----------
  safeAddListener('fail-fc-input', 'keypress', (e) => {
    if (e.key === 'Enter') {
      evaluateAnswer('fail', e.target.value);
    }
  });
  safeAddListener('fail-fc-submit-btn', 'click', () => {
    const val = document.getElementById('fail-fc-input').value;
    evaluateAnswer('fail', val);
  });
  safeAddListener('fail-fc-voice-btn', 'click', () => startVoiceRecognition('fail'));
  safeAddListener('fail-fc-force-success', 'click', async () => {
    await handleFailCardCorrect();
  });
  safeAddListener('fail-fc-next-btn', 'click', () => {
    if (isCurrentFCAroundCorrect) {
      handleFailCardCorrect();
    } else {
      handleFailCardWrong();
    }
  });

  // ---------- 성공 카드 ----------
  safeAddListener('success-fc-input', 'keypress', (e) => {
    if (e.key === 'Enter') {
      evaluateAnswer('success', e.target.value);
    }
  });
  safeAddListener('success-fc-submit-btn', 'click', () => {
    const val = document.getElementById('success-fc-input').value;
    evaluateAnswer('success', val);
  });
  safeAddListener('success-fc-voice-btn', 'click', () => startVoiceRecognition('success'));
  safeAddListener('success-fc-force-success', 'click', async () => {
    await handleSuccessCardCorrect();
  });
  safeAddListener('success-fc-next-btn', 'click', () => {
    if (isCurrentFCAroundCorrect) {
      handleSuccessCardCorrect();
    } else {
      handleSuccessCardWrong();
    }
  });
}

function showFailFCCard() {
  isCurrentFCAroundCorrect = false;
  const readyEl  = document.getElementById('fail-fc-ready');
  const arenaEl  = document.getElementById('fail-fc-arena');
  const doneEl   = document.getElementById('fail-fc-done');
  const startBtn = document.getElementById('btn-start-fail-fc');

  if (readyEl)  readyEl.style.display  = 'none';
  if (startBtn) startBtn.style.display = 'none';

  if (fcFailIndex >= fcFailDeck.length) {
    if (arenaEl) arenaEl.style.display = 'none';
    if (doneEl)  doneEl.style.display  = 'flex';
    updateFlashCardCounts();
    return;
  }

  if (arenaEl) arenaEl.style.display = 'block';
  if (doneEl)  doneEl.style.display  = 'none';

  const card    = fcFailDeck[fcFailIndex];
  const total   = fcFailDeck.length;
  const current = fcFailIndex + 1;

  const progressEl  = document.getElementById('fail-fc-progress');
  const fillEl      = document.getElementById('fail-fc-fill');
  const koreanEl    = document.getElementById('fail-fc-korean');
  const englishEl   = document.getElementById('fail-fc-english');
  const assessRow   = document.getElementById('fail-fc-assess-row');
  const feedbackEl  = document.getElementById('fail-fc-feedback');
  const inputEl     = document.getElementById('fail-fc-input');
  const countdownEl = document.getElementById('fail-fc-countdown');

  if (progressEl)  progressEl.textContent = `${current} / ${total}`;
  if (fillEl)      fillEl.style.width     = `${((current - 1) / total) * 100}%`;
  if (koreanEl)    koreanEl.textContent   = card.korean;
  if (englishEl)   { englishEl.textContent = card.english; englishEl.classList.add('blurred'); }
  if (assessRow)   assessRow.style.display = 'none';
  if (feedbackEl)  { feedbackEl.textContent = ''; feedbackEl.className = 'fc-feedback'; }
  if (inputEl)     inputEl.value = '';
  if (countdownEl) countdownEl.style.display = 'none';

  lucide.createIcons();
}

function revealFailCard() {
  // kept for backward compatibility but not called from HTML anymore
  const englishEl = document.getElementById('fail-fc-english');
  const assessRow = document.getElementById('fail-fc-assess-row');
  if (englishEl) englishEl.classList.remove('blurred');
  if (assessRow) assessRow.style.display = 'flex';
}

async function handleFailCardCorrect() {
  const card = fcFailDeck[fcFailIndex];
  if (!card) return;
  const isSpeedy = document.getElementById("toggle-speedy-mode")?.checked || false;
  const nextTest = calculateNextTestTime(1, isSpeedy);
  try {
    await updatePatternCard(card.id, {
      status: 'success',
      successCount: 1,
      lastSuccessAt: new Date(),
      nextTestAt: nextTest
    });
  } catch (e) {
    console.error("Failed to update pattern card:", e);
  }
  fcFailIndex++;
  showFailFCCard();
}

function handleFailCardWrong() {
  fcFailIndex++;
  showFailFCCard();
}

function restartFailPractice() {
  const readyEl  = document.getElementById('fail-fc-ready');
  const arenaEl  = document.getElementById('fail-fc-arena');
  const doneEl   = document.getElementById('fail-fc-done');
  const startBtn = document.getElementById('btn-start-fail-fc');
  if (readyEl)  readyEl.style.display  = 'flex';
  if (arenaEl)  arenaEl.style.display  = 'none';
  if (doneEl)   doneEl.style.display   = 'none';
  if (startBtn) startBtn.style.display = 'block';
  updateFlashCardCounts();
}

// ---------- 성공 카드 연습 ----------
function startSuccessPractice() {
  const isSpeedy = document.getElementById("toggle-speedy-mode")?.checked || false;
  fcSuccessDeck = shuffleArray(patternCards.filter(c => {
    if (c.status !== 'success' || (c.successCount || 0) < 1 || (c.successCount || 0) >= 7) return false;
    let nextTestAt = parseDate(c.nextTestAt);
    if (isSpeedy && c.lastSuccessAt) {
      const lastSuccess = new Date(parseDate(c.lastSuccessAt));
      nextTestAt = new Date(lastSuccess.getTime() + 30000);
    }
    return nextTestAt ? (new Date() >= new Date(nextTestAt)) : true;
  }));
  fcSuccessIndex = 0;
  if (fcSuccessDeck.length === 0) {
    showToast('연습할 성공 카드가 없어요! 먼저 복습 보관함에 카드를 추가해 보세요 ✨', 'info');
    return;
  }
  showSuccessFCCard();
}

function showSuccessFCCard() {
  isCurrentFCAroundCorrect = false;
  const readyEl  = document.getElementById('success-fc-ready');
  const arenaEl  = document.getElementById('success-fc-arena');
  const doneEl   = document.getElementById('success-fc-done');
  const startBtn = document.getElementById('btn-start-success-fc');

  if (readyEl)  readyEl.style.display  = 'none';
  if (startBtn) startBtn.style.display = 'none';

  if (fcSuccessIndex >= fcSuccessDeck.length) {
    if (arenaEl) arenaEl.style.display = 'none';
    if (doneEl)  doneEl.style.display  = 'flex';
    return;
  }

  if (arenaEl) arenaEl.style.display = 'block';
  if (doneEl)  doneEl.style.display  = 'none';

  const card    = fcSuccessDeck[fcSuccessIndex];
  const total   = fcSuccessDeck.length;
  const current = fcSuccessIndex + 1;

  const progressEl  = document.getElementById('success-fc-progress');
  const fillEl      = document.getElementById('success-fc-fill');
  const koreanEl    = document.getElementById('success-fc-korean');
  const englishEl   = document.getElementById('success-fc-english');
  const assessRow   = document.getElementById('success-fc-assess-row');
  const feedbackEl  = document.getElementById('success-fc-feedback');
  const inputEl     = document.getElementById('success-fc-input');
  const countdownEl = document.getElementById('success-fc-countdown');

  if (progressEl)  progressEl.textContent = `${current} / ${total}`;
  if (fillEl)      fillEl.style.width     = `${((current - 1) / total) * 100}%`;
  if (koreanEl)    koreanEl.textContent   = card.korean;
  if (englishEl)   { englishEl.textContent = card.english; englishEl.classList.add('blurred'); }
  if (assessRow)   assessRow.style.display = 'none';
  if (feedbackEl)  { feedbackEl.textContent = ''; feedbackEl.className = 'fc-feedback'; }
  if (inputEl)     inputEl.value = '';
  if (countdownEl) countdownEl.style.display = 'none';

  lucide.createIcons();
}

function revealSuccessCard() {
  // kept for backward compatibility
  const englishEl = document.getElementById('success-fc-english');
  const assessRow = document.getElementById('success-fc-assess-row');
  if (englishEl) englishEl.classList.remove('blurred');
  if (assessRow) assessRow.style.display = 'flex';
}

async function handleSuccessCardCorrect() {
  const card = fcSuccessDeck[fcSuccessIndex];
  if (!card) return;
  const newSuccessCount = Math.min((card.successCount || 0) + 1, 7);
  const isSpeedy = document.getElementById("toggle-speedy-mode")?.checked || false;
  const nextTest = calculateNextTestTime(newSuccessCount, isSpeedy);
  try {
    await updatePatternCard(card.id, {
      status: 'success',
      successCount: newSuccessCount,
      lastSuccessAt: new Date(),
      nextTestAt: nextTest
    });
  } catch (e) {
    console.error("Failed to update pattern card:", e);
  }
  fcSuccessIndex++;
  showSuccessFCCard();
}

async function handleSuccessCardWrong() {
  const card = fcSuccessDeck[fcSuccessIndex];
  if (!card) return;
  try {
    await updatePatternCard(card.id, {
      status: 'fail',
      successCount: 0,
      lastSuccessAt: null,
      nextTestAt: null
    });
  } catch (e) {
    console.error("Failed to update pattern card:", e);
  }
  fcSuccessIndex++;
  showSuccessFCCard();
}

function restartSuccessPractice() {
  const readyEl  = document.getElementById('success-fc-ready');
  const arenaEl  = document.getElementById('success-fc-arena');
  const doneEl   = document.getElementById('success-fc-done');
  const startBtn = document.getElementById('btn-start-success-fc');
  if (readyEl)  readyEl.style.display  = 'flex';
  if (arenaEl)  arenaEl.style.display  = 'none';
  if (doneEl)   doneEl.style.display   = 'none';
  if (startBtn) startBtn.style.display = 'block';
  updateFlashCardCounts();
}

let editingMainSentenceId = null;
let editingPatternCardId = null;

function openEditMainSentenceModal(id) {
  const sentence = mainSentences.find(s => s.id === id);
  if (!sentence) return;
  editingMainSentenceId = id;
  
  const titleEl = document.querySelector("#modal-add-main h3");
  if (titleEl) titleEl.innerText = "⭐ 대표 문장 편집";
  const btnSave = document.getElementById("btn-save-main");
  if (btnSave) btnSave.innerText = "수정 완료 🌸";
  
  document.getElementById("main-ko").value = sentence.korean;
  document.getElementById("main-en").value = sentence.english;
  
  openModal("modal-add-main");
}

async function updateMainSentence(id, ko, en) {
  const formattedEn = capitalizeEnglish(en);
  if (isFirebaseActive && db) {
    const docRef = doc(db, "users", nickname, "mainSentences", id);
    await updateDoc(docRef, {
      korean: ko,
      english: formattedEn
    });
  } else {
    const mainKey = `mock_mainSentences_${nickname}`;
    const list = JSON.parse(localStorage.getItem(mainKey) || "[]");
    const idx = list.findIndex(s => s.id === id);
    if (idx !== -1) {
      list[idx].korean = ko;
      list[idx].english = formattedEn;
      localStorage.setItem(mainKey, JSON.stringify(list));
      triggerLocalUpdate();
    }
  }
}

function openEditPatternCardModal(id) {
  const card = patternCards.find(c => c.id === id);
  if (!card) return;
  editingPatternCardId = id;
  
  const titleEl = document.querySelector("#modal-add-pattern h3");
  if (titleEl) titleEl.innerText = "💡 패턴 카드 편집";
  const btnSave = document.getElementById("btn-save-pattern");
  if (btnSave) btnSave.innerText = "수정 완료 🌸";
  
  const descEl = document.getElementById("add-pattern-parent-desc");
  const activeMain = mainSentences.find(s => s.id === card.mainSentenceId);
  if (descEl && activeMain) {
    descEl.innerText = `대표 문장: "${activeMain.english}"`;
  }
  
  document.getElementById("pattern-ko").value = card.korean;
  document.getElementById("pattern-en").value = card.english;
  
  openModal("modal-add-pattern");
}

async function updatePatternCardFields(id, ko, en) {
  const formattedEn = capitalizeEnglish(en);
  await updatePatternCard(id, {
    korean: ko,
    english: formattedEn
  });
}

function updateDarkModeIcon(isDark) {
  const icon = document.querySelector("#btn-dark-mode-toggle i");
  if (icon) {
    if (isDark) {
      icon.setAttribute("data-lucide", "sun");
    } else {
      icon.setAttribute("data-lucide", "moon");
    }
    lucide.createIcons();
  }
}

function setupEventListeners() {
  // 다크 모드 토글 및 초기화
  const darkBtn = document.getElementById("btn-dark-mode-toggle");
  if (darkBtn) {
    const isDark = localStorage.getItem("dark-mode") === "true";
    if (isDark) {
      document.body.classList.add("dark-mode");
      updateDarkModeIcon(true);
    } else {
      document.body.classList.remove("dark-mode");
      updateDarkModeIcon(false);
    }
    
    darkBtn.addEventListener("click", () => {
      const active = document.body.classList.toggle("dark-mode");
      localStorage.setItem("dark-mode", active);
      updateDarkModeIcon(active);
    });
  }

  // 플래시카드 입력 리스너 초기 활성화
  addFlashCardInputListeners();

  // 1. 닉네임 입력 후 엔터 쳤을 때
  safeAddListener("input-nickname", "keypress", (e) => {
    if (e.key === "Enter") handleAddNickname();
  });
  
  // 닉네임 입력란에 타핑 시 실시간으로 입장하기 버튼 노출 여부 제어
  safeAddListener("input-nickname", "input", (e) => {
    const value = e.target.value.trim();
    const loginBtn = document.getElementById("btn-login");
    const nicknames = allNicknames;
    
    if (nicknames.length === 0 || value !== "") {
      if (loginBtn) loginBtn.style.display = "block";
    } else {
      if (loginBtn) loginBtn.style.display = "none";
    }
  });
  
  // 닉네임 추가 플러스 단추 클릭
  safeAddListener("btn-add-nickname-submit", "click", handleAddNickname);

  // 닉네임 입장하기 단추 클릭 (닉네임 없을 때만 노출)
  const loginBtn = document.getElementById("btn-login");
  if (loginBtn) {
    loginBtn.addEventListener("click", handleAddNickname);
  }

  // 2. 로그아웃 (헤더 나가기 버튼)
  safeAddListener("btn-logout-header", "click", handleLogout);

  // 3. 닉네임 삭제 확인용 입력 텍스트 리스너
  safeAddListener("input-delete-nickname-confirm", "input", handleNicknameDeleteConfirmText);
  safeAddListener("btn-confirm-delete-nickname", "click", executeNicknameDeletion);
  
  // 닉네임 삭제 취소 바인딩
  safeAddListener("btn-close-delete-nickname-modal", "click", () => closeModal("modal-delete-nickname"));
  safeAddListener("btn-cancel-delete-nickname-modal", "click", () => closeModal("modal-delete-nickname"));

  // 4. 대표 문장 모달 컨트롤
  safeAddListener("btn-add-main", "click", () => {
    editingMainSentenceId = null;
    const titleEl = document.querySelector("#modal-add-main h3");
    if (titleEl) titleEl.innerText = "⭐ 새 대표 문장 추가";
    const btnSave = document.getElementById("btn-save-main");
    if (btnSave) btnSave.innerText = "추가 완료 🌸";

    const koEl = document.getElementById("main-ko");
    const enEl = document.getElementById("main-en");
    if (koEl) koEl.value = "";
    if (enEl) enEl.value = "";
    openModal("modal-add-main");
  });
  safeAddListener("btn-close-add-main-modal", "click", () => closeModal("modal-add-main"));
  safeAddListener("btn-cancel-add-main-modal", "click", () => closeModal("modal-add-main"));
  safeAddListener("btn-save-main", "click", async () => {
    const koEl = document.getElementById("main-ko");
    const enEl = document.getElementById("main-en");
    const ko = koEl ? koEl.value.trim() : "";
    const en = enEl ? enEl.value.trim() : "";
    if (!ko || !en) {
      showToast("한글 뜻과 영어 문장을 모두 입력해 주세요.", "error");
      return;
    }
    if (editingMainSentenceId) {
      await updateMainSentence(editingMainSentenceId, ko, en);
      editingMainSentenceId = null;
    } else {
      await addMainSentence(ko, en);
    }
    closeModal("modal-add-main");
  });

  // 5. 패턴 카드 모달 컨트롤
  safeAddListener("btn-add-pattern", "click", () => {
    editingPatternCardId = null;
    const titleEl = document.querySelector("#modal-add-pattern h3");
    if (titleEl) titleEl.innerText = "💡 새 패턴 카드 추가";
    const btnSave = document.getElementById("btn-save-pattern");
    if (btnSave) btnSave.innerText = "추가 완료 🌸";

    const activeMain = mainSentences.find(s => s.id === selectedMainSentenceId);
    if (!activeMain) return;
    const descEl = document.getElementById("add-pattern-parent-desc");
    if (descEl) descEl.innerText = `대표 문장: "${activeMain.english}"`;
    const koEl = document.getElementById("pattern-ko");
    const enEl = document.getElementById("pattern-en");
    if (koEl) koEl.value = "";
    if (enEl) enEl.value = "";
    openModal("modal-add-pattern");
  });
  safeAddListener("btn-close-add-pattern-modal", "click", () => closeModal("modal-add-pattern"));
  safeAddListener("btn-cancel-add-pattern-modal", "click", () => closeModal("modal-add-pattern"));
  safeAddListener("btn-save-pattern", "click", async () => {
    const koEl = document.getElementById("pattern-ko");
    const enEl = document.getElementById("pattern-en");
    const ko = koEl ? koEl.value.trim() : "";
    const en = enEl ? enEl.value.trim() : "";
    if (!ko || !en) {
      showToast("한글 뜻과 영어 문장을 모두 입력해 주세요.", "error");
      return;
    }
    if (editingPatternCardId) {
      await updatePatternCardFields(editingPatternCardId, ko, en);
      editingPatternCardId = null;
    } else {
      await addPatternCard(selectedMainSentenceId, ko, en);
    }
    closeModal("modal-add-pattern");
  });

  // 6. 음성 입력 버튼 바인딩 (STT)
  document.querySelectorAll(".btn-voice-input").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.target;
      const lang = btn.dataset.lang || "ko-KR";
      startInputVoice(target, lang);
    });
  });

  // 7. 탭 전환 처리
  document.querySelectorAll(".tab-navigation .tab-button").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-navigation .tab-button").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-section").forEach(s => s.classList.remove("active"));
      
      btn.classList.add("active");
      const tabId = btn.dataset.tab;
      const tabEl = document.getElementById(tabId);
      if (tabEl) tabEl.classList.add("active");

      // 다른 탭으로 이동할 때 우측 패턴 패널이 열려있다면 닫아줍니다.
      if (tabId !== "tab-deck") {
        closePatternPanel();
      }
    });
  });

  // 8. 가속 모드 변경 시 즉시 렌더링 갱신
  const speedyEl = document.getElementById("toggle-speedy-mode");
  if (speedyEl) {
    const isSpeedyStored = localStorage.getItem("speedy-mode") === "true";
    speedyEl.checked = isSpeedyStored;
    
    speedyEl.addEventListener("change", () => {
      localStorage.setItem("speedy-mode", speedyEl.checked);
      renderReviewSection();
      showToast(speedyEl.checked ? 
        "테스트용 가속 복습 모드가 활성화되었습니다! ⚡" : "복습 모드가 실서비스 모드로 복귀했습니다.", "info");
    });
  }

  // 9. 패턴 패널 닫기 버튼 및 뒷배경 클릭 처리
  safeAddListener("btn-close-pattern-panel", "click", closePatternPanel);
  safeAddListener("pattern-overlay-backdrop", "click", closePatternPanel);

  // 10. 패턴 패널 좌우 스와이프 시 닫고 대표 카드로 복귀 (알림 팝업 제거)
  const panel = document.getElementById("pattern-overlay-panel");
  if (panel) {
    registerSwipe(panel, () => {
      closePatternPanel();
    });
  }

  // 11. 순서 섞기 (셔플) 버튼 바인딩
  safeAddListener("btn-shuffle-main", "click", () => {
    shuffledMainSentences = shuffleArray(mainSentences);
    renderMainSentences();
  });

  safeAddListener("btn-shuffle-pattern", "click", () => {
    const filtered = patternCards.filter(c => c.mainSentenceId === selectedMainSentenceId);
    shuffledPatternCards = shuffleArray(filtered);
    renderPatternCards();
  });

  // 12. 플래시카드 이벤트 바인딩
  safeAddListener('btn-start-fail-fc',    'click', startFailPractice);
  safeAddListener('fail-fc-reveal-btn',   'click', revealFailCard);
  safeAddListener('fail-fc-correct-btn',  'click', handleFailCardCorrect);
  safeAddListener('fail-fc-wrong-btn',    'click', handleFailCardWrong);
  safeAddListener('fail-fc-restart-btn',  'click', restartFailPractice);

  safeAddListener('btn-start-success-fc',   'click', startSuccessPractice);
  safeAddListener('success-fc-reveal-btn',  'click', revealSuccessCard);
  safeAddListener('success-fc-correct-btn', 'click', handleSuccessCardCorrect);
  safeAddListener('success-fc-wrong-btn',   'click', handleSuccessCardWrong);
  safeAddListener('success-fc-restart-btn', 'click', restartSuccessPractice);
}

// ---------------- CARD INTERACTIONS ----------------
function setupMainSentenceCardClicks() {
  document.querySelectorAll("#main-sentences-list .sentence-card").forEach(card => {
    const enText = card.querySelector(".card-english");
    let startX = 0;
    let startY = 0;
    let isDown = false;
    let isDragging = false;

    // 1. 영어 길게 누르는 동안 노출 (홀드)
    const revealEnglish = (e) => {
      if (e.target.closest(".btn-delete") || e.target.closest(".btn-speak") || e.target.closest("button")) return;
      enText.classList.remove("blurred");
    };

    const blurEnglish = () => {
      enText.classList.add("blurred");
    };

    // 마우스 누름 시작
    card.addEventListener("mousedown", (e) => {
      if (e.target.closest(".btn-delete") || e.target.closest(".btn-speak") || e.target.closest("button")) return;
      revealEnglish(e);
      startX = e.clientX;
      startY = e.clientY;
      isDown = true;
      isDragging = false;
      card.style.transition = "none";
    });

    // 터치 누름 시작
    card.addEventListener("touchstart", (e) => {
      if (e.target.closest(".btn-delete") || e.target.closest(".btn-speak") || e.target.closest("button")) return;
      revealEnglish(e);
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      isDown = true;
      isDragging = false;
      card.style.transition = "none";
    }, { passive: true });

    // 공통 드래그 이동 함수 (움직임 반영)
    const handleMove = (currentX, currentY) => {
      if (!isDown) return;
      const diffX = currentX - startX;
      const diffY = currentY - startY;

      // 수평 성분이 더 큰 드래그가 감지되면 움직임 반영 (좌우로 플로팅)
      if (Math.abs(diffX) > 8 && Math.abs(diffX) > Math.abs(diffY)) {
        isDragging = true;
        // 카드가 손가락/마우스를 따라가며 둥둥 뜨는 플로팅 효과 적용
        card.style.transform = `translateX(${diffX}px) rotate(${diffX * 0.03}deg) scale(1.02)`;
        card.style.boxShadow = "0 15px 30px rgba(74, 63, 53, 0.15)";
        card.style.zIndex = "100";
      }
    };

    window.addEventListener("mousemove", (e) => {
      if (isDown) handleMove(e.clientX, e.clientY);
    });

    card.addEventListener("touchmove", (e) => {
      if (isDown) handleMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    // 공통 드래그 종료 함수 (복귀 또는 스와이프 전송)
    const handleEnd = (endX, endY) => {
      if (!isDown) return;
      isDown = false;
      blurEnglish();

      // 스냅백 복귀 애니메이션 적용
      card.style.transition = "transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), box-shadow 0.3s ease, scale 0.3s ease";
      card.style.transform = "";
      card.style.boxShadow = "";
      card.style.zIndex = "";

      const diffX = endX - startX;
      const diffY = endY - startY;

      // 60px 이상 가로 드래그되었을 경우 스와이프 전환 성공
      if (isDragging && Math.abs(diffX) > 60 && Math.abs(diffY) < 50) {
        const id = card.dataset.id;
        selectedMainSentenceId = id;
        document.querySelectorAll("#main-sentences-list .sentence-card").forEach(c => c.classList.remove("active"));
        card.classList.add("active");
        renderPatternCards();
      }
    };

    window.addEventListener("mouseup", (e) => {
      if (isDown) handleEnd(e.clientX, e.clientY);
    });

    card.addEventListener("touchend", (e) => {
      if (isDown) handleEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }, { passive: true });

    card.addEventListener("touchcancel", () => {
      if (isDown) {
        isDown = false;
        blurEnglish();
        card.style.transition = "transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)";
        card.style.transform = "";
        card.style.boxShadow = "";
        card.style.zIndex = "";
      }
    });

    // 대표문장 편집 버튼
    card.querySelector(".btn-edit-main").addEventListener("click", (e) => {
      e.stopPropagation();
      const id = e.currentTarget.dataset.id;
      openEditMainSentenceModal(id);
    });

    // 대표문장 삭제 버튼
    card.querySelector(".btn-delete").addEventListener("click", (e) => {
      e.stopPropagation();
      const id = e.currentTarget.dataset.id;
      deleteMainSentence(id);
    });

    // 대표문장 TTS 버튼
    card.querySelector(".btn-speak").addEventListener("click", (e) => {
      e.stopPropagation();
      const text = e.currentTarget.dataset.text;
      playTTS(text);
    });
  });
}

function setupPatternCardEvents() {
  // 패턴 카드 편집
  document.querySelectorAll(".btn-edit-pattern").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = e.currentTarget.dataset.id;
      openEditPatternCardModal(id);
    });
  });

  // 패턴 카드 삭제
  document.querySelectorAll(".btn-delete-pattern").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = e.currentTarget.dataset.id;
      deletePatternCard(id);
    });
  });

  // TTS
  document.querySelectorAll(".btn-speak").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const text = e.currentTarget.dataset.text;
      playTTS(text);
    });
  });

  // 패턴 카드 및 복습 카드의 hold-to-reveal (롱클릭/홀드 시 공개) 동작 바인딩
  document.querySelectorAll(".pattern-overlay-panel .sentence-card, #failed-cards-list .sentence-card, .success-groups-container .sentence-card").forEach(card => {
    const enText = card.querySelector(".card-english");
    if (!enText) return;

    let isDown = false;

    const revealEnglish = (e) => {
      if (e.target.closest(".btn-delete-pattern") || e.target.closest(".btn-speak") || e.target.closest("button")) return;
      enText.classList.remove("blurred");
    };

    const blurEnglish = () => {
      enText.classList.add("blurred");
    };

    card.addEventListener("mousedown", (e) => {
      if (e.target.closest(".btn-delete-pattern") || e.target.closest(".btn-speak") || e.target.closest("button")) return;
      revealEnglish(e);
      isDown = true;
    });

    card.addEventListener("touchstart", (e) => {
      if (e.target.closest(".btn-delete-pattern") || e.target.closest(".btn-speak") || e.target.closest("button")) return;
      revealEnglish(e);
      isDown = true;
    }, { passive: true });

    const handleEnd = () => {
      if (!isDown) return;
      isDown = false;
      blurEnglish();
    };

    window.addEventListener("mouseup", handleEnd);
    card.addEventListener("touchend", handleEnd, { passive: true });
    card.addEventListener("touchcancel", handleEnd);
  });

  // 자가 채점 성공/실패 버튼 클릭 바인딩
  document.querySelectorAll(".btn-assess-success").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      handleSelfAssessment(id, 'success');
    });
  });

  document.querySelectorAll(".btn-assess-fail").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      handleSelfAssessment(id, 'fail');
    });
  });
}

// 로그아웃
function handleLogout() {
  localStorage.removeItem("nickname");
  if (mainSentencesUnsubscribe) mainSentencesUnsubscribe();
  if (patternCardsUnsubscribe) patternCardsUnsubscribe();
  
  selectedMainSentenceId = null;
  mainSentences = [];
  patternCards = [];
  
  checkSession();
}

// ==================== COMMON UI MODALS & TOASTS ====================
function openModal(id) {
  document.getElementById(id).classList.add("active");
}

function closeModal(id) {
  document.getElementById(id).classList.remove("active");
  if (isInputRecording && recognition) {
    recognition.stop();
  }
}

// 모달을 닫는 글로벌 헬퍼로 노출
window.closeModal = closeModal;

function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  
  let icon = "info";
  if (type === "success") icon = "check-circle";
  if (type === "error") icon = "alert-triangle";
  if (type === "warning") icon = "alert-circle";

  toast.innerHTML = `<i data-lucide="${icon}"></i> <span>${message}</span>`;
  container.appendChild(toast);
  
  lucide.createIcons();

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// ==================== SWIPE GESTURE DETECTOR HELPER ====================
function registerSwipe(element, onSwipe) {
  let startX = 0;
  let startY = 0;
  let isDown = false;

  // 모바일 터치 감지
  element.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  element.addEventListener("touchend", (e) => {
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    handleSwipe(startX, endX, startY, endY);
  }, { passive: true });

  // 데스크톱 마우스 스와이프 감지
  element.addEventListener("mousedown", (e) => {
    if (e.target.closest(".btn-delete") || e.target.closest(".btn-speak") || e.target.closest(".btn-delete-pattern") || e.target.closest("button")) {
      return;
    }
    startX = e.clientX;
    startY = e.clientY;
    isDown = true;
  });

  element.addEventListener("mouseup", (e) => {
    if (!isDown) return;
    isDown = false;
    const endX = e.clientX;
    const endY = e.clientY;
    handleSwipe(startX, endX, startY, endY);
  });

  element.addEventListener("mouseleave", () => {
    isDown = false;
  });

  function handleSwipe(sX, eX, sY, eY) {
    const diffX = eX - sX;
    const diffY = eY - sY;

    // 수평 스와이프 판정 (60px 이상 이동 및 수직 변동성 50px 이하)
    if (Math.abs(diffX) > 60 && Math.abs(diffY) < 50) {
      onSwipe(diffX < 0 ? "left" : "right");
    }
  }
}
