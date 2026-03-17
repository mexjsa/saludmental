// CONASAMA Chatbot Core Logic
import { db } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const CHAT_LOG_COLLECTION = "conasama_responses";

// DOM Elements
const chatMessages = document.getElementById('chat-messages');
const optionsContainer = document.getElementById('options-container');
const progressBar = document.getElementById('progress-bar');

// State Variables
let userData = {
    name: '',
    ageRange: '',
    gender: '',
    k10Score: 0,
    phq9Score: 0,
    suicideFlag: false,
    state: '',
    municipality: '',
    responses: {}
};

let currentPhase = 'WELCOME';
let currentQuestionIndex = 0;

// Scales Definitions
const K10_QUESTIONS = [
    "¿Qué tan seguido te has sentido cansado/a o agotado/a sin una buena razón?",
    "¿Qué tan seguido te has sentido muy nervioso/a o intranquilo/a?",
    "¿Qué tan seguido te has sentido tan desesperado/a o triste que nada lograba animarte?",
    "¿Qué tan seguido has sentido que todo lo que haces te cuesta muchísimo esfuerzo?",
    "¿Qué tan seguido te has sentido inútil o que no vales nada?"
];

const PHQ9_QUESTIONS = [
    "¿Has tenido poco interés o has dejado de disfrutar las cosas que antes te gustaban?",
    "¿Te has sentido bajoneado/a, deprimido/a o sin esperanzas?",
    "¿Has tenido problemas con tu sueño? (Ya sea no poder dormir o dormir demasiado)."
];

const SUBSTANCE_ITEMS = [
    "Tabaco o vapeadores",
    "Bebidas con alcohol (cerveza, vino, azulitos, etc.)",
    "Marihuana, pastillas sin receta médica (como tranquilizantes) o algún otro tipo de droga."
];

// Phase Configuration
const FLOW = {
    WELCOME: {
        messages: [
            "¡Hola! 👋 Soy un asistente virtual (un robot) programado para escucharte y ayudarte a entender tus emociones.",
            "Todo lo que hables aquí es un espacio seguro y confidencial.",
            "Para continuar, necesito que leas y aceptes nuestro Aviso de Privacidad. ¿Estás de acuerdo?"
        ],
        options: [
            { text: "Sí, estoy de acuerdo", nextPhase: 'IDENTITY' },
            { text: "No, gracias", action: () => terminateChat("Entiendo. Si cambias de opinión, aquí estaremos para apoyarte. ¡Cuídate!") }
        ]
    },
    IDENTITY: {
        messages: ["¡Súper! Para sentirnos más en confianza, ¿cómo te gustaría que te llame? (Puede ser tu nombre o un apodo)"],
        input: true,
        onInput: (val) => {
            userData.name = val;
            startPhase('AGE');
        }
    },
    AGE: {
        messages: ["Mucho gusto, {name}. ¿Cuántos años tienes? Elige el rango en el que estás:"],
        options: [
            { text: "12 a 14", value: "12-14" },
            { text: "15 a 17", value: "15-17" },
            { text: "18 a 21", value: "18-21" },
            { text: "22 a 25", value: "22-25" },
            { text: "26 a 29", value: "26-29" }
        ],
        nextPhase: 'GENDER'
    },
    GENDER: {
        messages: ["¿Con qué género te identificas más?"],
        options: [
            { text: "Mujer", value: "mujer" },
            { text: "Hombre", value: "hombre" },
            { text: "No binario", value: "no-binario" },
            { text: "Otro", value: "otro" },
            { text: "Prefiero no decirlo", value: "n-a" }
        ],
        nextPhase: 'LOCATION'
    },
    LOCATION: {
        messages: ["Para poder orientarte mejor según donde vives, ¿en qué estado te encuentras?"],
        options: [
            { text: "Ciudad de México", value: "CDMX" },
            { text: "Estado de México", value: "EDOMEX" },
            { text: "Jalisco", value: "JAL" }
        ],
        nextPhase: 'MUNICIPALITY'
    },
    MUNICIPALITY: {
        messages: ["¡Entendido! ¿Y en qué municipio o alcaldía?"],
        options: [
            { text: "Iztapalapa", value: "iztapalapa" },
            { text: "Ecatepec", value: "ecatepec" },
            { text: "Guadalajara", value: "guadalajara" }
        ],
        nextPhase: 'EMERGENCY_CONTACT'
    },
    EMERGENCY_CONTACT: {
        messages: ["A veces, si noto que estás pasando por un momento muy difícil o de riesgo, mi deber es asegurarme de que estés a salvo y conectarte con un humano.", "¿Me podrías compartir un teléfono o correo de contacto solo para emergencias?"],
        options: [
            { text: "Escribir contacto", action: () => showInputFallback(val => { userData.emergencyContact = val; startPhase('K10'); }) },
            { text: "Prefiero saltar esto por ahora", nextPhase: 'K10' }
        ]
    },
    K10: {
        messages: [
            "En los últimos 30 días:",
            "Solo elige la opción que mejor describa cómo te sientes."
        ],
        questions: K10_QUESTIONS,
        options: [
            { text: "Nunca", value: 1 },
            { text: "Pocas veces", value: 2 },
            { text: "A veces", value: 3 },
            { text: "Muchas veces", value: 4 },
            { text: "Siempre", value: 5 }
        ],
        nextPhase: 'PHQ9'
    },
    PHQ9: {
        messages: ["En las últimas dos semanas:"],
        questions: PHQ9_QUESTIONS,
        options: [
            { text: "Ningún día", value: 0 },
            { text: "Varios días", value: 1 },
            { text: "Más de la mitad de los días", value: 2 },
            { text: "Casi todos los días", value: 3 }
        ],
        nextPhase: 'RESULTS_CALC'
    },
    RESULTS_CALC: {
        action: calculateFinalResults
    }
};

