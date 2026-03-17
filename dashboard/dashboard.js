import { supabase } from '../supabase-config.js';

const CHAT_LOG_COLLECTION = "conasama_responses";
const PRESENCE_COLLECTION = "presence";

// Chart & Map instances
let map;

const MOCK_COORDS = {
    'CDMX': [19.4326, -99.1332],
    'EDOMEX': [19.3503, -99.6450],
    'JAL': [20.6597, -103.3496]
};

const totalUsersEl = document.getElementById('total-users');
const totalEmergenciesEl = document.getElementById('total-emergencies');
const totalAttentionEl = document.getElementById('total-atention');
const totalLeveEl = document.getElementById('total-leve');
const tbodyEl = document.getElementById('leads-tbody');
const refreshBtn = document.getElementById('refresh-data');
const searchInput = document.getElementById('search-name');
const stateFilter = document.getElementById('filter-state');
const muniFilter = document.getElementById('filter-municipality');
const geoSearchInput = document.getElementById('search-geo');
const womenCountEl = document.getElementById('total-women');
const menCountEl = document.getElementById('total-men');
const nbCountEl = document.getElementById('total-nb');
const otherCountEl = document.getElementById('total-other');

let fullData = [];
let filteredData = [];
let unidadesDatos = []; // Directorio UNEME
let currentRiskFilter = 'total'; // 'total', 'red', 'orange', 'green'
let currentGenderFilter = 'total'; // 'total', 'mujer', 'hombre', 'no-binario', 'otro'

// Auth & Role State
let currentUser = null;
let userProfile = null;

// Auth bypass for demo / Supabase Migration
document.addEventListener('DOMContentLoaded', () => {
    currentUser = { email: 'admin@conasama.gob.mx' };
    userProfile = { role: 'master', name: 'Administrador Maestro' };
    
    updateNavProfile();
    initDashboard();
});


function updateNavProfile() {
    const navName = document.getElementById('nav-user-name');
    const navRole = document.getElementById('nav-user-role');
    const navAvatar = document.getElementById('nav-avatar');
    const navDate = document.getElementById('nav-date');
    const navCity = document.getElementById('nav-city');
    const navTime = document.getElementById('nav-time');

    if (userProfile) {
        navName.innerText = userProfile.name || currentUser.email.split('@')[0].toUpperCase();
        navRole.innerText = userProfile.role === 'master' ? 'Administrador Maestro' : 
                          userProfile.role === 'PS' ? 'Psicólogo Especialista' :
                          userProfile.role === 'TS' ? 'Trabajador Social' : 'Consultor';
        
        if (userProfile.avatarUrl) {
            navAvatar.src = userProfile.avatarUrl;
        }
    }

    // Set Date & Time
    const updateTime = () => {
        const now = new Date();
        const dateOptions = { day: 'numeric', month: 'short', year: 'numeric' };
        const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: true };
        
        if (navDate) navDate.innerText = now.toLocaleDateString('es-ES', dateOptions);
        if (navTime) navTime.innerText = now.toLocaleTimeString('en-US', timeOptions);
    };

    updateTime();
    setInterval(updateTime, 30000); // Update every 30 seconds

    // City Mock
    if (navCity) navCity.innerText = "CDMX, México";
}

document.getElementById('btn-print-report')?.addEventListener('click', () => {
    window.print();
});

function initDashboard() {
    initMap();
    fetchAndRender();
    if (userProfile.role === 'master') {
        document.getElementById('admin-panel').style.display = 'block';
        listAdmins();
    }
}

