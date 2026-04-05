/* ========================================
   INTER RED - Firebase Configuration
   ======================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCPmW9J_E3uW-JIrqOUoAnyHGhXv5-5kIY",
  authDomain: "interred-db49e.firebaseapp.com",
  projectId: "interred-db49e",
  storageBucket: "interred-db49e.firebasestorage.app",
  messagingSenderId: "45566016796",
  appId: "1:45566016796:web:54145657108476c39d0ed9",
  measurementId: "G-FHGYLFQ8LX"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { app, db, auth };
