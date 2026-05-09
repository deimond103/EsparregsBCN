# SPDX-FileCopyrightText: Copyright (C) ARDUINO SRL (http://www.arduino.cc)
#
# SPDX-License-Identifier: MPL-2.0

from arduino.app_utils import App
from arduino.app_bricks.web_ui import WebUI
from arduino.app_bricks.video_objectdetection import VideoObjectDetection
from datetime import datetime, UTC

ui = WebUI()
detection_stream = VideoObjectDetection(confidence=0.5, debounce_sec=0.0)

ui.on_message("override_th", lambda sid, threshold: detection_stream.override_threshold(threshold))

# Register a callback for when all objects are detected
# Nova funció per comptar aforament
def send_detections_to_ui(detections: dict):
    person_count = 0
    
    # Comprovem si el model ha detectat alguna "person"
    if "person" in detections:
        # La quantitat de persones és la longitud de la llista de deteccions
        person_count = len(detections["person"])
        
    # Creem el missatge per enviar a la web
    entry = {
        "aforament": person_count,
        "timestamp": datetime.now(UTC).isoformat()
    }
    
    # Enviem la dada pel canal "update_aforament"
    ui.send_message("update_aforament", message=entry)

detection_stream.on_detect_all(send_detections_to_ui)

App.run()
