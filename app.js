// Import Firebase SDK (from ESM CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, doc, collection, addDoc, updateDoc, deleteDoc, onSnapshot 
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

// ==================== INITIALIZATION ====================
document.addEventListener("DOMContentLoaded", () => {
  // 1. Firebase Config 로드 및 초기화
  let firebaseConfig = null;
  const storedConfig = localStorage.getItem("firebase_config");
  
  if (storedConfig) {
    try {
      firebaseConfig = JSON.parse(storedConfig);
    } catch (e) {
      console.error("Stored Firebase configuration is invalid:", e);
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
      document.getElementById("local-mode-badge").style.display = "inline-flex";
    }
  } else {
    // 설정이 없을 때 임시 로컬 모드로 작동
    isFirebaseActive = false;
    document.getElementById("local-mode-badge").style.display = "inline-flex";
  }

  // 2. UI 초기화 및 세션 체크
  checkSession();
  setupEventListeners();
  startCountdownTimer();
});

// ==================== SESSION & LOGIN ====================
function checkSession() {
  const savedNickname = localStorage.getItem("nickname");
  if (savedNickname) {
    nickname = savedNickname;
    document.getElementById("user-display-name").innerText = nickname;
    document.getElementById("user-badge").style.display = "flex";
    document.getElementById("auth-view").style.display = "none";
    document.getElementById("main-view").style.display = "block";
    startSync();
  } else {
    document.getElementById("user-badge").style.display = "none";
    document.getElementById("auth-view").style.display = "flex";
    document.getElementById("main-view").style.display = "none";
  }
}

function handleLogin() {
  const input = document.getElementById("input-nickname");
  const value = input.value.trim();
  if (value === "") {
    showToast("닉네임을 입력해 주세요!", "error");
    return;
  }
  localStorage.setItem("nickname", value);
  checkSession();
  showToast(`${value}님, 환영합니다! 🧸`, "success");
}

function handleLogout() {
  localStorage.removeItem("nickname");
  // Subscriptions 해제
  if (mainSentencesUnsubscribe) mainSentencesUnsubscribe();
  if (patternCardsUnsubscribe) patternCardsUnsubscribe();
  
  selectedMainSentenceId = null;
  mainSentences = [];
  patternCards = [];
  
  checkSession();
  showToast("로그아웃되었습니다.", "info");
}

// ==================== FIREBASE/MOCK SYNC & CRUD ====================
function startSync() {
  if (mainSentencesUnsubscribe) mainSentencesUnsubscribe();
  if (patternCardsUnsubscribe) patternCardsUnsubscribe();

  if (isFirebaseActive && db) {
    // Firestore 실시간 동기화
    const mainColRef = collection(db, "users", nickname, "mainSentences");
    mainSentencesUnsubscribe = onSnapshot(mainColRef, (snapshot) => {
      mainSentences = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      // 생성일 내림차순 정렬
      mainSentences.sort((a, b) => new Date(parseDate(b.createdAt)) - new Date(parseDate(a.createdAt)));
      renderMainSentences();
      renderReviewSection();
    }, (error) => {
      console.error("Firestore mainSentences Sync Error:", error);
      showToast("서버 동기화 실패. 보안 규칙 및 설정을 확인하세요.", "error");
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
    });
  } else {
    // 임시 로컬 스토리지 동기화
    triggerLocalUpdate();
  }
}

function triggerLocalUpdate() {
  if (isFirebaseActive) return;

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
  // Firebase Timestamp 또는 ISO String 처리
  if (val && val.toDate) {
    return val.toDate();
  }
  return val;
}

// ---------------- CRUD API ----------------
async function addMainSentence(ko, en) {
  if (isFirebaseActive && db) {
    const colRef = collection(db, "users", nickname, "mainSentences");
    await addDoc(colRef, {
      korean: ko,
      english: en,
      createdAt: new Date()
    });
  } else {
    const mainKey = `mock_mainSentences_${nickname}`;
    const list = JSON.parse(localStorage.getItem(mainKey) || "[]");
    list.push({
      id: "mock_main_" + Date.now() + "_" + Math.floor(Math.random()*1000),
      korean: ko,
      english: en,
      createdAt: new Date().toISOString()
    });
    localStorage.setItem(mainKey, JSON.stringify(list));
    triggerLocalUpdate();
  }
  showToast("대표 문장이 등록되었습니다.", "success");
}

