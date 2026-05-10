// SPDX-FileCopyrightText: Copyright (C) ARDUINO SRL (http://www.arduino.cc)
//
// SPDX-License-Identifier: MPL-2.0

const socket = io(`http://${window.location.host}`);

const SEVERITY_COLORS = {
    low: { bg: '#e6f4ea', text: '#137333', label: 'Baix' },
    medium: { bg: '#fef7e0', text: '#b06000', label: 'Mitjà' },
    high: { bg: '#fce8e6', text: '#c5221f', label: 'Alt' },
    critical: { bg: '#fce8e6', text: '#c5221f', label: 'Crític' }
};

const DENSITY_LABELS = {
    low: 'Baixa',
    medium: 'Mitjana',
    high: 'Alta'
};

const SOUND_LABELS = {
    silence: { label: "Silenci", color: "#137333", bg: "#e6f4ea" },
    naturalcrowd: { label: "Ambient normal", color: "#1a73e8", bg: "#e8f0fe" },
    crowd: { label: "Multitud", color: "#b06000", bg: "#fef7e0" },
    squeak: { label: "Soroll agut", color: "#c5221f", bg: "#fce8e6" }
};

let modeActual = 'segons'; // Mode per defecte

let aforamentChart = null;
const MAX_PUNTS = 15;

//CANVI RANG GRAFICA
function canviarRang(nouMode) {
    modeActual = nouMode;
    
    // Estètica: Actualitzar botons actius
    document.querySelectorAll('.chart-controls button').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btn-${nouMode}`).classList.add('active');

    // Netejar la gràfica per carregar dades noves
    aforamentChart.data.labels = [];
    aforamentChart.data.datasets[0].data = [];
    
    if (nouMode === 'segons') {
        // En mode segons, esperem que arribin dades per Socket.io
        aforamentChart.update();
    } else {
        // Per "hora" o "setmana", demanem les dades a la base de dades
        carregarDadesHistoriques(nouMode);
    }
}




// --- HELPERS ---
function getDensityElement() {
    return document.getElementById('current-density');
}

function updateDensity(level, color) {
    const densityEl = getDensityElement();

    if (!densityEl) {
        console.error('Element with id="current-density" not found');
        return;
    }

    densityEl.textContent = level;
    densityEl.style.color = color;
}

// --- DB FETCH FUNCTIONS ---
async function carregarDadesHistoriques(rang) {
    // Si el rang és 'hora', anirà a /api/history/hora
    // Si el rang és 'setmana', anirà a /api/history/setmana
    const url = `/api/history/${rang}`; 
    
    try {
        const response = await fetch(url);
        const text = await response.text(); // Primer llegim com a text per depurar
        
        try {
            const json = JSON.parse(text);
            const dades = json.data;

            if (dades && dades.length > 0) {
                aforamentChart.data.labels = dades.map(d => d.timestamp);
                aforamentChart.data.datasets[0].data = dades.map(d => d.count);
                aforamentChart.update();
            } else {
                console.warn("No hi ha dades per a aquest rang.");
            }
        } catch (e) {
            console.error("El servidor no ha enviat JSON. Ha enviat:", text);
        }
    } catch (e) {
        console.error("Error de connexió:", e);
    }
}


async function fetchEvents() {
    try {
        const res = await fetch(`http://${window.location.host}/api/events`);
        const data = await res.json();
        renderEvents(data.events || []);
    } catch (e) {
        document.getElementById('events-list').innerHTML =
            '<p class="feedback-text">Error carregant alertes.</p>';
    }
}

async function fetchStats() {
    try {
        const res = await fetch(`http://${window.location.host}/api/stats`);
        const data = await res.json();

        document.getElementById('total-records').textContent =
            data.total ?? '—';

        document.getElementById('max-detected').textContent =
            data.max_count != null
                ? data.max_count + ' persones'
                : '—';

    } catch (e) {
        console.error('Error fetching stats:', e);
    }
}

