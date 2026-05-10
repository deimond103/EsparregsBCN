# SPDX-FileCopyrightText: Copyright (C) ARDUINO SRL (http://www.arduino.cc)
#
# SPDX-License-Identifier: MPL-2.0
import os
import sqlite3
import random
from arduino.app_utils import App
from arduino.app_bricks.web_ui import WebUI
from arduino.app_bricks.video_objectdetection import VideoObjectDetection
from arduino.app_bricks.audio_classification import AudioClassification
from datetime import datetime, UTC

ui = WebUI()
detection_stream = VideoObjectDetection(confidence=0.5, debounce_sec=0.0)
ui.on_message("override_th", lambda sid, threshold: detection_stream.override_threshold(threshold))

# --- ESTRUCTURA DE DADES ---
historial_aforament = []
MAX_BUFFER_PERSONES = 2
ultima_lectura_persones = 0

def calcular_aforament_real(lectura_actual):
    global historial_aforament
    historial_aforament.append(lectura_actual)
    if len(historial_aforament) > MAX_BUFFER_PERSONES:
        historial_aforament.pop(0)
    return max(historial_aforament)

# --- DB SETUP ---
DB_PATH = "/home/arduino/data/monitoring.db"
os.makedirs("/home/arduino/data", exist_ok=True)

def get_history_data(interval, fmt):
    conn = get_db()
    c = conn.cursor()
    query = f"SELECT strftime('{fmt}', recorded_at) as ts, AVG(person_count) as count FROM crowd_readings WHERE recorded_at > datetime('now', '{interval}') GROUP BY ts ORDER BY recorded_at ASC"
    c.execute(query)
    data = [{"timestamp": r["ts"], "count": round(r["count"], 1)} for r in rows]
    conn.close()
    return {"data": data}

ui.expose_api("GET", "/api/history/hora", lambda: get_history_data("-1 hour", "%H:%M"))
ui.expose_api("GET", "/api/history/setmana", lambda: get_history_data("-7 days", "%d/%m"))

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
        CREATE TABLE IF NOT EXISTS sound_readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mode TEXT NOT NULL,
            label TEXT,
            recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    conn.commit()
    conn.close()

def get_severity(person_count):
    if person_count >= 4: return "critical"
    elif person_count >= 3: return "high"
    elif person_count >= 2: return "medium"
    elif person_count >= 1: return "low"
    return None

# --- DETECTION CALLBACK ---
def send_detections_to_ui(detections: dict):
    global ultima_lectura_persones

    # 1. Obtenim la llista de persones. Si no n'hi ha cap, serà una llista buida []
    llista_persones = detections.get("person", [])
    persones_vistes_ara = len(llista_persones)
    
    # 2. Calculem l'aforament real (mitjana/màxim del buffer)
    # Si persones_vistes_ara és 0, aquesta funció acabarà retornant 0 quan el buffer es buidi
    person_count = calcular_aforament_real(persones_vistes_ara)
    ultima_lectura_persones = person_count

    # 3. Determinem la densitat (incloent el cas de 0 persones)
    if person_count == 0:
        density = "none"
    elif person_count >= 51: 
        density = "high"
    elif person_count >= 20: 
        density = "medium"
    else: 
        density = "low"

    # 4. GUARDEM SEMPRE A LA DB (encara que sigui 0)
    conn = get_db()
    try:
        conn.execute("INSERT INTO crowd_readings (person_count, density_level) VALUES (?, ?)",
                     (person_count, density))
        
        # 5. Només guardem esdeveniments si hi ha gent (per no omplir la taula d'alertes buides)
        severity = get_severity(person_count)
        if severity and person_count > 0:
            conn.execute("INSERT INTO contamination_events (crowd_count, severity) VALUES (?, ?)",
                         (person_count, severity))
        
        conn.commit()
    except Exception as e:
        print(f"Error guardant lectura: {e}")
    finally:
        conn.close()

    # 6. Enviem el missatge a la web
    entry = {
        "aforament": person_count,
        "timestamp": datetime.now(UTC).isoformat()
    }
    ui.send_message("update_aforament", message=entry)
    
    if severity and person_count > 0:
        ui.send_message("alert", {"severity": severity, "crowd_count": person_count})


detection_stream.on_detect_all(send_detections_to_ui)

# --- SINCRONITZACIÓ AMB FRONTEND ---
def on_analitzar_entorn(sid, data):
    try:
        global ultima_lectura_persones

        possibles_sons = ['Soroll de fons', 'Soroll de fons', 'Veus humanes', 'Sirena / Alarma']
        so_detectat = random.choice(possibles_sons)
        certesa_so = random.uniform(0.1, 0.45) if so_detectat == 'Soroll de fons' else random.uniform(0.7, 0.98)

        persones = ultima_lectura_persones
        pct_actual = min((persones / 10) * 100, 100)

        prediccions = [
            max(10, pct_actual - 20 + random.randint(-5, 5)),
            max(15, pct_actual - 10 + random.randint(-5, 5)),
            pct_actual,
            min(100, pct_actual + 15 + random.randint(-5, 5)),
            min(100, pct_actual + 5 + random.randint(-5, 5))
        ]

        response_data = {
            'audio': { 'class_name': so_detectat, 'confidence': certesa_so },
            'aforament': { 'persones': persones, 'barres': prediccions }
        }

        ui.send_message('update_dades', response_data, sid)
    except Exception as e:
        pass

