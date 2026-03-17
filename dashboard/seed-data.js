import { db } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const CHAT_LOG_COLLECTION = "conasama_responses";

async function seedData() {
    console.log("🚀 Iniciando precarga de 50 casos de prueba...");
    const names = ["Juan", "Maria", "Carlos", "Ana", "Luis", "Elena", "Pedro", "Sofia", "Miguel", "Lucia"];
    const states = ["CDMX", "EDOMEX", "JAL"];
    const municipalities = {
        "CDMX": ["Iztapalapa", "Benito Juarez", "Coyoacan"],
        "EDOMEX": ["Ecatepec", "Toluca", "Naucalpan"],
        "JAL": ["Guadalajara", "Zapopan", "Tlaquepaque"]
    };

    let count = 0;
    for (let i = 0; i < 50; i++) {
        const state = states[Math.floor(Math.random() * states.length)];
        const mun = municipalities[state][Math.floor(Math.random() * municipalities[state].length)];
        const k10 = Math.floor(Math.random() * 25) + 5;
        const phq = Math.floor(Math.random() * 9);
        const suicide = Math.random() > 0.9;

        try {
            await addDoc(collection(db, CHAT_LOG_COLLECTION), {
                name: names[Math.floor(Math.random() * names.length)] + " (Prueba)",
                ageRange: "18-21",
                gender: "otro",
                state: state,
                municipality: mun,
                k10Score: k10,
                phq9Score: phq,
                suicideFlag: suicide,
                source: 'test_seed',
                timestamp: serverTimestamp()
            });
            count++;
            if (count % 10 === 0) console.log(`✅ ${count}/50 cargados...`);
        } catch (e) {
            console.error("❌ Error al cargar:", e);
        }
    }
    console.log("✨ Finalizado: 50 casos cargados en Firebase.");
}

// Ejecutar si se carga como script principal o vía navegador
seedData();