function renderEvents(events) {
    const list = document.getElementById('events-list');

    if (!events.length) {
        list.innerHTML =
            '<p class="feedback-text">Cap alerta registrada.</p>';
        return;
    }

    list.innerHTML = events
        .map(ev => {
            const s =
                SEVERITY_COLORS[ev.severity] ||
                SEVERITY_COLORS.low;

            const time = new Date(ev.triggered_at)
                .toLocaleString('ca-ES');

            return `
                <div class="event-row">
                    <span class="severity-badge"
                        style="background:${s.bg};color:${s.text}">
                        ${s.label}
                    </span>

                    <span class="event-detail">
                        ${ev.crowd_count} persones
                    </span>

                    <span class="event-time">
                        ${time}
                    </span>
                </div>
            `;
        })
        .join('');

    if (events[0]) {
        const time = new Date(events[0].triggered_at)
            .toLocaleTimeString('ca-ES');

        const lastAlertEl =
            document.getElementById('last-alert');

        const s =
            SEVERITY_COLORS[events[0].severity] ||
            SEVERITY_COLORS.low;

        lastAlertEl.textContent = time;
        lastAlertEl.style.color = s.text;
    }
}

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    initSocketIO();
    fetchEvents();
    fetchStats();

    setInterval(fetchEvents, 30000);
    setInterval(fetchStats, 30000);
});

function inicialitzarGrafica() {
    const canvas = document.getElementById('aforamentChart');
    if (!canvas) return; // Seguretat per si el canvas no hi és

    const ctx = canvas.getContext('2d');
    aforamentChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Aforament',
                data: [],
                borderColor: '#1a73e8',
                backgroundColor: 'rgba(26, 115, 232, 0.1)',
                tension: 0.4,
                fill: true,
                pointRadius: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, suggestedMax: 5, ticks: { stepSize: 1 } },
                x: { display: true }
            }
        }
    });
}

// --- SOCKET ---
function initSocketIO() {
    inicialitzarGrafica();
    
    socket.on('update_aforament', (message) => {
        const persones = message.aforament;
        
        // Generem el format de l'hora una sola vegada
        const horaFormat = new Date(message.timestamp).toLocaleTimeString('ca-ES', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });

        const statusText = document.getElementById('status-text');
        const personCount = document.getElementById('person-count');
        const timeUpdate = document.getElementById('time-update');

        // Actualitzem el comptador numèric
        if (personCount) personCount.textContent = persones;

        // Lògica d'estats i densitat
        if (persones >= 3) {
            updateDensity('Alta', '#c5221f');
            if (statusText) statusText.textContent = "Molt concorregut";
        } else if (persones >= 2) {
            updateDensity('Mitjana', '#b06000');
            if (statusText) statusText.textContent = "Força concorregut";
        } else if (persones >= 1) {
            updateDensity('Baixa', '#137333');
            if (statusText) statusText.textContent = "Poc concorregut";
        } else {
            updateDensity('Buit', '#555555');
            if (statusText) statusText.textContent = "Buit";
        }

        // Actualitzem el text de l'última connexió
        if (timeUpdate) {
            timeUpdate.textContent = `Actualitzat a les ${horaFormat}`;
        }

        // --- ACTUALITZACIÓ DE LA GRÀFICA ---
       if (modeActual === 'segons' && aforamentChart) {
          const horaFormat = new Date(message.timestamp).toLocaleTimeString('ca-ES');
          aforamentChart.data.labels.push(horaFormat);
          aforamentChart.data.datasets[0].data.push(message.aforament);
  
          if (aforamentChart.data.labels.length > MAX_PUNTS) {
              aforamentChart.data.labels.shift();
              aforamentChart.data.datasets[0].data.shift();
          }
          aforamentChart.update('none');
      }
    });

    // ... la resta de socket.on (update_sound, alert, etc.) es mantenen igual
    socket.on('update_sound', (message) => {
        const s = SOUND_LABELS[message.mode] || SOUND_LABELS.silence;
        const statusEl = document.getElementById('sound-status');
        if (statusEl) statusEl.textContent = s.label;

        document.querySelectorAll('.sound-mode-box').forEach(el => {
            el.classList.remove('active');
            el.style.background = '';
            el.style.color = '';
            el.style.fontWeight = '';
        });

        const activeBox = document.getElementById(`mode-${message.mode}`);
        if (activeBox) {
            activeBox.classList.add('active');
            activeBox.style.background = s.bg;
            activeBox.style.color = s.color;
            activeBox.style.fontWeight = '700';
        }

        const horaSo = new Date(message.timestamp).toLocaleTimeString('ca-ES');
        const timeSoEl = document.getElementById('sound-time');
        if (timeSoEl) timeSoEl.textContent = `Actualitzat a les ${horaSo}`;
    });

    socket.on('alert', () => {
        const panel = document.getElementById('events-panel');
        if (panel) {
            panel.classList.add('alert-flash');
            setTimeout(() => panel.classList.remove('alert-flash'), 1000);
        }
        fetchEvents();
        fetchStats();
    });

    socket.on('connect', () => {
        console.log("Connectat al backend!");
    });
}