# SPDX-FileCopyrightText: Copyright (C) ARDUINO SRL (http://www.arduino.cc)
#
# SPDX-License-Identifier: MPL-2.0
import sqlite3
from arduino.app_utils import App
from arduino.app_bricks.web_ui import WebUI
from arduino.app_bricks.video_objectdetection import VideoObjectDetection
from datetime import datetime, UTC

ui = WebUI()
detection_stream = VideoObjectDetection(confidence=0.5, debounce_sec=0.0)
ui.on_message("override_th", lambda sid, threshold: detection_stream.override_threshold(threshold))

# --- DB SETUP --

# Register a callback for when all objects are detected
# Nova funció per comptar aforament
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

    # Send to WebUI (same as before)
    entry = {
        "aforament": person_count,
        "timestamp": datetime.now(UTC).isoformat()
    }
    ui.send_message("update_aforament", message=entry)

    if severity:
        ui.send_message("alert", {"severity": severity, "crowd_count": person_count})

detection_stream.on_detect_all(send_detections_to_ui)

App.run()