async function listAdmins() {
    // Admin list mocked for now since we migrated DB
    const tbody = document.getElementById('admins-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="4">Gestión de usuarios en servidor SQL Supabase.</td></tr>';
}

const btnCreateAdmin = document.getElementById('btn-create-admin');
if (btnCreateAdmin) {
    btnCreateAdmin.onclick = async () => {
        const email = document.getElementById('new-admin-email').value;
        const role = document.getElementById('new-admin-role').value;
        const regions = document.getElementById('new-admin-regions').value.split(',').map(r => r.trim()).filter(r => r);
        
        if (!email) return alert("Ingrese un correo");
        
        // Permanent ID Logic: Get count of current roles to generate PS0001, TS0002, etc.
        const q = query(collection(db, "admins"));
        const snap = await getDocs(q);
        let roleCount = 1;
        snap.forEach(doc => {
            if (doc.data().role === role) roleCount++;
        });

        const paddedId = String(roleCount).padStart(4, '0');
        const operatorId = role === 'master' || role === 'viewer' ? 'ADM' + paddedId : role + paddedId;

        alert(`Simulación: Usuario ${email} autorizado como ${role} con ID permanente: ${operatorId}.`);
        
        // In a real flow, we would setDoc(doc(db, "admins", generatedUid), { email, role, operatorId, ... })
    };
}
async function fetchAndRender() {
    console.log("Setting up real-time listener with Supabase...");

    const loadData = async () => {
        const { data, error, count } = await supabase
            .from('conasama_responses')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .limit(2000);

        if (error) {
            console.error("Error fetching from Supabase:", error);
            return;
        }

        fullData = data.map(d => ({
            ...d,
            k10Score: d.k10_score,
            phq9Score: d.phq9_score,
            suicideFlag: d.suicide_flag,
            ageRange: d.age_range,
            // gender should already be mapping if keys match, but let's be safe
            gender: d.gender,
            timestamp: { toDate: () => new Date(d.created_at) }
        }));

        // Update real total count
        const totalUsersEl = document.getElementById('total-users');
        if (totalUsersEl && currentRiskFilter === 'total') {
            totalUsersEl.innerText = count;
        }

        populateFilters();
        applyFilters();
    };

    const loadUnidades = async () => {
        const { data, error } = await supabase
            .from('unidades_apoyo')
            .select('*');
        
        if (error) {
            console.error("Error cargando UNEMEs:", error);
            return;
        }
        unidadesDatos = data;
        renderMap(filteredData); // Re-render map to show health units
    };

    // Initial load
    await Promise.all([loadData(), loadUnidades()]);

    // Real-time updates
    supabase
        .channel('schema-db-changes')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'conasama_responses' },
            (payload) => {
                console.log('Change received!', payload);
                loadData();
            }
        )
        .subscribe();
    
    listenToPresence();
}

function listenToPresence() {
    const channel = supabase.channel('online-users');
    channel
        .on('presence', { event: 'sync' }, () => {
            const state = channel.presenceState();
            const count = Object.keys(state).length;
            renderActiveUsers(count);
        })
        .subscribe();
}

function renderOverview(data) {
    const total = data.length;
    const emergencies = data.filter(d => d.suicideFlag).length;
    const attention = data.filter(d => !d.suicideFlag && (d.phq9Score >= 10 || d.k10Score >= 25)).length;
    const leve = total - emergencies - attention;

    const women = data.filter(d => (d.gender || '').toLowerCase() === 'mujer').length;
    const men = data.filter(d => (d.gender || '').toLowerCase() === 'hombre').length;
    const nb = data.filter(d => (d.gender || '').toLowerCase() === 'no-binario').length;
    const other = data.filter(d => (d.gender || '').toLowerCase() === 'otro').length;

    // If we are showing "Total", the number is now set by getCountFromServer in the listener
    // but the sub-metrics (emergencies, etc.) still depend on the loaded batch
    if (currentRiskFilter !== 'total') {
        totalUsersEl.innerText = total;
    }
    
    totalEmergenciesEl.innerText = emergencies;
    totalAttentionEl.innerText = attention;
    totalLeveEl.innerText = leve;
    
    if (womenCountEl) womenCountEl.innerText = women;
    if (menCountEl) menCountEl.innerText = men;
    if (nbCountEl) nbCountEl.innerText = nb;
    if (otherCountEl) otherCountEl.innerText = other;
}

function renderActiveUsers(count = 0) {
    const activeNumEl = document.getElementById('active-count');
    if (activeNumEl) {
        activeNumEl.innerText = count;
    }
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

function populateFilters() {
    const states = [...new Set(fullData.map(d => d.state || d.estado))].filter(Boolean).sort();
    const currentState = stateFilter.value;
    
    stateFilter.innerHTML = '<option value="">Todos los Estados</option>';
    states.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.innerText = s;
        if (s === currentState) opt.selected = true;
        stateFilter.appendChild(opt);
    });

    updateMunicipalityFilter();
}

