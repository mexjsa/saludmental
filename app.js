// CONASAMA Chatbot Core Logic
import { db } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

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
    substanceFlag: false,
    responses: {}
};

let currentPhase = 'WELCOME';
let currentQuestionIndex = 0;

// Scales Definitions
const K10_QUESTIONS = [
    "¿Con qué frecuencia te has sentido cansado(a) sin ninguna buena razón?",
    "¿Con qué frecuencia te has sentido nervioso(a)?",
    "¿Con qué frecuencia te has sentido tan nervioso(a) que nada te podía calmar?",
    "¿Con qué frecuencia te has sentido desesperado(a)?",
    "¿Con qué frecuencia te has sentido inquieto(a) o intranquilo(a)?",
    "¿Con qué frecuencia te has sentido tan inquieto(a) que no has podido mantenerte quieto(a)?",
    "¿Con qué frecuencia te has sentido deprimido(a)?",
    "¿Con qué frecuencia has sentido que todo lo que haces representa un gran esfuerzo?",
    "¿Con qué frecuencia te has sentido tan triste que nada podía animarte?",
    "¿Con qué frecuencia te has sentido un inútil?"
];

const PHQ9_QUESTIONS = [
    "Poco interés o placer en hacer las cosas.",
    "Se ha sentido triste, deprimido(a) o sin esperanza.",
    "Dificultad para dormir o permanecer dormido(a), o dormir demasiado.",
    "Se ha sentido cansado(a) o con poca energía.",
    "Poco apetito o ha comido en exceso.",
    "Se ha sentido mal con usted mismo(a) (o que es un fracaso o que ha decepcionado a su familia o a sí mismo/a).",
    "Dificultad para concentrarse en las cosas (como leer el periódico o ver televisión).",
    "Moverse o hablar tan lento que otras personas podrían haberlo notado. O lo contrario, estar tan inquieto(a) que se ha estado moviendo mucho más de lo normal.",
    "Pensamientos de que sería mejor estar muerto(a) o de hacerse daño de alguna manera."
];

