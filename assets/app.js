// SPDX-FileCopyrightText: Copyright (C) ARDUINO SRL (http://www.arduino.cc)
//
// SPDX-License-Identifier: MPL-2.0

const recentDetectionsElement = document.getElementById('recentDetections');
const feedbackContentElement = document.getElementById('feedback-content');
const MAX_RECENT_SCANS = 5;
let scans = [];
const socket = io(`http://${window.location.host}`);
let errorContainer = document.getElementById('error-container');

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
        const res = await fetch(`http://${window.location.host}/events`);
        const data = await res.json();
        renderEvents(data.events || []);
    } catch (e) {
        document.getElementById('events-list').innerHTML = '<p class="feedback-text">Error carregant alertes.</p>';
    }
}

async function fetchLatest() {
    try {
        const res = await fetch(`http://${window.location.host}/latest`);
        const data = await res.json();
        renderLatest(data.latest || {});
    } catch (e) {
        console.error('Error fetching latest:', e);
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

    // Update last alert stat
    if (events[0]) {
        const time = new Date(events[0].triggered_at).toLocaleTimeString('ca-ES');
        document.getElementById('last-alert').textContent = time;
        const s = SEVERITY_COLORS[events[0].severity] || SEVERITY_COLORS.low;
        document.getElementById('last-alert').style.color = s.text;
    }

    document.getElementById('total-records').textContent = events.length;
}

function renderLatest(latest) {
    if (!latest || !latest.person_count) return;
    document.getElementById('max-detected').textContent = latest.person_count + ' persones';
    const density = DENSITY_LABELS[latest.density_level] || latest.density_level;
    const densityEl = document.getElementById('current-density');
    densityEl.textContent = density;
    densityEl.style.color = latest.density_level === 'high' ? '#c5221f' :
                             latest.density_level === 'medium' ? '#b06000' : '#137333';
}

// --- SOCKET ---
document.addEventListener('DOMContentLoaded', () => {
    initSocketIO();
    fetchEvents();
    fetchLatest();
    // Refresh every 30 seconds
    setInterval(fetchEvents, 30000);
    setInterval(fetchLatest, 30000);
});

function initSocketIO() {
    socket.on('update_aforament', async (message) => {
        const persones = message.aforament;

        const statusText = document.getElementById('status-text');
        const personCount = document.getElementById('person-count');
        const timeUpdate = document.getElementById('time-update');
        const liveBar = document.getElementById('live-bar');

        personCount.textContent = persones;

        let capacitatMaxima = 10;

        if (persones === 0) {
            statusText.textContent = "Buit";
        } else if (persones <= 3) {
            statusText.textContent = "Poc concorregut";
        } else if (persones <= 7) {
            statusText.textContent = "Força concorregut";
        } else {
            statusText.textContent = "Molt concorregut";
        }

        let percentatge = (persones / capacitatMaxima) * 100;
        if (percentatge > 100) percentatge = 100;
        if (percentatge < 5 && persones > 0) percentatge = 5;
        liveBar.style.height = `${percentatge}%`;

        const hora = new Date(message.timestamp).toLocaleTimeString('ca-ES');
        timeUpdate.textContent = `Actualitzat a les ${hora}`;
    });

    socket.on('alert', (message) => {
        // Flash the events panel and refresh
        const panel = document.getElementById('events-panel');
        panel.classList.add('alert-flash');
        setTimeout(() => panel.classList.remove('alert-flash'), 1000);
        fetchEvents();
    });

    socket.on('connect', () => {
        console.log("Connectat al backend!");
    });
}