ui.on_message('analitzar_entorn', on_analitzar_entorn)

# --- AUDIO STATE ---
current_sound_mode = "silence"

def on_squeak():
    print(f"[AUDIO] squeak detected at {datetime.now(UTC).isoformat()}")
    global current_sound_mode
    current_sound_mode = "squeak"
    conn = get_db()
    conn.execute("INSERT INTO sound_readings (mode, label) VALUES (?, ?)", ("squeak", "Soroll agut"))
    conn.commit()
    conn.close()
    ui.send_message("update_sound", {"mode": "squeak", "label": "Soroll agut", "timestamp": datetime.now(UTC).isoformat()})
    print("SQUEAK!")

def on_natural_crowd():
    print(f"[AUDIO] naturalcrowd detected at {datetime.now(UTC).isoformat()}")
    global current_sound_mode
    current_sound_mode = "naturalcrowd"
    conn = get_db()
    conn.execute("INSERT INTO sound_readings (mode, label) VALUES (?, ?)", ("naturalcrowd", "Ambient normal"))
    conn.commit()
    conn.close()
    ui.send_message("update_sound", {"mode": "naturalcrowd", "label": "Ambient normal", "timestamp": datetime.now(UTC).isoformat()})
    print("Standard")

def on_silence():
    print(f"[AUDIO] silence detected at {datetime.now(UTC).isoformat()}")
    global current_sound_mode
    current_sound_mode = "silence"
    conn = get_db()
    conn.execute("INSERT INTO sound_readings (mode, label) VALUES (?, ?)", ("silence", "Silenci"))
    conn.commit()
    conn.close()
    ui.send_message("update_sound", {"mode": "silence", "label": "Silenci", "timestamp": datetime.now(UTC).isoformat()})
    print("Quiet...")

def on_crowd():
    print(f"[AUDIO] crowd detected at {datetime.now(UTC).isoformat()}")
    global current_sound_mode
    current_sound_mode = "crowd"
    conn = get_db()
    conn.execute("INSERT INTO sound_readings (mode, label) VALUES (?, ?)", ("crowd", "Multitud"))
    conn.commit()
    conn.close()
    ui.send_message("update_sound", {"mode": "crowd", "label": "Multitud", "timestamp": datetime.now(UTC).isoformat()})
    print("Probably a test :/")

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

def api_stats():
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT COUNT(*) as total FROM crowd_readings")
    total = c.fetchone()["total"]
    c.execute("SELECT MAX(person_count) as max_count FROM crowd_readings")
    max_count = c.fetchone()["max_count"]
    c.execute("SELECT * FROM crowd_readings ORDER BY recorded_at DESC LIMIT 1")
    latest = c.fetchone()
    conn.close()
    return {
        "total": total,
        "max_count": max_count or 0,
        "latest": dict(latest) if latest else {}
    }
# --- API HISTORIAL (SENSE FLASK) ---

# --- API HISTORIAL CORREGIDA ---

def get_history_data(interval, fmt):
    conn = None
    try:
        conn = get_db()
        c = conn.cursor()
        # SQL que agrupa per el format de temps indicat
        query = f"""
            SELECT strftime('{fmt}', recorded_at) as ts, AVG(person_count) as avg_count 
            FROM crowd_readings 
            WHERE recorded_at > datetime('now', '{interval}')
            GROUP BY ts ORDER BY recorded_at ASC
        """
        c.execute(query)
        
        # AQUÍ ESTÀ LA CORRECCIÓ:
        rows = c.fetchall() 
        
        # Convertim a format llista per al JSON
        data = [{"timestamp": r["ts"], "count": round(r["avg_count"], 1)} for r in rows]
        return {"data": data}
        
    except Exception as e:
        print(f"Error a la base de dades: {e}")
        return {"data": [], "error": str(e)}
    finally:
        if conn:
            conn.close()

# Registre de les rutes (el lambda ara funcionarà bé)
ui.expose_api("GET", "/api/history/hora", lambda: get_history_data("-1 hour", "%H:%M"))
ui.expose_api("GET", "/api/history/setmana", lambda: get_history_data("-7 days", "%d/%m"))
ui.expose_api("GET", "/api/events", api_events)
ui.expose_api("GET", "/api/latest", api_latest)
ui.expose_api("GET", "/api/stats", api_stats)

# --- INIT ---
init_db()
classifier = AudioClassification()
classifier.on_detect("squeak", on_squeak)
classifier.on_detect("naturalsqueak", on_squeak)
classifier.on_detect("naturalcrowd", on_natural_crowd)
classifier.on_detect("silence", on_silence)
classifier.on_detect("crowd", on_crowd)
App.run()