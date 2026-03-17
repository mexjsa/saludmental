import { db } from '../firebase-config.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const CHAT_LOG_COLLECTION = "salud_responses";

// Lista de prefijos comunes para diversificar la muestra
const CP_PREFIXES = ["010", "045", "066", "110", "200", "290", "300", "441", "450", "500", "550", "640", "720", "760", "800", "970"];

async function getRandomCP() {
    const prefix = CP_PREFIXES[Math.floor(Math.random() * CP_PREFIXES.length)];
    try {
        const res = await fetch(`../api/cp/${prefix}.json`);
        if (!res.ok) return null;
        const data = await res.json();
        const cps = Object.values(data);
        return cps[Math.floor(Math.random() * cps.length)];
    } catch (e) {
        return null;
    }
}

async function seedData() {
    console.log("🚀 Iniciando precarga de 50 casos reales...");
    const names = ["Juan", "Maria", "Carlos", "Ana", "Luis", "Elena", "Pedro", "Sofia", "Miguel", "Lucia", "Diego", "Carmen", "Fernando", "Rosa", "Javier"];
    const ages = ["12-14", "15-17", "18-21", "22-25", "26-29"];
    const genders = ["mujer", "hombre", "no-binario", "otro"];

    let count = 0;
    for (let i = 0; i < 50; i++) {
        const cpData = await getRandomCP();
        if (!cpData) continue;

        const k10 = Math.floor(Math.random() * 25) + 5;
        const phq = Math.floor(Math.random() * 9);
        const suicide = Math.random() > 0.85;

        try {
            await addDoc(collection(db, CHAT_LOG_COLLECTION), {
                name: names[Math.floor(Math.random() * names.length)] + " (P)",
                ageRange: ages[Math.floor(Math.random() * ages.length)],
                gender: genders[Math.floor(Math.random() * genders.length)],
                state: cpData.estado,
                estado: cpData.estado,
                municipality: cpData.municipio,
                municipio: cpData.municipio,
                codigo_postal: cpData.cp,
                colonia: cpData.colonias[0],
                coords: cpData.coords,
                k10Score: k10,
                phq9Score: phq,
                suicideFlag: suicide,
                source: 'test_seed',
                tipo_ubicacion: 'cp',
                timestamp: serverTimestamp()
            });
            count++;
            if (count % 10 === 0) console.log(`✅ ${count}/50 cargados...`);
        } catch (e) {
            console.error("❌ Error al cargar:", e);
        }
    }
    console.log(`✨ Finalizado: ${count} casos cargados en Firebase con ubicaciones reales.`);
    alert(`Se han cargado ${count} casos con ubicaciones reales de México.`);
}

// Exponer para ejecutar desde la consola si es necesario
window.runSeeding = seedData;
