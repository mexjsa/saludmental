import { db } from '../firebase-config.js';
import { collection, query, orderBy, getDocs, limit } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const CHAT_LOG_COLLECTION = "conasama_responses";

// Chart instances
let ageChart, riskChart;

// DOM Elements
const totalUsersEl = document.getElementById('total-users');
const totalEmergenciesEl = document.getElementById('total-emergencies');
const totalAttentionEl = document.getElementById('total-atention');
const totalLeveEl = document.getElementById('total-leve');
const tbodyEl = document.getElementById('leads-tbody');
const refreshBtn = document.getElementById('refresh-data');
const searchInput = document.getElementById('search-name');

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
        renderCharts(data);
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

function renderCharts(data) {
    // Age Distribution
    const ageCounts = {};
    data.forEach(d => {
        const age = d.ageRange || 'Desconocido';
        ageCounts[age] = (ageCounts[age] || 0) + 1;
    });

    if (ageChart) ageChart.destroy();
    const ageCtx = document.getElementById('ageChart').getContext('2d');
    ageChart = new Chart(ageCtx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(ageCounts),
            datasets: [{
                data: Object.values(ageCounts),
                backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } } }
        }
    });

    // Risk Scores
    if (riskChart) riskChart.destroy();
    const riskCtx = document.getElementById('riskChart').getContext('2d');
    riskChart = new Chart(riskCtx, {
        type: 'line',
        data: {
            labels: data.slice(0, 10).reverse().map(d => d.name || 'Anónimo'),
            datasets: [
                {
                    label: 'Score K10',
                    data: data.slice(0, 10).reverse().map(d => d.k10Score),
                    borderColor: '#10b981',
                    tension: 0.4
                },
                {
                    label: 'Score PHQ9',
                    data: data.slice(0, 10).reverse().map(d => d.phq9Score),
                    borderColor: '#3b82f6',
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
            },
            plugins: { legend: { labels: { color: '#94a3b8' } } }
        }
    });
}

function renderTable(data) {
    tbodyEl.innerHTML = '';
    data.forEach(d => {
        const date = d.timestamp?.toDate ? d.timestamp.toDate().toLocaleDateString() : 'N/A';
        const statusClass = d.suicideFlag ? 'badge-red' : (d.phq9Score >= 5 || d.k10Score >= 15) ? 'badge-orange' : 'badge-green';
        const statusText = d.suicideFlag ? 'ALERTA ROJA' : (d.phq9Score >= 5 || d.k10Score >= 15) ? 'Riesgo Alto' : 'Normal';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${date}</td>
            <td style="font-weight: 600;">${d.name || 'Anónimo'}</td>
            <td>${d.ageRange || '-'}</td>
            <td>${d.k10Score || 0}</td>
            <td>${d.phq9Score || 0}</td>
            <td>${d.substanceFlag ? 'SÍ' : 'No'}</td>
            <td><span class="badge ${statusClass}">${statusText}</span></td>
        `;
        tbodyEl.appendChild(tr);
    });
}

refreshBtn.addEventListener('click', fetchAndRender);
searchInput.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    const rows = tbodyEl.querySelectorAll('tr');
    rows.forEach(row => {
        const name = row.querySelector('td:nth-child(2)').innerText.toLowerCase();
        row.style.display = name.includes(val) ? '' : 'none';
    });
});

// Init
fetchAndRender();