async function addPatternCard(mainSentenceId, ko, en) {
  if (isFirebaseActive && db) {
    const colRef = collection(db, "users", nickname, "patternCards");
    await addDoc(colRef, {
      mainSentenceId: mainSentenceId,
      korean: ko,
      english: en,
      status: 'new', // new, success, fail
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
      english: en,
      status: 'new',
      successCount: 0,
      lastSuccessAt: null,
      nextTestAt: null,
      createdAt: new Date().toISOString()
    });
    localStorage.setItem(patternKey, JSON.stringify(list));
    triggerLocalUpdate();
  }
  showToast("패턴 카드가 등록되었습니다.", "success");
}

async function deleteMainSentence(id) {
  if (confirm("이 대표 문장과 관련된 모든 패턴 카드가 함께 삭제됩니다. 정말 삭제하시겠습니까?")) {
    if (isFirebaseActive && db) {
      // 대표 문장 삭제
      const docRef = doc(db, "users", nickname, "mainSentences", id);
      await deleteDoc(docRef);

      // 하위 패턴 카드들 일괄 삭제
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
      renderPatternCards();
    }
    showToast("대표 문장과 관련 패턴 카드가 삭제되었습니다.", "info");
  }
}

async function deletePatternCard(id) {
  if (confirm("이 패턴 카드를 삭제하시겠습니까?")) {
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
    showToast("패턴 카드가 삭제되었습니다.", "info");
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
        // 로컬스토리지 저장을 위해 Date 객체를 ISO String으로 변환
        lastSuccessAt: updates.lastSuccessAt instanceof Date ? updates.lastSuccessAt.toISOString() : updates.lastSuccessAt,
        nextTestAt: updates.nextTestAt instanceof Date ? updates.nextTestAt.toISOString() : updates.nextTestAt,
      };
      localStorage.setItem(patternKey, JSON.stringify(list));
      triggerLocalUpdate();
    }
  }
}

// ==================== RENDERING UI ====================

