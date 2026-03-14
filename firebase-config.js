/*
  ============================================================
  FIREBASE YAPILANDIRMASI
  ============================================================
  1. https://console.firebase.google.com adresine git
  2. "Add project" ile yeni proje oluştur
  3. Project settings > "Add app" > Web (</>)
  4. Aşağıdaki değerleri kendi projenin değerleriyle değiştir
  5. Authentication > Sign-in method: Google ve Email/Password'ü aktif et
  6. Firestore Database > "Create database" (test mode)
  ============================================================
*/

const firebaseConfig = {
  apiKey:            "BURAYA_API_KEY",
  authDomain:        "BURAYA_AUTH_DOMAIN",
  projectId:         "BURAYA_PROJECT_ID",
  storageBucket:     "BURAYA_STORAGE_BUCKET",
  messagingSenderId: "BURAYA_MESSAGING_SENDER_ID",
  appId:             "BURAYA_APP_ID"
};
