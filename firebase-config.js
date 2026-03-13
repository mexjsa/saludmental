// Firebase Configuration Template
// USER: Reemplaza estos valores con los de tu consola de Firebase
// Proyecto: CONASAMA CHATBOT

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "TU_API_KEY",
    authDomain: "tu-proyecto.firebaseapp.com",
    projectId: "tu-proyecto",
    storageBucket: "tu-proyecto.appspot.com",
    messagingSenderId: "tu-id",
    appId: "tu-app-id"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

/* 
  🛡️ REGLAS DE SEGURIDAD RECOMENDADAS (Firestore):
  
  service cloud.firestore {
    match /databases/{database}/documents {
      match /conasama_responses/{document} {
        allow create: if true; // Permite el envío de resultados
        allow read, update, delete: if false; // Protege la privacidad de los usuarios
      }
    }
  }
*/
