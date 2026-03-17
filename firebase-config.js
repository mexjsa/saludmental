// Firebase Configuration - CONASAMA CHATBOT
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyBNBS1IfCXoMg_OkKU58UtmsFc0qLHY3VQ",
  authDomain: "mentalsalud-50d76.firebaseapp.com",
  projectId: "mentalsalud-50d76",
  storageBucket: "mentalsalud-50d76.firebasestorage.app",
  messagingSenderId: "1059088045965",
  appId: "1:1059088045965:web:b5ae2f8470ea973a79cfc4",
  measurementId: "G-H27DHC3ZJ6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const analytics = typeof window !== "undefined" ? getAnalytics(app) : null;

/* 
  🛡️ REGLAS DE SEGURIDAD RECOMENDADAS (Firestore):
  Pega esto en la pestaña "Rules" de tu consola de Firebase:
  
  service cloud.firestore {
    match /databases/{database}/documents {
      match /conasama_responses/{document} {
        allow create: if true; 
        allow read: if true; // Cambiar a false en PROD si no usas el dashboard público
        allow update, delete: if false;
      }
    }
  }
*/