function updateMunicipalityFilter() {
    const selectedState = stateFilter.value;
    let munis = [];
    if (selectedState) {
        munis = [...new Set(fullData.filter(d => (d.state || d.estado) === selectedState).map(d => d.municipio || d.municipality))];
    } else {
        munis = [...new Set(fullData.map(d => d.municipio || d.municipality))];
    }
    munis = munis.filter(Boolean).sort();

    const currentMuni = muniFilter.value;
    muniFilter.innerHTML = '<option value="">Todos los Municipios</option>';
    munis.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.innerText = m;
        if (m === currentMuni) opt.selected = true;
        muniFilter.appendChild(opt);
    });
}

function applyFilters() {
    const nameVal = searchInput.value.toLowerCase();
    const stateVal = stateFilter.value;
    const muniVal = muniFilter.value;
    const geoVal = geoSearchInput.value.toLowerCase();

    filteredData = fullData.filter(d => {
        const matchesName = (d.name || '').toLowerCase().includes(nameVal);
        const matchesState = !stateVal || (d.state || d.estado) === stateVal;
        const matchesMuni = !muniVal || (d.municipio || d.municipality) === muniVal;
        const matchesGeo = !geoVal || (d.codigo_postal || '').toLowerCase().includes(geoVal);
        
        let matchesRisk = true;
        if (currentRiskFilter === 'red') matchesRisk = d.suicideFlag;
        else if (currentRiskFilter === 'orange') matchesRisk = !d.suicideFlag && (d.phq9Score >= 10 || d.k10Score >= 25);
        else if (currentRiskFilter === 'green') matchesRisk = !d.suicideFlag && d.phq9Score < 10 && d.k10Score < 25;

        let matchesGender = true;
        if (currentGenderFilter !== 'total') {
            matchesGender = (d.gender || '').toLowerCase() === currentGenderFilter;
        }

        return matchesName && matchesState && matchesMuni && matchesGeo && matchesRisk && matchesGender;
    });

    renderOverview(filteredData);
    renderMap(filteredData);
    renderTable(filteredData);
    
    zoomToFilter(stateVal, muniVal);
}

function zoomToFilter(state, muni) {
    if (!map) return;
    
    if (muni && filteredData.length > 0) {
        // Zoom to municipality average
        const validCoords = filteredData.filter(d => d.coords && d.coords.lat);
        if (validCoords.length > 0) {
            const latSum = validCoords.reduce((acc, curr) => acc + curr.coords.lat, 0);
            const lonSum = validCoords.reduce((acc, curr) => acc + curr.coords.lon, 0);
            map.setView([latSum / validCoords.length, lonSum / validCoords.length], 10);
        }
    } else if (state && filteredData.length > 0) {
        // Zoom to state average
        const validCoords = filteredData.filter(d => d.coords && d.coords.lat);
        if (validCoords.length > 0) {
            const latSum = validCoords.reduce((acc, curr) => acc + curr.coords.lat, 0);
            const lonSum = validCoords.reduce((acc, curr) => acc + curr.coords.lon, 0);
            map.setView([latSum / validCoords.length, lonSum / validCoords.length], 7);
        }
    } else if (!state && !muni) {
        map.setView([23.6345, -102.5528], 5);
    }
}