// 1. 대표 문장 카드 렌더링
function renderMainSentences() {
  const container = document.getElementById("main-sentences-list");
  if (mainSentences.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>등록된 대표 문장이 없습니다.<br>첫 번째 대표 문장을 등록해 보세요! ⭐</p>
      </div>`;
    return;
  }

  container.innerHTML = mainSentences.map(sentence => {
    const isActive = sentence.id === selectedMainSentenceId ? "active" : "";
    return `
      <div class="sentence-card ${isActive}" data-id="${sentence.id}">
        <div class="card-top">
          <span class="card-badge">대표 문장</span>
          <button class="btn-card-action btn-delete" data-id="${sentence.id}" title="삭제">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
        <div class="card-korean">${sentence.korean}</div>
        <div class="card-english-wrapper">
          <div class="card-english blurred" id="en-${sentence.id}">${sentence.english}</div>
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

// 2. 패턴 카드 렌더링
function renderPatternCards() {
  const container = document.getElementById("pattern-cards-list");
  const column = document.getElementById("pattern-column");
  const hint = document.getElementById("pattern-select-hint");
  const btnAdd = document.getElementById("btn-add-pattern");

  if (!selectedMainSentenceId) {
    column.classList.add("disabled");
    hint.style.display = "flex";
    container.style.display = "none";
    btnAdd.disabled = true;
    return;
  }

  column.classList.remove("disabled");
  hint.style.display = "none";
  container.style.display = "flex";
  btnAdd.disabled = false;

  // 선택된 대표 문장 정보 로드
  const activeMain = mainSentences.find(s => s.id === selectedMainSentenceId);
  if (activeMain) {
    document.getElementById("pattern-column-title").innerHTML = `
      <span class="emoji">💡</span> "${activeMain.korean}" 패턴 카드
    `;
  }

  const filteredCards = patternCards.filter(c => c.mainSentenceId === selectedMainSentenceId);

  if (filteredCards.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>선택한 대표 문장에 속한 패턴 카드가 없습니다.<br>상단의 "패턴 카드 추가" 버튼을 눌러 추가해 보세요!</p>
      </div>`;
    return;
  }

  container.innerHTML = filteredCards.map(card => {
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
          <span class="card-badge ${badgeClass}">${statusText}</span>
          <button class="btn-card-action btn-delete-pattern" data-id="${card.id}" title="삭제">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
        <div class="card-korean">${card.korean}</div>
        <div class="card-english-wrapper">
          <div class="card-english blurred" id="en-${card.id}">${card.english}</div>
          <button class="btn-card-action btn-speak" data-text="${card.english}" title="발음 듣기">
            <i data-lucide="volume-2"></i>
          </button>
        </div>
        <div class="card-controls">
          <button class="btn-card-control btn-game-play" data-id="${card.id}">
            <i data-lucide="mic"></i> 테스트
          </button>
        </div>
      </div>
    `;
  }).join("");

  lucide.createIcons();
  setupPatternCardEvents();
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
    failedContainer.innerHTML = failedList.map(card => `
      <div class="sentence-card" id="card-${card.id}">
        <div class="card-top">
          <span class="card-badge badge-fail">실패</span>
          <button class="btn-card-action btn-delete-pattern" data-id="${card.id}">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
        <div class="card-korean">${card.korean}</div>
        <div class="card-english-wrapper">
          <div class="card-english blurred" id="en-${card.id}">${card.english}</div>
          <button class="btn-card-action btn-speak" data-text="${card.english}">
            <i data-lucide="volume-2"></i>
          </button>
        </div>
        <div class="card-controls">
          <button class="btn-card-control btn-game-play btn-game-danger" data-id="${card.id}">
            <i data-lucide="rotate-ccw"></i> 재테스트
          </button>
        </div>
      </div>
    `).join("");
  }

  // 성공한 카드 (1회 ~ 6회 이상 단계)
  const readyCardsCount = { val: 0 }; // 복습 가능한 카드 수 카운트용 객체 (레퍼런스 전달을 위해)
  
  for (let i = 1; i <= 6; i++) {
    const stageContainer = document.getElementById(`success-stage-${i}`);
    let stageList = [];
    if (i === 6) {
      stageList = patternCards.filter(c => c.status === 'success' && c.successCount >= 6);
    } else {
      stageList = patternCards.filter(c => c.status === 'success' && c.successCount === i);
    }

    if (stageList.length === 0) {
      stageContainer.innerHTML = `<div class="empty-state-small" style="grid-column: 1 / -1;">비어 있음</div>`;
    } else {
      stageContainer.innerHTML = stageList.map(card => {
        const nextTestAt = parseDate(card.nextTestAt);
        const isReady = nextTestAt ? (new Date() >= new Date(nextTestAt)) : true;
        const testDisabledAttr = isReady ? "" : "disabled";
        
        if (isReady) {
          readyCardsCount.val++;
        }

        return `
          <div class="sentence-card" id="card-${card.id}">
            <div class="card-top">
              <span class="card-badge badge-success">${card.successCount}회 성공</span>
              <button class="btn-card-action btn-delete-pattern" data-id="${card.id}">
                <i data-lucide="trash-2"></i>
              </button>
            </div>
            <div class="card-korean">${card.korean}</div>
            <div class="card-english-wrapper">
              <div class="card-english blurred" id="en-${card.id}">${card.english}</div>
              <button class="btn-card-action btn-speak" data-text="${card.english}">
                <i data-lucide="volume-2"></i>
              </button>
            </div>
            <div class="card-controls">
              <div class="countdown-timer-text" data-next-test-at="${nextTestAt ? new Date(nextTestAt).toISOString() : ''}">
                ⏳ 계산 중...
              </div>
              <button class="btn-card-control btn-game-play" data-id="${card.id}" ${testDisabledAttr}>
                <i data-lucide="mic"></i> 복습
              </button>
            </div>
          </div>
        `;
      }).join("");
    }
  }

  // 상단 탭 복습 배지 카운트 업데이트 (실패 카드 + 대기 끝난 성공 카드)
  const totalReviewNeed = failedList.length + readyCardsCount.val;
  const badge = document.getElementById("review-count-badge");
  badge.innerText = totalReviewNeed;
  badge.style.display = totalReviewNeed > 0 ? "inline-block" : "none";

  lucide.createIcons();
  setupPatternCardEvents();
}

