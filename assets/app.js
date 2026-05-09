// SPDX-FileCopyrightText: Copyright (C) ARDUINO SRL (http://www.arduino.cc)
//
// SPDX-License-Identifier: MPL-2.0

const recentDetectionsElement = document.getElementById('recentDetections');
const feedbackContentElement = document.getElementById('feedback-content');
const MAX_RECENT_SCANS = 5;
let scans = [];
const socket = io(`http://${window.location.host}`); // Initialize socket.io connection
let errorContainer = document.getElementById('error-container');

// Start the application
document.addEventListener('DOMContentLoaded', () => {
    initSocketIO();
    initializeConfidenceSlider();
    updateFeedback(null);
    renderDetections();

    // Popover logic
    const confidencePopoverText = "Minimum confidence score for detected objects. Lower values show more results but may include false positives.";
    const feedbackPopoverText = "When the camera detects an object like cat, cell phone, clock, cup, dog or potted plant, a picture and a message will be shown here.";

    document.querySelectorAll('.info-btn.confidence').forEach(img => {
        const popover = img.nextElementSibling;
        img.addEventListener('mouseenter', () => {
            popover.textContent = confidencePopoverText;
            popover.style.display = 'block';
        });
        img.addEventListener('mouseleave', () => {
            popover.style.display = 'none';
        });
    });

    document.querySelectorAll('.info-btn.feedback').forEach(img => {
        const popover = img.nextElementSibling;
        img.addEventListener('mouseenter', () => {
            popover.textContent = feedbackPopoverText;
            popover.style.display = 'block';
        });
        img.addEventListener('mouseleave', () => {
            popover.style.display = 'none';
        });
    });
});

function initSocketIO() {
    

socket.on('update_aforament', async (message) => {
    const persones = message.aforament;
    
    // Agafem els elements de l'HTML
    const statusText = document.getElementById('status-text');
    const personCount = document.getElementById('person-count');
    const timeUpdate = document.getElementById('time-update');
    const liveBar = document.getElementById('live-bar');

    // 1. Actualitzem el número
    personCount.textContent = persones;

    // 2. Traduïm l'aforament a text d'estat (tipus Google Maps)
    // Pots ajustar aquests números segons la càmera
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

    // 3. Calculem l'alçada de la barra rosa (percentatge)
    let percentatge = (persones / capacitatMaxima) * 100;
    if (percentatge > 100) percentatge = 100; // Que no surti del gràfic
    if (percentatge < 5 && persones > 0) percentatge = 5; // Mínim visual si hi ha algú

    liveBar.style.height = `${percentatge}%`;

    // 4. Actualitzem l'hora
    const hora = new Date(message.timestamp).toLocaleTimeString('ca-ES');
    timeUpdate.textContent = `Actualitzat a les ${hora}`;
});

socket.on('connect', () => {
    console.log("Connectat al backend!");
});

}

function updateFeedback(detection) {
    const objectInfo = {
        "cat": { text: "Meow!", gif: "cat.webp" },
        "cell phone": { text: "Stay connected", gif: "phone.webp" },
        "clock": { text: "Time to go", gif: "clock.webp" },
        "cup": { text: "Need a break?", gif: "cup.webp" },
        "dog": { text: "Walkies?", gif: "dog.webp" },
        "potted plant": { text: "Glow your ideas!", gif: "plant.webp" }
    };

    if (detection && objectInfo[detection.content]) {
        const info = objectInfo[detection.content];
        const confidence = Math.floor(detection.confidence * 100);
        feedbackContentElement.innerHTML = `
            <div class="feedback-detection">
                <div class="percentage">${confidence}%</div>
                <img src="img/${info.gif}" alt="${detection.content}">
                <p>${info.text}</p>
            </div>
        `;
    } else {
        feedbackContentElement.innerHTML = `
            <img src="img/stars.svg" alt="Stars">
            <p class="feedback-text">System response will appear here</p>
        `;
    }
}

