# 📝 영어 암기장 - 독립된 Firebase 설정 가이드

본 가이드는 영어 암기장 애플리케이션을 본인의 독립된 Firebase Firestore 데이터베이스와 연동하여 다중 기기(핸드폰, PC 등)에서 닉네임과 암기 카드를 동기화해 사용하기 위한 가이드입니다.

---

## 🗺️ 전체 설정 흐름

1. **[1단계]** Firebase 프로젝트 생성 및 웹 앱 등록
2. **[2단계]** Firestore Database 생성 및 보안 규칙 설정
3. **[3단계]** `firebase-config.json` 설정 파일 작성

---

## 1단계. Firebase 프로젝트 생성 및 웹 앱 등록

1. **Firebase 콘솔 접속**
   * [Firebase Console](https://console.firebase.google.com/)에 구글 계정으로 로그인합니다.
2. **프로젝트 만들기**
   * **[프로젝트 추가]** 버튼을 클릭합니다.
   * 프로젝트 이름(예: `my-english-cards`)을 입력하고 **[계속]**을 누릅니다.
   * 구글 애널리틱스(Google Analytics) 설정은 선택 사항이므로 비활성화해도 무방합니다.
   * **[프로젝트 만들기]**를 누른 뒤 완료되면 **[계속]**을 클릭합니다.
3. **웹 앱(Web) 추가하기**
   * 프로젝트 메인 홈 화면 중앙에서 **웹 아이콘 `</>`**을 클릭합니다.
   * 앱 닉네임(예: `english-cards-web`)을 입력합니다.
   * "이 앱에 Firebase Hosting도 설정합니다." 체크박스는 **해제**해 둡니다.
   * **[앱 등록]** 버튼을 클릭합니다.
4. **접속 설정 복사**
   * 화면에 표시되는 `firebaseConfig` 객체 안의 값들을 확인합니다.
     ```javascript
     const firebaseConfig = {
       apiKey: "AIzaSy...",
       authDomain: "...",
       projectId: "...",
       storageBucket: "...",
       messagingSenderId: "...",
       appId: "..."
     };
     ```

---

## 2단계. Firestore Database 생성 및 보안 규칙 설정

1. **Firestore 시작하기**
   * 왼쪽 사이드바 메뉴에서 **[빌드]** -> **[Firestore Database]**를 클릭합니다.
   * **[데이터베이스 만들기]** 버튼을 클릭합니다.
2. **기본 설정**
   * **보안 규칙**: **[테스트 모드에서 시작]** 또는 **[프로덕션 모드에서 시작]**을 선택합니다. (아래에서 직접 규칙을 덮어쓸 것입니다.)
   * **위치 설정**: 본인과 가장 가까운 지역(예: 서울 `asia-northeast3` 또는 `asia-east1` 등)을 선택하고 **[만들기]**를 클릭합니다.
3. **보안 규칙(Security Rules) 적용**
   * Firestore 화면 상단의 **[규칙(Rules)]** 탭으로 이동합니다.
   * 기존 규칙 내용을 지우고, 아래의 **영어 암기장 전용 규칙**을 입력합니다.
     ```javascript
     rules_version = '2';
     service cloud.firestore {
       match /databases/{database}/documents {
         // 영어 암기장용 users 컬렉션 및 모든 하위 문서에 대해 누구나 읽고 쓸 수 있도록 허용
         match /users/{document=**} {
           allow read, write: if true;
         }
       }
     }
     ```
   * 입력 후 우측 상단의 **[게시(Publish)]** 버튼을 클릭하여 저장합니다.

---

## 3단계. `firebase-config.json` 설정 파일 작성

1. `영어 암기장` 폴더에 생성되어 있는 [firebase-config.json](file:///d:/Project/Antigravity/영어 암기장/firebase-config.json) 파일을 엽니다.
2. 1단계에서 복사해 둔 파이어베이스 설정 값들을 다음과 같이 입력하고 저장합니다.
   ```json
   {
     "apiKey": "본인의_API_KEY",
     "authDomain": "본인의_PROJECT_ID.firebaseapp.com",
     "projectId": "본인의_PROJECT_ID",
     "storageBucket": "본인의_PROJECT_ID.firebasestorage.app",
     "messagingSenderId": "본인의_MESSAGING_SENDER_ID",
     "appId": "본인의_APP_ID"
   }
   ```

이제 모든 설정이 완료되었습니다! 
로컬 서버를 가동하거나 웹페이지를 새로고침하면 `firebase-config.json`의 설정을 자동으로 감지하고 클라우드 데이터베이스에 연동을 시작합니다. 🧸🌸