// 4. 타이머 카운트다운 로직 (실시간)
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

      const cardElement = timer.closest(".sentence-card");
      const testBtn = cardElement ? cardElement.querySelector(".btn-game-play") : null;

      if (diff <= 0) {
        timer.className = "countdown-timer-text ready";
        timer.innerHTML = "⭐ 테스트 가능!";
        if (testBtn) testBtn.disabled = false;
      } else {
        timer.className = "countdown-timer-text";
        if (testBtn) testBtn.disabled = true;

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
    // 가속 테스트 모드: 10초, 30초, 1분, 2분, 5분, 10분
    const speedyIntervals = [
      10 * 1000,          // 1회: 10초
      30 * 1000,          // 2회: 30초
      60 * 1000,          // 3회: 1분
      120 * 1000,         // 4회: 2분
      300 * 1000,         // 5회: 5분
      600 * 1000          // 6회 이상: 10분
    ];
    const idx = Math.min(successCount - 1, speedyIntervals.length - 1);
    msToAdd = speedyIntervals[idx];
  } else {
    // 실서비스 모드: 2주, 1달, 3달, 6달, 1년, 2년
    const DAY = 24 * 60 * 60 * 1000;
    const intervals = [
      14 * DAY,           // 1회: 2주
      30 * DAY,           // 2회: 1달
      90 * DAY,           // 3회: 3달
      180 * DAY,          // 4회: 6달
      365 * DAY,          // 5회: 1년
      730 * DAY           // 6회 이상: 2년
    ];
    const idx = Math.min(successCount - 1, intervals.length - 1);
    msToAdd = intervals[idx];
  }

  return new Date(now.getTime() + msToAdd);
}

// ==================== TTS & STT (WEB SPEECH API) ====================

// 1. 영어 텍스트 발음해주기 (TTS)
function playTTS(text) {
  if (!('speechSynthesis' in window)) {
    showToast("이 브라우저는 음성 합성을 지원하지 않습니다.", "error");
    return;
  }
  
  // 이전 음성 중단
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";

  // 영어 원어민 음성 설정 시도
  const voices = window.speechSynthesis.getVoices();
  const enVoice = voices.find(v => v.lang.startsWith("en-US") && v.name.includes("Google")) ||
                  voices.find(v => v.lang.startsWith("en-US")) ||
                  voices.find(v => v.lang.startsWith("en"));
  if (enVoice) {
    utterance.voice = enVoice;
  }

  window.speechSynthesis.speak(utterance);
}

// 2. 음성 입력받기 (STT)
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
    const text = event.results[0][0].transcript;
    document.getElementById(targetInputId).value = text;
    showToast(`음성 인식 성공: "${text}"`, "success");
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

// 3. 게임 모드 음성 감지
let gameRecognition = null;
if (SpeechRecognition) {
  gameRecognition = new SpeechRecognition();
  gameRecognition.continuous = false;
  gameRecognition.interimResults = false;
  gameRecognition.lang = "en-US";
}

let isGameRecording = false;
let gameSpeechResultText = "";
let currentTestingCard = null;

function handleGameVoiceStart() {
  if (!gameRecognition) {
    showToast("이 브라우저에서는 음성 인식을 지원하지 않습니다.", "error");
    return;
  }

  if (isGameRecording) {
    gameRecognition.stop();
    return;
  }

  gameRecognition.onstart = () => {
    isGameRecording = true;
    document.getElementById("btn-game-mic").classList.add("recording");
    document.getElementById("game-wave").style.display = "flex";
    document.getElementById("game-mic-instruction").innerText = "마이크에 대고 문장을 또박또박 읽어주세요! 🎙️";
    
    const char = document.getElementById("cute-character-emoji");
    char.innerText = "🐰"; // 귀여운 귀 쫑긋 토끼
    char.classList.add("talking");
  };

  gameRecognition.onresult = (event) => {
    gameSpeechResultText = event.results[0][0].transcript;
    evaluateGameAttempt(gameSpeechResultText);
  };

  gameRecognition.onerror = (e) => {
    console.error("Game STT error:", e);
    showToast("목소리가 잘 들리지 않았어요. 다시 한번 마이크를 누르고 말씀해 주세요.", "error");
    document.getElementById("cute-character-emoji").innerText = "🧸";
  };

  gameRecognition.onend = () => {
    isGameRecording = false;
    document.getElementById("btn-game-mic").classList.remove("recording");
    document.getElementById("game-wave").style.display = "none";
    document.getElementById("cute-character-emoji").classList.remove("talking");
  };

  gameRecognition.start();
}