function renderMap(data) {
    initMap();
    if (!data || data.length === 0) return;

    // Clear previous markers
    markersLayer.clearLayers();

// Redibujar marcadores de riesgos
    data.forEach(d => {
        let lat, lon;
        let isMock = false;

        if (d.coords && d.coords.lat && d.coords.lon) {
            lat = d.coords.lat;
            lon = d.coords.lon;
        } else if (d.state && MOCK_COORDS[d.state]) {
            [lat, lon] = MOCK_COORDS[d.state];
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
            } else if (d.phq9Score >= 10 || d.k10Score >= 25) {
                markerColor = '#f59e0b'; // Naranja (Riesgo Alto)
                riskLabel = 'Alto Riesgo';
            }
            
            L.circleMarker([lat, lon], {
                radius: 4,
                fillColor: markerColor,
                color: '#fff',
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8
            }).addTo(markersLayer)
              .bindPopup(`<b>${d.name || 'Anónimo'}</b><br>Riesgo: ${riskLabel}<br>${d.municipio || d.municipality || ''}, ${d.estado || d.state || ''}${isMock ? ' (Zona Aprox)' : ''}`);
        }
    });

    // Dibujar Unidades de Apoyo (UNEME-CECOSAMA)
    unidadesDatos.forEach(u => {
        if (u.latitud && u.longitud) {
            // Marcador mucho más pequeño y discreto
            const healthIcon = L.divIcon({
                className: 'health-marker-container',
                html: `<div class="health-dot"></div>`,
                iconSize: [8, 8],
                iconAnchor: [4, 4]
            });

            const marker = L.marker([u.latitud, u.longitud], { 
                icon: healthIcon,
                opacity: 0 // Empezamos ocultos
            })
            .addTo(markersLayer)
            .bindTooltip(`
                <div style="padding:5px;">
                    <b style="color:#6366f1;">🏥 ${u.nombre_unidad}</b><br>
                    <small>${u.institucion}</small><br>
                    <hr style="margin:5px 0; border:0; border-top:1px solid #eee;">
                    <span style="font-size:10px; color:#666;">📍 ${u.direccion}</span>
                </div>
            `, { sticky: true, className: 'glass-tooltip' });

            // Lógica de visibilidad basada en zoom
            const updateVisibility = () => {
                const zoom = map.getZoom();
                if (zoom >= 8) {
                    marker.setOpacity(1);
                } else {
                    marker.setOpacity(0);
                }
            };

            map.on('zoomend', updateVisibility);
            updateVisibility(); // Estado inicial
        }
    });
}


function renderOrdinalIcon(score, type) {
    let icon = '';
    let color = '';
    
    if (type === 'k10') {
        if (score >= 30) { icon = '↓'; color = 'var(--urgent)'; }
        else if (score >= 25) { icon = '↘'; color = 'var(--warning)'; }
        else if (score >= 20) { icon = '↗'; color = '#eab308'; }
        else { icon = '↑'; color = 'var(--healthy)'; }
    } else { // phq9
        if (score >= 20) { icon = '↓'; color = 'var(--urgent)'; }
        else if (score >= 15) { icon = '↘'; color = 'var(--warning)'; }
        else if (score >= 10) { icon = '→'; color = '#f59e0b'; }
        else if (score >= 5) { icon = '↗'; color = '#eab308'; }
        else { icon = '↑'; color = 'var(--healthy)'; }
    }
    
    return `<span class="ordinal-icon" style="background:${color};">${icon}</span>`;
}

function renderTable(data) {
    tbodyEl.innerHTML = '';
    data.forEach(d => {
        const time = d.timestamp?.toDate ? d.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--';
        const statusClass = d.suicideFlag ? 'badge-red' : (d.phq9Score >= 10 || d.k10Score >= 25) ? 'badge-orange' : 'badge-green';
        const statusText = d.suicideFlag ? 'ALERTA ROJA' : (d.phq9Score >= 10 || d.k10Score >= 25) ? 'Riesgo Alto' : 'Normal';

        const tr = document.createElement('tr');
        const isTest = d.source === 'test_seed';
        const location = d.tipo_ubicacion === 'cp' 
            ? `${d.colonia || ''}, ${d.municipio || ''}<br><span style="color:var(--text-muted); font-size:0.75rem;">${d.estado || ''} (${d.codigo_postal})</span>`
            : `${d.municipality || ''}<br><span style="color:var(--text-muted); font-size:0.75rem;">${d.state || '-'}</span>`;

        tr.innerHTML = `
            <td>${time}</td>
            <td style="font-weight: 600;">${d.name} ${isTest ? '<br><span class="badge" style="background:#e2e8f0; color:#64748b; font-size:0.6rem; margin-top:4px;">PRUEBA</span>' : '<br><span class="badge" style="background:var(--accent); color:white; font-size:0.6rem; margin-top:4px;">REAL</span>'}</td>
            <td style="white-space: nowrap;">${d.ageRange || '-'}</td>
            <td style="text-transform: capitalize;">${d.gender || '-'}</td>
            <td>${location}</td>
            <td>${d.k10Score || 0}${renderOrdinalIcon(d.k10Score || 0, 'k10')}</td>
            <td>${d.phq9Score || 0}${renderOrdinalIcon(d.phq9Score || 0, 'phq9')}</td>
            <td><span class="badge ${statusClass}">${statusText}</span></td>
            <td>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                    <div style="width:24px; height:24px; background:var(--accent); border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-size:0.6rem; font-weight:800;">
                        ${d.operatorId ? d.operatorId.substring(0,2) : 'PS'}
                    </div>
                    <span style="font-size:0.75rem; font-weight:600;">${d.operatorId || 'PS0024'}</span>
                </div>
            </td>
        `;
        tbodyEl.appendChild(tr);
    });
}

