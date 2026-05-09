# SPDX-FileCopyrightText: Copyright (C) ARDUINO SRL (http://www.arduino.cc)
#
# SPDX-License-Identifier: MPL-2.0
import sqlite3
import os
from arduino.app_utils import App
from arduino.app_bricks.web_ui import WebUI
from arduino.app_bricks.video_objectdetection import VideoObjectDetection
from datetime import datetime, UTC

ui = WebUI()
detection_stream = VideoObjectDetection(confidence=0.5, debounce_sec=0.0)
ui.on_message("override_th", lambda sid, threshold: detection_stream.override_threshold(threshold))

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

def get_severity(person_count):
    if person_count >= 4: return "critical"
    elif person_count >= 3: return "high"
    elif person_count >= 2: return "medium"
    elif person_count >= 1: return "low"
    return None

# --- DETECTION CALLBACK ---
def send_detections_to_ui(detections: dict):
    person_count = len(detections.get("person", []))
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

    # Send to WebUI
    entry = {
        "aforament": person_count,
        "timestamp": datetime.now(UTC).isoformat()
    }
    ui.send_message("update_aforament", message=entry)
    if severity:
        ui.send_message("alert", {"severity": severity, "crowd_count": person_count})

detection_stream.on_detect_all(send_detections_to_ui)

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
App.run()