// 영어 정밀 가림 처리 해제 및 소문자 정규화 매칭
function evaluateGameAttempt(speechText) {
  const targetText = currentTestingCard.english;
  
  const cleanSpeech = normalizeSentence(speechText);
  const cleanTarget = normalizeSentence(targetText);

  const isSuccess = cleanSpeech === cleanTarget;

  const resultContainer = document.getElementById("game-result-container");
  const resultBadge = document.getElementById("game-result-badge");
  const userSpeechVal = document.getElementById("game-user-speech");
  const actualEnglishVal = document.getElementById("game-actual-english");
  const char = document.getElementById("cute-character-emoji");

  userSpeechVal.innerText = `"${speechText}"`;
  actualEnglishVal.innerText = `"${targetText}"`;
  resultContainer.style.display = "block";

  if (isSuccess) {
    resultContainer.className = "game-result-container success";
    resultBadge.innerText = "성공 🎉";
    char.innerText = "😸"; // 신난 야옹이
    currentTestingCard.gameOutcome = 'success';
    document.getElementById("btn-game-confirm").style.display = "inline-flex";
    document.getElementById("btn-game-retry").style.display = "none";
    showToast("완벽해요! 성공하셨습니다.", "success");
  } else {
    resultContainer.className = "game-result-container fail";
    resultBadge.innerText = "실패 😢";
    char.innerText = "😿"; // 시무룩 야옹이
    currentTestingCard.gameOutcome = 'fail';
    document.getElementById("btn-game-retry").style.display = "inline-flex";
    document.getElementById("btn-game-confirm").style.display = "inline-flex";
    showToast("아쉽네요! 발음이 정답과 맞지 않습니다.", "error");
  }
}

