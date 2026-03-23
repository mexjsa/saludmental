import { supabase } from '../supabase-config.js';

const CHAT_LOG_COLLECTION = "conasama_responses";

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
    console.log("🚀 Iniciando precarga de 50 casos reales en SUPABASE...");
    const names = ["Juan", "Maria", "Carlos", "Ana", "Luis", "Elena", "Pedro", "Sofia", "Miguel", "Lucia"];
    const ages = ["12-14", "15-17", "18-21", "22-25", "26-29"];
    const genders = ["mujer", "hombre", "no-binario", "otro"];

    const testData = [];
    for (let i = 0; i < 50; i++) {
        const cpData = await getRandomCP();
        if (!cpData) continue;

        const suicide = Math.random() > 0.85;
        const k10 = suicide ? (Math.floor(Math.random() * 21) + 30) : (Math.floor(Math.random() * 41) + 10);
        let phq = suicide ? 24 : Math.floor(Math.random() * 25);

        testData.push({
            name: names[Math.floor(Math.random() * names.length)] + " (P)",
            age_range: ages[Math.floor(Math.random() * ages.length)],
            gender: genders[Math.floor(Math.random() * genders.length)],
            estado: cpData.estado,
            municipio: cpData.municipio,
            codigo_postal: cpData.cp,
            colonia: cpData.colonias[0],
            tipo_ubicacion: 'cp',
            k10_score: k10,
            phq9_score: phq,
            suicide_flag: suicide,
            coords: cpData.coords,
            source: 'test_seed'
        });
    }

    const { error } = await supabase
        .from(CHAT_LOG_COLLECTION)
        .insert(testData);

    if (error) {
        console.error("❌ Error al cargar en Supabase:", error);
        alert("Error: " + error.message);
    } else {
        console.log(`✨ Finalizado: ${testData.length} casos cargados en Supabase.`);
        alert(`Se han cargado ${testData.length} casos exitosamente.`);
    }
}

// Exponer para ejecutar desde la consola si es necesario
window.runSeeding = seedData;