// Lista de prefijos comunes para diversificar la muestra
const CP_PREFIXES = ["010", "045", "066", "110", "200", "290", "300", "441", "450", "500", "550", "640", "720", "760", "800", "970"];

async function getRandomCP() {
    try {
        // Query Supabase for random CP
        const { data, error } = await supabase
            .from('postal_codes')
            .select('*')
            .limit(100); // Get a batch and pick one
            
        if (data && data.length > 0) {
            const item = data[Math.floor(Math.random() * data.length)];
            return {
                cp: item.cp,
                estado: item.estado,
                municipio: item.municipio,
                colonias: item.colonias,
                coords: { lat: item.lat, lon: item.lon }
            };
        }
        
        // Fallback local
        const prefix = CP_PREFIXES[Math.floor(Math.random() * CP_PREFIXES.length)];
        const res = await fetch(`../api/cp/${prefix}.json`);
        if (!res.ok) return null;
        const localData = await res.json();
        const cps = Object.values(localData);
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

    const testData = [];
    for (let i = 0; i < 50; i++) {
        const cpData = await getRandomCP();
        if (!cpData) continue;

        const suicide = Math.random() > 0.85;
        const k10 = suicide ? (Math.floor(Math.random() * 21) + 30) : (Math.floor(Math.random() * 41) + 10);
        let phq = 0;
        
        if (suicide) {
            phq = 24;
        } else {
            phq = Math.floor(Math.random() * 25);
        }

        testData.push({
            name: names[Math.floor(Math.random() * names.length)] + " (Prueba)",
            age_range: ages[Math.floor(Math.random() * ages.length)],
            gender: genders[Math.floor(Math.random() * genders.length)],
            tipo_ubicacion: 'cp',
            codigo_postal: cpData.cp,
            estado: cpData.estado,
            municipio: cpData.municipio,
            colonia: cpData.colonias[0],
            k10_score: k10,
            phq9_score: phq,
            suicide_flag: suicide,
            coords: cpData.coords,
            source: 'test_seed'
        });
    }

    const { error } = await supabase
        .from('conasama_responses')
        .insert(testData);

    if (error) {
        alert("Error al cargar datos en Supabase: " + error.message);
    } else {
        alert(`¡50 casos de prueba con ubicaciones reales cargados exitosamente en Supabase!`);
    }
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

searchInput.addEventListener('input', applyFilters);
stateFilter.addEventListener('change', () => {
    updateMunicipalityFilter();
    applyFilters();
});
muniFilter.addEventListener('change', applyFilters);
geoSearchInput.addEventListener('input', applyFilters);

// Risk Card Filtering
document.querySelectorAll('.filter-card').forEach(card => {
    card.addEventListener('click', () => {
        const filter = card.getAttribute('data-filter');
        
        if (currentRiskFilter === filter) {
            currentRiskFilter = 'total';
        } else {
            currentRiskFilter = filter;
        }

        // Update UI
        document.querySelectorAll('.filter-card').forEach(c => c.classList.remove('active'));
        if (currentRiskFilter !== 'total') {
            card.classList.add('active');
        }

        applyFilters();
    });
});

// Gender Item Filtering
document.querySelectorAll('.filter-gender').forEach(item => {
    item.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent triggering the parent card click
        const gender = item.getAttribute('data-gender');
        
        if (currentGenderFilter === gender) {
            currentGenderFilter = 'total';
        } else {
            currentGenderFilter = gender;
        }

        // Update UI
        document.querySelectorAll('.filter-gender').forEach(i => i.classList.remove('active'));
        if (currentGenderFilter !== 'total') {
            item.classList.add('active');
        }

        applyFilters();
    });
});
