import { db, auth } from '../firebase-config.js';
import { collection, query, orderBy, getDocs, limit, addDoc, serverTimestamp, doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const CHAT_LOG_COLLECTION = "conasama_responses";
const PRESENCE_COLLECTION = "presence";

// Chart & Map instances
let map, activeUsersChart;

const MOCK_COORDS = {
    'CDMX': [19.4326, -99.1332],
    'EDOMEX': [19.3503, -99.6450],
    'JAL': [20.6597, -103.3496]
};

// DOM Elements
const totalUsersEl = document.getElementById('total-users');
const totalEmergenciesEl = document.getElementById('total-emergencies');
const totalAttentionEl = document.getElementById('total-atention');
const totalLeveEl = document.getElementById('total-leve');
const tbodyEl = document.getElementById('leads-tbody');
const refreshBtn = document.getElementById('refresh-data');
const searchInput = document.getElementById('search-name');

// Auth & Role State
let currentUser = null;
let userProfile = null;

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        checkPermissions(user.uid);
    } else {
        window.location.href = '../login.html';
    }
});

async function checkPermissions(uid) {
    const docRef = doc(db, "admins", uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        userProfile = docSnap.data();
        initDashboard();
    } else {
        alert("Acceso no autorizado. Contacte al administrador maestro.");
        signOut(auth);
    }
}

function initDashboard() {
    initMap();
    fetchAndRender();
    if (userProfile.role === 'master') {
        document.getElementById('admin-panel').style.display = 'block';
        listAdmins();
    }
}