function printDetection(newDetection) {
    scans.unshift(newDetection);
    if (scans.length > MAX_RECENT_SCANS) { scans.pop(); }
}

// Function to render the list of scans
function renderDetections() {
    // Clear the list
    recentDetectionsElement.innerHTML = ``;

    if (scans.length === 0) {
        recentDetectionsElement.innerHTML = `
            <div class="no-recent-scans">
                <img src="./img/no-face.svg">
                No object detected yet
            </div>
        `;
        return;
    }

    scans.forEach((scan) => {
        const row = document.createElement('div');
        row.className = 'scan-container';

        // Create a container for content and time
        const cellContainer = document.createElement('span');
        cellContainer.className = 'scan-cell-container cell-border';

        // Content (text + icon)
        const contentText = document.createElement('span');
        contentText.className = 'scan-content';
		const value = scan.confidence;
		const result = Math.floor(value * 1000) / 10;
        contentText.innerHTML = `${result}% - ${scan.content}`;

        // Time
        const timeText = document.createElement('span');
        timeText.className = 'scan-content-time';
        timeText.textContent = new Date(scan.timestamp).toLocaleString('it-IT').replace(',', ' -');

        // Append content and time to the container
        cellContainer.appendChild(contentText);
        cellContainer.appendChild(timeText);

        row.appendChild(cellContainer);
        recentDetectionsElement.appendChild(row);
    });
}


function initializeConfidenceSlider() {
    const confidenceSlider = document.getElementById('confidenceSlider');
    const confidenceInput = document.getElementById('confidenceInput');
    const confidenceResetButton = document.getElementById('confidenceResetButton');

    confidenceSlider.addEventListener('input', updateConfidenceDisplay);
    confidenceInput.addEventListener('input', handleConfidenceInputChange);
    confidenceInput.addEventListener('blur', validateConfidenceInput);
    updateConfidenceDisplay();

    confidenceResetButton.addEventListener('click', (e) => {
        if (e.target.classList.contains('reset-icon') || e.target.closest('.reset-icon')) {
            resetConfidence();
        }
    });
}

function handleConfidenceInputChange() {
    const confidenceInput = document.getElementById('confidenceInput');
    const confidenceSlider = document.getElementById('confidenceSlider');

    let value = parseFloat(confidenceInput.value);

    if (isNaN(value)) value = 0.5;
    if (value < 0) value = 0;
    if (value > 1) value = 1;

    confidenceSlider.value = value;
    updateConfidenceDisplay();
}

function validateConfidenceInput() {
    const confidenceInput = document.getElementById('confidenceInput');
    let value = parseFloat(confidenceInput.value);

    if (isNaN(value)) value = 0.5;
    if (value < 0) value = 0;
    if (value > 1) value = 1;

    confidenceInput.value = value.toFixed(2);

    handleConfidenceInputChange();
}

function updateConfidenceDisplay() {
    const confidenceSlider = document.getElementById('confidenceSlider');
    const confidenceInput = document.getElementById('confidenceInput');
    const confidenceValueDisplay = document.getElementById('confidenceValueDisplay');
    const sliderProgress = document.getElementById('sliderProgress');

    const value = parseFloat(confidenceSlider.value);
    socket.emit('override_th', value); // Send confidence to backend
    const percentage = (value - confidenceSlider.min) / (confidenceSlider.max - confidenceSlider.min) * 100;

    const displayValue = value.toFixed(2);
    confidenceValueDisplay.textContent = displayValue;

    if (document.activeElement !== confidenceInput) {
        confidenceInput.value = displayValue;
    }

    sliderProgress.style.width = percentage + '%';
    confidenceValueDisplay.style.left = percentage + '%';
}

function resetConfidence() {
    const confidenceSlider = document.getElementById('confidenceSlider');
    const confidenceInput = document.getElementById('confidenceInput');

    confidenceSlider.value = '0.5';
    confidenceInput.value = '0.50';
    updateConfidenceDisplay();
}