// Phase Configuration
const FLOW = {
    WELCOME: {
        messages: [
            "Hola 👋",
            "Soy un asistente virtual de CONASAMA diseñado para ayudarte a revisar cómo te estás sintiendo.",
            "No soy un psicólogo, pero puedo orientarte y conectarte con ayuda si lo necesitas.",
            "Antes de empezar, ¿podrías aceptar nuestro aviso de privacidad?"
        ],
        options: [
            { text: "Aceptar y continuar", nextPhase: 'IDENTITY' },
            { text: "No aceptar", action: () => terminateChat("Entiendo. Si cambias de opinión, aquí estaremos para apoyarte. ¡Cuídate!") }
        ]
    },
    IDENTITY: {
        messages: ["¡Excelente! Vamos a empezar con unas preguntas rápidas.", "¿Cómo te gustaría que te llame? (Puedes usar un apodo)"],
        input: true,
        nextPhase: 'AGE'
    },
    AGE: {
        messages: ["Mucho gusto. ¿En qué rango de edad te encuentras?"],
        options: [
            { text: "12-14 años", value: "12-14" },
            { text: "15-17 años", value: "15-17" },
            { text: "18-21 años", value: "18-21" },
            { text: "22-25 años", value: "22-25" },
            { text: "26-29 años", value: "26-29" }
        ],
        nextPhase: 'K10'
    },
    K10: {
        messages: ["Gracias. Ahora, durante los últimos 30 días..."],
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
        messages: ["Casi terminamos. Durante las últimas 2 semanas, ¿con qué frecuencia te han molestado estos problemas?"],
        questions: PHQ9_QUESTIONS,
        options: [
            { text: "Ningún día", value: 0 },
            { text: "Varios días", value: 1 },
            { text: "Más de la mitad de los días", value: 2 },
            { text: "Casi todos los días", value: 3 }
        ],
        nextPhase: 'CHECK_SUICIDE_PHASE'
    },
    CHECK_SUICIDE_PHASE: {
        action: () => {
            if (userData.suicideFlag) {
                startPhase('SUICIDE_CHECK');
            } else {
                startPhase('SUBSTANCES');
            }
        }
    },
    SUICIDE_CHECK: {
        messages: ["Me importa mucho lo que estás pasando.", "¿Has tenido algún plan específico para hacerte daño o tienes acceso a algo que pueda ser peligroso?"],
        options: [
            { text: "He tenido planes y/o tengo los medios", value: 'HIGH', suicideFlag: true },
            { text: "He tenido pensamientos pero no planes", value: 'MID', suicideFlag: true },
            { text: "Solo fue una idea pasajera", value: 'LOW', suicideFlag: true },
            { text: "Prefiero no hablar de esto", value: 'PRIVATE' }
        ],
        nextPhase: 'SUBSTANCES'
    },
    SUBSTANCES: {
        messages: ["Finalmente, durante los últimos 30 días, ¿con qué frecuencia has consumido alcohol, tabaco/vape o alguna otra sustancia?"],
        options: [
            { text: "Nunca", value: 0 },
            { text: "1 o 2 veces", value: 1 },
            { text: "Mensualmente", value: 2 },
            { text: "Semanalmente o más", value: 3 }
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
        await botSpeak(phase.messages);
    }

    if (phase.options) {
        renderOptions(phase.options, handleOptionSelect);
    } else if (phase.input) {
        showInputFallback(nextFromInput);
    } else if (phase.questions) {
        currentQuestionIndex = 0;
        askNextQuestion();
    }
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
    if (opt.suicideFlag) {
        userData.suicideFlag = true;
    }
    startPhase(FLOW[currentPhase].nextPhase || opt.nextPhase);
}

function handleQuestionResponse(opt) {
    const val = opt.value;
    if (currentPhase === 'K10') {
        userData.k10Score += val;
    } else if (currentPhase === 'PHQ9') {
        userData.phq9Score += val;
        // Check Question 9 of PHQ-9 (index 8)
        if (currentQuestionIndex === 8 && val > 0) {
            userData.suicideFlag = true;
        }
    }

    currentQuestionIndex++;
    askNextQuestion();
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
    updateProgress(100);
    await botSpeak(["He analizado tus respuestas. Dame un momento para procesar..."]);

    let riskLevel = "Leve";
    if (userData.suicideFlag) {
        riskLevel = "ALERTA ROJA";
    } else if (userData.phq9Score >= 20 || userData.k10Score >= 30) {
        riskLevel = "Muy Severo";
    } else if (userData.phq9Score >= 15 || userData.k10Score >= 25) {
        riskLevel = "Alto";
    } else if (userData.phq9Score >= 10 || userData.k10Score >= 20) {
        riskLevel = "Moderado";
    }

    await saveResult({ ...userData, riskLevel });
    await showResultsUI(riskLevel);
}

async function showResultsUI(level) {
    const results = {
        "Leve": {
            msgs: ["Tus resultados indican un nivel de malestar bajo.", "Te recomiendo seguir cuidando tu sueño y alimentación. ¡Estás haciendo un buen trabajo!"],
            resources: ["Guía de Autocuidado", "Ejercicios de Respiración"]
        },
        "Moderado": {
            msgs: ["Parece que estás pasando por un momento algo difícil.", "Sería buena idea hablar con un profesional preventivamente."],
            resources: ["Directorio de Centros CONASAMA", "Consejos para la Ansiedad"]
        },
        "Alto": {
            msgs: ["Tus respuestas muestran que estás experimentando un malestar significativo.", "Es muy importante que busques apoyo profesional pronto."],
            resources: ["Línea de la Vida (800 911 2000)", "Agendar valoración"]
        },
        "ALERTA ROJA": {
            msgs: ["Lo que me cuentas es muy importante.", "No tienes que pasar por esto solo.", "Te recomiendo hablar ahora mismo con alguien que pueda ayudarte."],
            action: () => document.getElementById('emergency-modal').style.display = 'flex'
        }
    };

    const res = results[level];
    await botSpeak(res.msgs);

    if (level === "ALERTA ROJA") {
        res.action();
    }
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    startPhase('WELCOME');
});

window.closeModal = () => document.getElementById('emergency-modal').style.display = 'none';
window.closeModal = () => document.getElementById('emergency-modal').style.display = 'none';