// 문장 정규화 (대소문자 무시, 쉼표, 온점, 물음표 등 제거)
function normalizeSentence(text) {
  if (!text) return "";
  return text.toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function handleGameFinish() {
  if (!currentTestingCard) return;

  const isSpeedy = document.getElementById("toggle-speedy-mode").checked;

  if (currentTestingCard.gameOutcome === 'success') {
    const newSuccessCount = (currentTestingCard.successCount || 0) + 1;
    const nextTest = calculateNextTestTime(newSuccessCount, isSpeedy);

    await updatePatternCard(currentTestingCard.id, {
      status: 'success',
      successCount: newSuccessCount,
      lastSuccessAt: new Date(),
      nextTestAt: nextTest
    });
    
  } else {
    // 실패 시 0회 성공 상태로 복귀 및 실패 처리
    await updatePatternCard(currentTestingCard.id, {
      status: 'fail',
      successCount: 0,
      lastSuccessAt: null,
      nextTestAt: null
    });
  }

  closeModal("modal-game");
}

// ==================== EVENT LISTENERS SETUP ====================
function setupEventListeners() {
  // 1. 닉네임 입력 이벤트
  document.getElementById("btn-login").addEventListener("click", handleLogin);
  document.getElementById("input-nickname").addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleLogin();
  });

  // 2. 로그아웃
  document.getElementById("btn-logout").addEventListener("click", handleLogout);

  // 3. Firebase Config 저장
  document.getElementById("btn-firebase-config").addEventListener("click", () => {
    const config = localStorage.getItem("firebase_config");
    if (config) {
      try {
        document.getElementById("textarea-config").value = JSON.stringify(JSON.parse(config), null, 2);
      } catch (e) {
        document.getElementById("textarea-config").value = config;
      }
    } else {
      document.getElementById("textarea-config").value = "";
    }
    openModal("modal-firebase");
  });

  document.getElementById("btn-save-config").addEventListener("click", () => {
    const configVal = document.getElementById("textarea-config").value.trim();
    if (configVal === "") {
      localStorage.removeItem("firebase_config");
      showToast("설정이 초기화되었습니다. 로컬 모드로 리로딩합니다.", "warning");
      setTimeout(() => window.location.reload(), 1200);
      return;
    }

    try {
      // 복사-붙여넣기 유연성 제공: JavaScript Object 형태도 파싱 가능하게 변환
      let parsed = {};
      if (configVal.includes("apiKey")) {
        let content = configVal;
        // 중괄호 바깥 제거 시도
        const start = content.indexOf("{");
        const end = content.lastIndexOf("}");
        if (start !== -1 && end !== -1) {
          content = content.substring(start, end + 1);
        }
        // 안전한 객체 파싱 (Function 생성자 활용)
        parsed = new Function(`return ${content}`)();
      } else {
        parsed = JSON.parse(configVal);
      }

      if (!parsed.apiKey || !parsed.projectId) {
        throw new Error("필수 키(apiKey, projectId) 누락");
      }

      localStorage.setItem("firebase_config", JSON.stringify(parsed));
      showToast("설정이 저장되었습니다! 실시간 연동을 위해 화면을 새로고침합니다.", "success");
      closeModal("modal-firebase");
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      console.error(e);
      showToast("Firebase Config 형식이 올바르지 않습니다. 복사한 값을 그대로 붙여넣어 주세요.", "error");
    }
  });

  // Firebase Config 모달 닫기
  document.getElementById("btn-close-firebase-modal").addEventListener("click", () => closeModal("modal-firebase"));
  document.getElementById("btn-cancel-firebase-modal").addEventListener("click", () => closeModal("modal-firebase"));

  // 4. 대표 문장 모달 컨트롤
  document.getElementById("btn-add-main").addEventListener("click", () => {
    document.getElementById("main-ko").value = "";
    document.getElementById("main-en").value = "";
    openModal("modal-add-main");
  });
  document.getElementById("btn-close-add-main-modal").addEventListener("click", () => closeModal("modal-add-main"));
  document.getElementById("btn-cancel-add-main-modal").addEventListener("click", () => closeModal("modal-add-main"));
  document.getElementById("btn-save-main").addEventListener("click", async () => {
    const ko = document.getElementById("main-ko").value.trim();
    const en = document.getElementById("main-en").value.trim();
    if (!ko || !en) {
      showToast("한글 뜻과 영어 문장을 모두 입력해 주세요.", "error");
      return;
    }
    await addMainSentence(ko, en);
    closeModal("modal-add-main");
  });

  // 5. 패턴 카드 모달 컨트롤
  document.getElementById("btn-add-pattern").addEventListener("click", () => {
    const activeMain = mainSentences.find(s => s.id === selectedMainSentenceId);
    if (!activeMain) return;
    document.getElementById("add-pattern-parent-desc").innerText = `대표 문장: "${activeMain.korean}"`;
    document.getElementById("pattern-ko").value = "";
    document.getElementById("pattern-en").value = "";
    openModal("modal-add-pattern");
  });
  document.getElementById("btn-close-add-pattern-modal").addEventListener("click", () => closeModal("modal-add-pattern"));
  document.getElementById("btn-cancel-add-pattern-modal").addEventListener("click", () => closeModal("modal-add-pattern"));
  document.getElementById("btn-save-pattern").addEventListener("click", async () => {
    const ko = document.getElementById("pattern-ko").value.trim();
    const en = document.getElementById("pattern-en").value.trim();
    if (!ko || !en) {
      showToast("한글 뜻과 영어 문장을 모두 입력해 주세요.", "error");
      return;
    }
    await addPatternCard(selectedMainSentenceId, ko, en);
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

  // 7. 게임 모드 이벤트 바인딩
  document.getElementById("btn-game-mic").addEventListener("click", handleGameVoiceStart);
  document.getElementById("btn-game-retry").addEventListener("click", () => {
    // Reset Game Attempt UI
    document.getElementById("game-result-container").style.display = "none";
    document.getElementById("btn-game-retry").style.display = "none";
    document.getElementById("btn-game-confirm").style.display = "none";
    document.getElementById("cute-character-emoji").innerText = "🧸";
    handleGameVoiceStart();
  });
  document.getElementById("btn-game-confirm").addEventListener("click", handleGameFinish);
  document.getElementById("btn-close-game-modal").addEventListener("click", () => closeModal("modal-game"));
  document.getElementById("btn-cancel-game-modal").addEventListener("click", () => closeModal("modal-game"));
  document.getElementById("btn-game-reveal").addEventListener("click", () => {
    document.getElementById("game-english-target").classList.remove("hidden");
    document.getElementById("btn-game-reveal").style.display = "none";
  });

  // 8. 탭 전환 처리
  document.querySelectorAll(".tab-navigation .tab-button").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-navigation .tab-button").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-section").forEach(s => s.classList.remove("active"));
      
      btn.classList.add("active");
      const tabId = btn.dataset.tab;
      document.getElementById(tabId).classList.add("active");
    });
  });

  // 9. 가속 모드 변경 시 즉시 렌더링 갱신
  document.getElementById("toggle-speedy-mode").addEventListener("change", () => {
    renderReviewSection();
    showToast(document.getElementById("toggle-speedy-mode").checked ? 
      "테스트용 가속 복습 모드가 활성화되었습니다! ⚡" : "복습 모드가 실서비스 모드로 복귀했습니다.", "info");
  });
}