async function listAdmins() {
    const q = query(collection(db, "admins"));
    const snap = await getDocs(q);
    const tbody = document.getElementById('admins-tbody');
    tbody.innerHTML = '';
    snap.forEach(doc => {
        const d = doc.data();
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${d.email}</td>
            <td><span class="badge ${d.role === 'master' ? 'badge-orange' : 'badge-green'}">${d.role}</span></td>
            <td>${d.regions ? d.regions.join(', ') : 'Nacional'}</td>
            <td>${d.role !== 'master' ? '<button class="btn-refresh" style="background:#ef4444; border-radius:8px; padding:4px 10px; height:auto;">Eliminar</button>' : '-'}</td>
        `;
        tbody.appendChild(tr);
    });
}

const btnCreateAdmin = document.getElementById('btn-create-admin');
if (btnCreateAdmin) {
    btnCreateAdmin.onclick = async () => {
        const email = document.getElementById('new-admin-email').value;
        const role = document.getElementById('new-admin-role').value;
        const regions = document.getElementById('new-admin-regions').value.split(',').map(r => r.trim()).filter(r => r);
        
        if (!email) return alert("Ingrese un correo");
        
        // Note: In a real system, we'd use a Cloud Function to create the Auth user.
        // For this demo, we "whitelist" the email. The user must then register or be created manually.
        alert("Simulación: Usuario " + email + " autorizado como " + role + ". En un entorno real, esto crearía su cuenta de Auth.");
        
        // We'll save the profile so the user is authorized when they log in/sign up.
        // We need the UID but since we don't have it yet, we'll use email as key for now
        // or just advise manual creation in Firebase Console for this prototype phase.
    };
}
async function fetchAndRender() {
    console.log("Setting up real-time listener for role:", userProfile.role);
    const q = query(collection(db, CHAT_LOG_COLLECTION), orderBy("timestamp", "desc"), limit(500));
    
    onSnapshot(q, (querySnapshot) => {
        let data = [];
        querySnapshot.forEach((doc) => {
            data.push({ id: doc.id, ...doc.data() });
        });

        if (userProfile.role !== 'master') {
            const allowedRegions = userProfile.regions || [];
            data = data.filter(d => allowedRegions.includes(d.state));
        }

        renderOverview(data);
        renderMap(data);
        renderTable(data);
    }, (error) => {
        console.error("Error in real-time listener:", error);
        tbodyEl.innerHTML = `<tr><td colspan="7" style="color: #ef4444; text-align: center;">Error de conexión en tiempo real.</td></tr>`;
    });

    listenToPresence();
}

function listenToPresence() {
    const q = collection(db, PRESENCE_COLLECTION);
    onSnapshot(q, (snapshot) => {
        const now = Date.now();
        let activeCount = 0;
        snapshot.forEach(doc => {
            const d = doc.data();
            if (d.lastActive && (now - d.lastActive.toMillis()) < 120000) { // 2 minutes
                activeCount++;
            }
        });
        renderActiveUsers(activeCount);
    });
}

function renderOverview(data) {
    const total = data.length;
    const emergencies = data.filter(d => d.suicideFlag).length;
    const attention = data.filter(d => !d.suicideFlag && (d.phq9Score >= 5 || d.k10Score >= 15)).length;
    const leve = total - emergencies - attention;

    totalUsersEl.innerText = total;
    totalEmergenciesEl.innerText = emergencies;
    totalAttentionEl.innerText = attention;
    totalLeveEl.innerText = leve;
}

function renderActiveUsers(count = 0) {
    const ctx = document.getElementById('activeUsersChart').getContext('2d');
    if (activeUsersChart) activeUsersChart.destroy();
    
    // UI update for the percentage/text
    const activeText = document.querySelector('.active-users-count') || document.createElement('div');
    // Ensure the percentage text inside the donut is updated if it exists
    // For now, we'll just focus on the chart data
    
    activeUsersChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [count, Math.max(0, 10 - count)], // Assuming a small cluster for demo
                backgroundColor: ['#10b981', '#f1f5f9'],
                borderWidth: 0,
                circumference: 360,
                rotation: 0,
                cutout: '80%'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } }
        }
    });
}

let markersLayer = L.layerGroup();

function initMap() {
    if (!map) {
        map = L.map('riskMap', { 
            zoomControl: true, 
            dragging: true,
            scrollWheelZoom: false 
        }).setView([23.6345, -102.5528], 5);
        
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap &copy; CARTO'
        }).addTo(map);

        markersLayer.addTo(map);

        // Force a resize fix to ensure the map renders correctly in its container
        setTimeout(() => map.invalidateSize(), 500);
    }
}

function renderMap(data) {
    initMap();
    if (!data || data.length === 0) return;

    // Clear previous markers
    markersLayer.clearLayers();

// Redibujar marcadores
    data.forEach(d => {
        let lat, lon;
        let isMock = false;

        if (d.coords && d.coords.lat && d.coords.lon) {
            lat = d.coords.lat;
            lon = d.coords.lon;
        } else if (d.state && MOCK_COORDS[d.state]) {
            [lat, lon] = MOCK_COORDS[d.state];
            // Dispersión controlada para evitar amontonamiento en capitales
            lat += (Math.random() - 0.5) * 0.6;
            lon += (Math.random() - 0.5) * 0.6;
            isMock = true;
        }

        if (lat && lon) {
            let markerColor = '#10b981'; // Verde (Normal)
            let riskLabel = 'Normal';

            if (d.suicideFlag) {
                markerColor = '#ef4444'; // Rojo (CRÍTICO)
                riskLabel = 'CRÍTICO';
            } else if (d.phq9Score >= 5 || d.k10Score >= 15) {
                markerColor = '#f59e0b'; // Naranja (Riesgo Alto)
                riskLabel = 'Alto Riesgo';
            }
            
            L.circleMarker([lat, lon], {
                radius: 3.5, // Más pequeño y elegante
                fillColor: markerColor,
                color: '#fff',
                weight: 0.5,
                opacity: 1,
                fillOpacity: 1
            }).addTo(markersLayer)
              .bindPopup(`<b>${d.name || 'Anónimo'}</b><br>Riesgo: ${riskLabel}<br>${d.municipio || d.municipality || ''}, ${d.estado || d.state || ''}${isMock ? ' (Zona Aprox)' : ''}`);
        }
    });
}


function renderTable(data) {
    tbodyEl.innerHTML = '';
    data.forEach(d => {
        const time = d.timestamp?.toDate ? d.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--';
        const statusClass = d.suicideFlag ? 'badge-red' : (d.phq9Score >= 5 || d.k10Score >= 15) ? 'badge-orange' : 'badge-green';
        const statusText = d.suicideFlag ? 'ALERTA ROJA' : (d.phq9Score >= 5 || d.k10Score >= 15) ? 'Riesgo Alto' : 'Normal';

        const tr = document.createElement('tr');
        const isTest = d.source === 'test_seed';
        const location = d.tipo_ubicacion === 'cp' 
            ? `${d.colonia || ''}, ${d.municipio || ''}, ${d.estado || ''} (${d.codigo_postal})`
            : `${d.municipality || ''}${d.municipality ? ', ' : ''}${d.state || '-'}`;

        tr.innerHTML = `
            <td>${time}</td>
            <td style="font-weight: 600;">${d.name} ${isTest ? '<span class="badge" style="background:#e2e8f0; color:#64748b; font-size:0.6rem;">PRUEBA</span>' : ''}</td>
            <td>${d.ageRange || '-'}</td>
            <td style="text-transform: capitalize;">${d.gender || '-'}</td>
            <td>${location}</td>
            <td>${d.k10Score || 0}</td>
            <td>${d.phq9Score || 0}</td>
            <td><span class="badge ${statusClass}">${statusText}</span></td>
        `;
        tbodyEl.appendChild(tr);
    });
}

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

async function seedMockData() {
    console.log("Seeding 50 test cases with REAL coordinates...");
    const names = ["Juan", "Maria", "Carlos", "Ana", "Luis", "Elena", "Pedro", "Sofia", "Miguel", "Lucia"];
    const ages = ["12-14", "15-17", "18-21", "22-25", "26-29"];
    const genders = ["mujer", "hombre", "no-binario", "otro"];

    let count = 0;
    for (let i = 0; i < 50; i++) {
        const cpData = await getRandomCP();
        if (!cpData) continue;

        const k10 = Math.floor(Math.random() * 25) + 5;
        const phq = Math.floor(Math.random() * 9);
        const suicide = Math.random() > 0.9;

        await addDoc(collection(db, CHAT_LOG_COLLECTION), {
            name: names[Math.floor(Math.random() * names.length)] + " (Test)",
            ageRange: ages[Math.floor(Math.random() * ages.length)],
            gender: genders[Math.floor(Math.random() * genders.length)],
            tipo_ubicacion: 'cp',
            codigo_postal: cpData.cp,
            state: cpData.estado,
            estado: cpData.estado,
            municipality: cpData.municipio,
            municipio: cpData.municipio,
            colonia: cpData.colonias[0],
            k10Score: k10,
            phq9Score: phq,
            suicideFlag: suicide,
            coords: cpData.coords,
            source: 'test_seed',
            timestamp: serverTimestamp()
        });
        count++;
    }
    alert(`¡${count} casos de prueba con ubicaciones reales cargados exitosamente!`);
}

// Expose globally
window.seedMockData = seedMockData;

// Refresh handler (triggers manual re-sync if needed, though onSnapshot is automatic)
refreshBtn.addEventListener('click', () => {
    if (userProfile.role === 'viewer') return;
    location.reload(); // Simple way to restart listeners
});

// Logout handler
window.handleLogout = () => signOut(auth);

searchInput.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    const rows = tbodyEl.querySelectorAll('tr');
    rows.forEach(row => {
        const name = row.querySelector('td:nth-child(2)').innerText.toLowerCase();
        row.style.display = name.includes(val) ? '' : 'none';
    });
});
