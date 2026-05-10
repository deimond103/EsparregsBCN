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

// --- SOCKET ---
function initSocketIO() {
    socket.on('update_aforament', (message) => {
        const persones = message.aforament;

        const statusText =
            document.getElementById('status-text');

        const personCount =
            document.getElementById('person-count');

        const timeUpdate =
            document.getElementById('time-update');

        const liveBar =
            document.getElementById('live-bar');

        personCount.textContent = persones;

        if (persones >= 3) {
            updateDensity('Alta', '#c5221f');
            statusText.textContent = "Molt concorregut";

        } else if (persones >= 2) {
            updateDensity('Mitjana', '#b06000');
            statusText.textContent = "Força concorregut";

        } else if (persones >= 1) {
            updateDensity('Baixa', '#137333');
            statusText.textContent = "Poc concorregut";

        } else {
            updateDensity('Buit', '#555555');
            statusText.textContent = "Buit";
        }

        let percentatge = (persones / 10) * 100;

        if (percentatge > 100) percentatge = 100;
        if (percentatge < 5 && persones > 0) percentatge = 5;

        liveBar.style.height = `${percentatge}%`;

        const hora = new Date(message.timestamp)
            .toLocaleTimeString('ca-ES');

        timeUpdate.textContent =
            `Actualitzat a les ${hora}`;
    });

    socket.on('update_sound', (message) => {
        const s =
            SOUND_LABELS[message.mode] ||
            SOUND_LABELS.silence;

        document.getElementById('sound-status')
            .textContent = s.label;

        document.querySelectorAll('.sound-mode-box')
            .forEach(el => {
                el.classList.remove('active');
                el.style.background = '';
                el.style.color = '';
                el.style.fontWeight = '';
            });

        const activeBox =
            document.getElementById(`mode-${message.mode}`);

        if (activeBox) {
            activeBox.classList.add('active');
            activeBox.style.background = s.bg;
            activeBox.style.color = s.color;
            activeBox.style.fontWeight = '700';
        }

        const hora = new Date(message.timestamp)
            .toLocaleTimeString('ca-ES');

        document.getElementById('sound-time')
            .textContent = `Actualitzat a les ${hora}`;
    });

    socket.on('alert', () => {
        const panel =
            document.getElementById('events-panel');

        panel.classList.add('alert-flash');

        setTimeout(() => {
            panel.classList.remove('alert-flash');
        }, 1000);

        fetchEvents();
        fetchStats();
    });

    socket.on('connect', () => {
        console.log("Connectat al backend!");
    });
}