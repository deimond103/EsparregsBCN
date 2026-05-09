# SPDX-FileCopyrightText: Copyright (C) ARDUINO SRL (http://www.arduino.cc)
#
# SPDX-License-Identifier: MPL-2.0
import sqlite3
import os
import random
from arduino.app_utils import App
from arduino.app_bricks.web_ui import WebUI
from arduino.app_bricks.video_objectdetection import VideoObjectDetection
from arduino.app_bricks.audio_classification import AudioClassification

from datetime import datetime, UTC

ui = WebUI()
detection_stream = VideoObjectDetection(confidence=0.5, debounce_sec=0.0)
ui.on_message("override_th", lambda sid, threshold: detection_stream.override_threshold(threshold))

# --- ESTRUCTURA DE DADES (LA "MEMÒRIA" DE LA CÀMERA) ---
historial_aforament = []
MAX_BUFFER_PERSONES = 10  # Guarda les últimes 10 deteccions (aprox 2-3 segons)
ultima_lectura_persones = 0 # Ho guardem per enviar-ho a la web quan ho demani

def calcular_aforament_real(lectura_actual):
    global historial_aforament
    # Afegim la lectura d'aquest instant al registre
    historial_aforament.append(lectura_actual)
    # Si la llista es fa massa llarga, esborrem el record més antic
    if len(historial_aforament) > MAX_BUFFER_PERSONES:
        historial_aforament.pop(0)
    
    # Retornem el màxim d'aquest espai de temps per evitar pèrdues de recompte
    return max(historial_aforament)

# --- DB SETUP ---
DB_PATH = "/home/arduino/data/monitoring.db"
os.makedirs("/home/arduino/data", exist_ok=True)
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS crowd_readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            person_count INTEGER NOT NULL,
            density_level TEXT,
            recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS contamination_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            crowd_count INTEGER,
            severity TEXT,
            triggered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    conn.commit()
    conn.close()

# Nous nivells del teu company
def get_severity(person_count):
    if person_count >= 4: return "critical"
    elif person_count >= 3: return "high"
    elif person_count >= 2: return "medium"
    elif person_count >= 1: return "low"
    return None

# --- DETECTION CALLBACK ---
def send_detections_to_ui(detections: dict):
    global ultima_lectura_persones
    
    # 1. Llegim la càmera i passem el filtre de memòria
    persones_vistes_ara = len(detections.get("person", []))
    person_count = calcular_aforament_real(persones_vistes_ara)
    ultima_lectura_persones = person_count # Ho guardem a la global
    
    density = "high" if person_count >= 51 else "medium" if person_count >= 20 else "low"

    # Save to DB
    conn = get_db()
    conn.execute("INSERT INTO crowd_readings (person_count, density_level) VALUES (?, ?)",
                 (person_count, density))
    severity = get_severity(person_count)
    if severity:
        conn.execute("INSERT INTO contamination_events (crowd_count, severity) VALUES (?, ?)",
                     (person_count, severity))
    conn.commit()
    conn.close()

    # Send to WebUI (Event antic per si algun altre script ho usa)
    entry = {
        "aforament": person_count,
        "timestamp": datetime.now(UTC).isoformat()
    }
    ui.send_message("update_aforament", message=entry)
    if severity:
        ui.send_message("alert", {"severity": severity, "crowd_count": person_count})

detection_stream.on_detect_all(send_detections_to_ui)

# --- SINCRONITZACIÓ AMB FRONTEND (AUDIO + GRÀFICS) ---
def on_analitzar_entorn(sid, data):
    try:
        global ultima_lectura_persones
        
        # Simulem àudio (Mantingueu això actiu per la presentació)
        possibles_sons = ['Soroll de fons', 'Soroll de fons', 'Veus humanes', 'Sirena / Alarma']
        so_detectat = random.choice(possibles_sons)
        certesa_so = random.uniform(0.1, 0.45) if so_detectat == 'Soroll de fons' else random.uniform(0.7, 0.98)
        
        persones = ultima_lectura_persones
        
        # Barres per al gràfic (Simulem prediccions en base a l'ocupació actual)
        # Ajusto la capacitat a 10 persones per fer els percentatges de les barres
        pct_actual = min((persones / 10) * 100, 100) 
        
        prediccions = [
            max(10, pct_actual - 20 + random.randint(-5, 5)), # -2h
            max(15, pct_actual - 10 + random.randint(-5, 5)), # -1h
            pct_actual,                                       # ACTUAL
            min(100, pct_actual + 15 + random.randint(-5, 5)),# +1h
            min(100, pct_actual + 5 + random.randint(-5, 5))  # +2h
        ]

        response_data = {
            'audio': { 'class_name': so_detectat, 'confidence': certesa_so },
            'aforament': { 'persones': persones, 'barres': prediccions }
        }
        
        ui.send_message('update_dades', response_data, sid)
    except Exception as e:
        pass

ui.on_message('analitzar_entorn', on_analitzar_entorn)

# --- API ENDPOINTS ---
def api_events():
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM contamination_events ORDER BY triggered_at DESC LIMIT 20")
    events = [dict(row) for row in c.fetchall()]
    conn.close()
    return {"events": events}

def api_latest():
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM crowd_readings ORDER BY recorded_at DESC LIMIT 1")
    row = c.fetchone()
    conn.close()
    return {"latest": dict(row) if row else {}}

ui.expose_api("GET", "/api/events", api_events)
ui.expose_api("GET", "/api/latest", api_latest)

# --- INIT ---
init_db()
classifier = AudioClassification()
classifier.on_detect("squeak", lambda: print(f"SQUEAK!"))
classifier.on_detect("naturalcrowd", lambda: print(f"Standard"))
classifier.on_detect("silence", lambda: print(f"Quiet..."))
classifier.on_detect("crowd", lambda: print(f"Porbably a test :/ñh,k"))
App.run()