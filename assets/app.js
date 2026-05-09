// SPDX-FileCopyrightText: Copyright (C) ARDUINO SRL (http://www.arduino.cc)
//
// SPDX-License-Identifier: MPL-2.0

const socket = io(`http://${window.location.host}`);

const SEVERITY_COLORS = {
    low: { bg: '#e6f4ea', text: '#137333', label: 'Baix' },
    medium: { bg: '#fef7e0', text: '#b06000', label: 'Mitjà' },
    high: { bg: '#fce8e6', text: '#c5221f', label: 'Alt' },
    critical: { bg: '#c5221f', text: '#fff', label: 'Crític' }
};

const DENSITY_LABELS = {
    low: 'Baixa',
    medium: 'Mitjana',
    high: 'Alta'
};

// --- DB FETCH FUNCTIONS ---
async function fetchEvents() {
    try {
        const res = await fetch(`http://${window.location.host}/api/events`);
        const data = await res.json();
        renderEvents(data.events || []);
    } catch (e) {
        document.getElementById('events-list').innerHTML = '<p class="feedback-text">Error carregant alertes.</p>';
    }
}

async function fetchStats() {
    try {
        const res = await fetch(`http://${window.location.host}/api/stats`);
        const data = await res.json();
        document.getElementById('total-records').textContent = data.total ?? '—';
        document.getElementById('max-detected').textContent = data.max_count != null ? data.max_count + ' persones' : '—';
        if (data.latest && data.latest.density_level) {
            const density = DENSITY_LABELS[data.latest.density_level] || data.latest.density_level;
            const densityEl = document.getElementById('current-density');
            densityEl.textContent = density;
            densityEl.style.color = data.latest.density_level === 'high' ? '#c5221f' :
                                     data.latest.density_level === 'medium' ? '#b06000' : '#137333';
        }
    } catch (e) {
        console.error('Error fetching stats:', e);
    }
}

function renderEvents(events) {
    const list = document.getElementById('events-list');
    if (!events.length) {
        list.innerHTML = '<p class="feedback-text">Cap alerta registrada.</p>';
        return;
    }
    list.innerHTML = events.map(ev => {
        const s = SEVERITY_COLORS[ev.severity] || SEVERITY_COLORS.low;
        const time = new Date(ev.triggered_at).toLocaleString('ca-ES');
        return `
            <div class="event-row">
                <span class="severity-badge" style="background:${s.bg};color:${s.text}">${s.label}</span>
                <span class="event-detail">${ev.crowd_count} persones</span>
                <span class="event-time">${time}</span>
            </div>
        `;
    }).join('');

    if (events[0]) {
        const time = new Date(events[0].triggered_at).toLocaleTimeString('ca-ES');
        const lastAlertEl = document.getElementById('last-alert');
        const s = SEVERITY_COLORS[events[0].severity] || SEVERITY_COLORS.low;
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

// --- SOCKET ---
function initSocketIO() {
    socket.on('update_aforament', (message) => {
        const persones = message.aforament;
        const statusText = document.getElementById('status-text');
        const personCount = document.getElementById('person-count');
        const timeUpdate = document.getElementById('time-update');
        const liveBar = document.getElementById('live-bar');

        personCount.textContent = persones;

        if (persones === 0) {
            statusText.textContent = "Buit";
        } else if (persones <= 3) {
            statusText.textContent = "Poc concorregut";
        } else if (persones <= 7) {
            statusText.textContent = "Força concorregut";
        } else {
            statusText.textContent = "Molt concorregut";
        }

        let percentatge = (persones / 10) * 100;
        if (percentatge > 100) percentatge = 100;
        if (percentatge < 5 && persones > 0) percentatge = 5;
        liveBar.style.height = `${percentatge}%`;

        const hora = new Date(message.timestamp).toLocaleTimeString('ca-ES');
        timeUpdate.textContent = `Actualitzat a les ${hora}`;
    });

    socket.on('alert', () => {
        const panel = document.getElementById('events-panel');
        panel.classList.add('alert-flash');
        setTimeout(() => panel.classList.remove('alert-flash'), 1000);
        fetchEvents();
        fetchStats();
    });

    socket.on('connect', () => {
        console.log("Connectat al backend!");
    });
}