// ---------------- CARD INTERACTIONS ----------------
function setupMainSentenceCardClicks() {
  document.querySelectorAll("#main-sentences-list .sentence-card").forEach(card => {
    // 카드 클릭시 패턴 선택 처리 (삭제 버튼 제외)
    card.addEventListener("click", (e) => {
      if (e.target.closest(".btn-delete") || e.target.closest(".btn-speak")) {
        return;
      }
      const id = card.dataset.id;
      
      // 토글 방식
      if (selectedMainSentenceId === id) {
        selectedMainSentenceId = null;
      } else {
        selectedMainSentenceId = id;
      }
      
      document.querySelectorAll("#main-sentences-list .sentence-card").forEach(c => c.classList.remove("active"));
      if (selectedMainSentenceId) {
        card.classList.add("active");
      }
      
      renderPatternCards();
    });

    // 삭제 버튼 바인딩
    card.querySelector(".btn-delete").addEventListener("click", (e) => {
      e.stopPropagation();
      const id = e.currentTarget.dataset.id;
      deleteMainSentence(id);
    });

    // TTS 버튼 바인딩
    card.querySelector(".btn-speak").addEventListener("click", (e) => {
      e.stopPropagation();
      const text = e.currentTarget.dataset.text;
      playTTS(text);
    });

    // 영어 글자 클릭시 가림 해제 토글
    const enText = card.querySelector(".card-english");
    enText.addEventListener("click", (e) => {
      e.stopPropagation();
      enText.classList.toggle("blurred");
    });
  });
}

function setupPatternCardEvents() {
  // 패턴 삭제
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

  // 영어 텍스트 블러 토글
  document.querySelectorAll(".card-english").forEach(el => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      el.classList.toggle("blurred");
    });
  });

  // 테스트 게임 시작
  document.querySelectorAll(".btn-game-play").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = e.currentTarget.dataset.id;
      const card = patternCards.find(c => c.id === id);
      if (card) {
        startGameTest(card);
      }
    });
  });
}

function startGameTest(card) {
  currentTestingCard = card;
  gameSpeechResultText = "";

  // UI 세팅
  let levelText = "신규 학습";
  if (card.status === 'success') levelText = `복습 (${card.successCount}회 성공)`;
  if (card.status === 'fail') levelText = "재도전 (실패 카드)";

  document.getElementById("game-card-stage").innerText = levelText;
  document.getElementById("game-korean-text").innerText = card.korean;
  document.getElementById("game-english-target").innerText = card.english;
  document.getElementById("game-english-target").classList.add("hidden");
  document.getElementById("btn-game-reveal").style.display = "inline-flex";

  // 상태 초기화
  document.getElementById("game-result-container").style.display = "none";
  document.getElementById("btn-game-retry").style.display = "none";
  document.getElementById("btn-game-confirm").style.display = "none";
  
  const micBtn = document.getElementById("btn-game-mic");
  micBtn.className = "btn-game-mic";
  document.getElementById("game-mic-instruction").innerText = "마이크 버튼을 클릭하고 영어 문장을 읽어주세요!";
  document.getElementById("game-wave").style.display = "none";

  const char = document.getElementById("cute-character-emoji");
  char.className = "cute-character";
  char.innerText = "🧸";

  openModal("modal-game");
}

// ==================== COMMON UI MODALS & TOASTS ====================
function openModal(id) {
  document.getElementById(id).classList.add("active");
}

function closeModal(id) {
  document.getElementById(id).classList.remove("active");
  
  // 만약 음성인식 진행 중이면 일시중지
  if (isInputRecording && recognition) {
    recognition.stop();
  }
  if (isGameRecording && gameRecognition) {
    gameRecognition.stop();
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

  // 3초 후 자동 제거
  setTimeout(() => {
    toast.remove();
  }, 3000);
}
