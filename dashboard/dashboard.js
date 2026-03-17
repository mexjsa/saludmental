import { db } from '../firebase-config.js';
import { collection, query, orderBy, getDocs, limit } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const CHAT_LOG_COLLECTION = "conasama_responses";

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

// Initialize Dashboard
initMap();
fetchAndRender();

async function fetchAndRender() {
    console.log("Fetching data from Firebase...");
    try {
        const q = query(collection(db, CHAT_LOG_COLLECTION), orderBy("timestamp", "desc"), limit(100));
        const querySnapshot = await getDocs(q);
        const data = [];
        querySnapshot.forEach((doc) => {
            data.push({ id: doc.id, ...doc.data() });
        });

        renderOverview(data);
        renderActiveUsers();
        renderMap(data);
        renderTable(data);
    } catch (error) {
        console.error("Error fetching data:", error);
        tbodyEl.innerHTML = `<tr><td colspan="7" style="color: #ef4444; text-align: center;">Error al conectar con Firebase. Verifica la configuración.</td></tr>`;
    }
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

function renderActiveUsers() {
    const ctx = document.getElementById('activeUsersChart').getContext('2d');
    if (activeUsersChart) activeUsersChart.destroy();
    
    activeUsersChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [27, 73],
                backgroundColor: ['#1d4d3a', '#f1f5f9'],
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

        // Force a resize fix to ensure the map renders correctly in its container
        setTimeout(() => map.invalidateSize(), 500);
    }
}

function renderMap(data) {
    initMap();
    if (!data || data.length === 0) return;

    // Clear and redraw markers
    data.forEach(d => {
        if (d.state && MOCK_COORDS[d.state]) {
            const isCrisis = d.suicideFlag || d.phq9Score >= 5 || d.k10Score >= 15;
            const markerColor = isCrisis ? '#ef4444' : '#10b981';
            
            L.circleMarker(MOCK_COORDS[d.state], {
                radius: 10,
                fillColor: markerColor,
                color: '#fff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.9
            }).addTo(map)
              .bindPopup(`<b>${d.name || 'Anónimo'}</b><br>Riesgo: ${isCrisis ? 'CRÍTICO' : 'Normal'}`);
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
        tr.innerHTML = `
            <td>${time}</td>
            <td style="font-weight: 600;">${d.name}</td>
            <td>${d.municipality || ''}, ${d.state || '-'}</td>
            <td>${d.k10Score || 0}</td>
            <td>${d.phq9Score || 0}</td>
            <td><span class="badge ${statusClass}">${statusText}</span></td>
        `;
        tbodyEl.appendChild(tr);
    });
}

// Refresh handler
refreshBtn.addEventListener('click', fetchAndRender);
searchInput.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    const rows = tbodyEl.querySelectorAll('tr');
    rows.forEach(row => {
        const name = row.querySelector('td:nth-child(2)').innerText.toLowerCase();
        row.style.display = name.includes(val) ? '' : 'none';
    });
});