// --- UI Logic ---

function addMessage(text, sender = 'bot') {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}`;
    msgDiv.innerText = text;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTypingIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'typing-indicator';
    indicator.className = 'message bot typing';
    indicator.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
    chatMessages.appendChild(indicator);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.remove();
}

async function botSpeak(messages) {
    optionsContainer.innerHTML = '';
    for (const msg of messages) {
        showTypingIndicator();
        const delay = msg.length < 20 ? 1200 : msg.length < 50 ? 1800 : 2500;
        await new Promise(resolve => setTimeout(resolve, delay));
        removeTypingIndicator();
        addMessage(msg, 'bot');
    }
}

function renderOptions(options, onSelect) {
    optionsContainer.innerHTML = '';
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'btn-option';
        btn.innerText = opt.text;
        btn.onclick = () => {
            optionsContainer.innerHTML = ''; // Clear options immediately
            addMessage(opt.text, 'user');
            onSelect(opt);
        };
        optionsContainer.appendChild(btn);
    });
}

function updateProgress(percent) {
    progressBar.style.width = `${percent}%`;
}

// --- Conversation flow logic ---

async function startPhase(phaseName) {
    console.log("Starting phase:", phaseName);
    currentPhase = phaseName;
    const phase = FLOW[phaseName];

    if (!phase) {
        console.error("Phase not found:", phaseName);
        return;
    }

    if (phase.action) {
        phase.action();
        return;
    }

    if (phase.messages) {
        const msgs = getPhaseMessages(phaseName);
        await botSpeak(msgs);
    }

    if (phase.questions) {
        currentQuestionIndex = 0;
        askNextQuestion();
    } else if (phase.options) {
        renderOptions(phase.options, handleOptionSelect);
    } else if (phase.input) {
        showInputFallback(phase.onInput || nextFromInput);
    }
}

function getPhaseMessages(phaseName) {
    const phase = FLOW[phaseName];
    if (!phase.messages) return [];
    
    let msgs = [...phase.messages];
    const age = userData.ageRange;

    // Adapting tone based on PRD requirements but following user simplification
    if (age === '12-14') {
        if (phaseName === 'K10') msgs = ["En los últimos 30 días:", "Elige lo que sientas, no hay respuestas malas."];
        if (phaseName === 'PHQ9') msgs = ["En las últimas dos semanas:"];
    } else if (age === '22-25' || age === '26-29') {
        if (phaseName === 'K10') msgs = ["En los últimos 30 días:", "Por favor, seleccione la opción que mejor describa su frecuencia de síntomas."];
        if (phaseName === 'PHQ9') msgs = ["En las últimas dos semanas:"];
    }

    return msgs.map(m => m.replace('{name}', userData.name || 'amigo/a'));
}

async function askNextQuestion() {
    const phase = FLOW[currentPhase];
    const totalQuestions = phase.questions.length;
    const progress = currentPhase === 'K10' ? (currentQuestionIndex / totalQuestions) * 40 + 20 : (currentQuestionIndex / totalQuestions) * 40 + 60;
    updateProgress(progress);

    if (currentQuestionIndex < totalQuestions) {
        await botSpeak([phase.questions[currentQuestionIndex]]);
        renderOptions(phase.options, handleQuestionResponse);
    } else {
        startPhase(phase.nextPhase);
    }
}

function handleOptionSelect(opt) {
    if (opt.action) {
        opt.action();
        return;
    }
    if (currentPhase === 'AGE') {
        userData.ageRange = opt.value;
    }
    if (currentPhase === 'LOCATION') {
        userData.state = opt.value;
    }
    if (currentPhase === 'MUNICIPALITY') {
        userData.municipality = opt.value;
    }
    if (opt.suicideFlag) {
        userData.suicideFlag = true;
    }
    startPhase(FLOW[currentPhase].nextPhase || opt.nextPhase);
}

async function handleQuestionResponse(opt) {
    const val = opt.value;
    const phase = FLOW[currentPhase];

    // Store response
    if (currentPhase === 'K10') {
        userData.k10Score += val;
        if (currentQuestionIndex === 4 && userData.k10Score >= 18) {
            await botSpeak(["Lamento que estés sintiendo todo esto, debe ser muy pesado. Lo estás haciendo muy bien al contármelo. Sigamos."]);
        }
    } else if (currentPhase === 'PHQ9') {
        userData.phq9Score += val;
    }

    currentQuestionIndex++;

    // Check for branching nextPhase in option
    if (opt.nextPhase) {
        startPhase(opt.nextPhase);
        return;
    }

    // Continue to next question or next phase
    if (userData.suicideFlag && currentPhase !== 'SUBSTANCES') {
        calculateFinalResults();
        return;
    }

    if (currentQuestionIndex < phase.questions.length) {
        askNextQuestion();
    } else {
        startPhase(phase.nextPhase);
    }
}

function showInputFallback(onSend) {
    const fallback = document.getElementById('input-fallback');
    const input = document.getElementById('user-input');
    const btn = document.getElementById('send-btn');

    fallback.style.display = 'flex';
    optionsContainer.innerHTML = '';

    btn.onclick = () => {
        const val = input.value.trim();
        if (val) {
            addMessage(val, 'user');
            fallback.style.display = 'none';
            input.value = '';
            onSend(val);
        }
    };
}

const CRISIS_KEYWORDS = [
    "quiero desaparecer", "no quiero vivir", "me quiero morir",
    "todo estaría mejor sin mí", "ya no puedo más", "matarme", "suicidarme"
];

function checkCrisis(text) {
    const lower = text.toLowerCase();
    if (CRISIS_KEYWORDS.some(kw => lower.includes(kw))) {
        userData.suicideFlag = true;
        calculateFinalResults(); // Jump to emergency
        return true;
    }
    return false;
}

function nextFromInput(val) {
    if (checkCrisis(val)) return;
    if (currentPhase === 'IDENTITY') {
        userData.name = val;
    }
    startPhase(FLOW[currentPhase].nextPhase);
}

function terminateChat(farewell) {
    botSpeak([farewell]);
    optionsContainer.innerHTML = '<span class="text-muted">Conversación terminada.</span>';
}

// --- Results & Scoring ---

const isFirebaseConfigured = () => {
    return typeof db !== 'undefined' && db && !db._databaseId.projectId.includes("tu-proyecto");
};

async function saveResult(data) {
    if (!isFirebaseConfigured()) {
        console.warn("⚠️ Firebase no configurado. El resultado se mostrará solo en consola.");
        console.log("Datos del Lead (Mock):", data);
        return;
    }
    try {
        await addDoc(collection(db, CHAT_LOG_COLLECTION), {
            ...data,
            timestamp: serverTimestamp()
        });
    } catch (e) {
        console.error("Error al guardar en Firebase:", e);
    }
}

async function calculateFinalResults() {
    optionsContainer.innerHTML = '';
    showTypingIndicator();
    updateProgress(100);

    // Save to Firebase ONLY if configured
    if (isFirebaseConfigured()) {
        try {
            await addDoc(collection(db, CHAT_LOG_COLLECTION), {
                ...userData,
                timestamp: serverTimestamp()
            });
        } catch (e) { console.error("Error saving results:", e); }
    } else {
        console.warn("⚠️ Firebase no configurado. Saltando persistencia para evitar block.");
        console.log("Resultados (Local):", userData);
    }

    await new Promise(r => setTimeout(r, 1000));
    removeTypingIndicator();

    // 🚨 ALERTA ROJA (Protocolo más directo)
    if (userData.suicideFlag) {
        await botSpeak([
            "Lo que me cuentas es muy importante y quiero asegurarme de que estés a salvo.",
            "En este momento voy a transferir este chat con un psicólogo especializado para que te atienda personalmente. No te retires."
        ]);
        
        optionsContainer.innerHTML = `
            <div class="handoff-alert">🚨 Transfiriendo a atención humana urgente...</div>
            <button class="btn-option" style="background: var(--accent); color: white; border: none; margin-top: 10px;" onclick="window.open('tel:8009112000')">
                Llamar a Línea de la Vida (800 911 2000)
            </button>
        `;
        
        document.getElementById('emergency-modal').style.display = 'flex';
        return;
    }

    // ⚠️ Riesgo Moderado/Alto
    // Threshold K10: 15+ (en 5 preguntas)
    // Threshold PHQ3: 5+ (en 3 preguntas, max 9)
    if (userData.phq9Score >= 5 || userData.k10Score >= 15) {
        await botSpeak([
            `¡Gracias por tu sinceridad, ${userData.name}! Noto que tu nivel de malestar es algo que no deberías enfrentar sin apoyo profesional.`,
            "Me gustaría conectarte ahora mismo con un experto de la Línea de la Vida para que te orienten mejor. Es gratuito, anónimo y muy confiable.",
            "¿Te parece bien que te comunique con ellos?"
        ]);
        renderOptions([
            { text: "Sí, quiero ayuda ahora", action: () => window.open('tel:8009112000') },
            { text: "Prefiero en otro momento", action: () => addMessage("De acuerdo. Ten a la mano el número 800 911 2000 por si lo llegas a necesitar. ¡Cuídate!", 'bot') }
        ], handleOptionSelect);
        return;
    }

    // ✅ Riesgo Leve
    await botSpeak([
        "¡Listo, terminamos! Eres muy valiente por revisar cómo te sientes.",
        "Por lo que me cuentas, parece que estás pasando por un estrés normal. Sigue practicando el autocuidado.",
        "Aquí te dejo una guía que puede ayudarte. Si te sientes peor, vuelve a escribirme en cualquier momento."
    ]);
    renderOptions([
        { text: "Ver guía de autocuidado", action: () => window.open('https://www.gob.mx/salud/documentos/guia-de-autocuidado-para-la-salud-mental') },
        { text: "Terminar chat", action: () => terminateChat("¡Cuídate mucho!") }
    ], handleOptionSelect);
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    startPhase('WELCOME');
});

window.closeModal = () => document.getElementById('emergency-modal').style.display = 'none';
