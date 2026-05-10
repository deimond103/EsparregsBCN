# Street Listener

Real-time crowd density and acoustic pollution monitoring dashboard for public spaces.

Street Listener is a lightweight monitoring dashboard built for smart public-space management. It combines live occupancy tracking, acoustic environment analysis, event logging, and historical statistics into a single interface.

Designed as a proof-of-concept for libraries, shared workspaces, and public venues, the system provides operators with a real-time overview of crowd activity and noise conditions.

---

## Features

* Live crowd density monitoring
* Real-time sound classification
* Pollution and threshold alerts
* Historical occupancy trends
* Socket.IO live updates
* REST API integration
* Chart.js visualizations
* Windows XP Luna-inspired interface
* Dark mode support

---

## Tech Stack

| Layer              | Technology                          |
| ------------------ | ----------------------------------- |
| Frontend           | HTML, CSS, Vanilla JavaScript       |
| Realtime Transport | Socket.IO                           |
| Charts             | Chart.js                            |
| Backend            | Node.js (expected external service) |
| Styling            | Custom CSS                          |

---

## Project Structure

```text
street-listener/
├── python/
    └── main.py
├── README.md
├── app.yaml
└── assets/
    ├── app.js
    ├── index.html
    ├──style.css
    └──libs/
       └── socket.io.min.js
```

> The backend server is not included in this repository.

The frontend expects:

* A Socket.IO server
* A video stream running on port `4912`
* REST API endpoints for stats and history

---

# Architecture

```text
Camera + Microphone
        │
        ▼
Node.js Backend
        │
 ┌──────┴────────┐
 ▼               ▼
Socket.IO     REST API
 ▼               ▼
Live UI       Historical Data
```

---

# Real-Time Events

The frontend listens for Socket.IO events from the backend.

| Event              | Payload                    | Description                         |
| ------------------ | -------------------------- | ----------------------------------- |
| `update_aforament` | `{ aforament, timestamp }` | Updates current crowd count         |
| `update_sound`     | `{ mode, timestamp }`      | Updates active sound classification |
| `alert`            | `-`                        | Triggers alert UI refresh           |

---

# Sound Classification

| Mode Key       | Label       | Meaning                       |
| -------------- | ----------- | ----------------------------- |
| `silence`      | Silence     | No significant sound detected |
| `naturalcrowd` | Ambient     | Normal environmental noise    |
| `crowd`        | Crowd       | Elevated crowd noise          |
| `squeak`       | Sharp Sound | Sudden or sharp sound event   |

---

# Density Levels

| People Count | Density |
| ------------ | ------- |
| `0`          | Empty   |
| `1`          | Low     |
| `2`          | Medium  |
| `3+`         | High    |

---

# Recommendation Engine

Street Listener computes a contamination score from crowd density and sound intensity.

```text
totalScore = min(crowdScore + soundScore, 5)
```

### Crowd Score

| Condition | Score |
| --------- | ----- |
| Empty     | 0     |
| 1 person  | 1     |
| 2 people  | 2     |
| 3+ people | 3     |

### Sound Score

| Condition   | Score |
| ----------- | ----- |
| Silence     | 0     |
| Ambient     | 1     |
| Crowd Noise | 2     |
| Sharp Sound | 3     |

### Severity Levels

| Score | Level      |
| ----- | ---------- |
| 0     | Optimal    |
| 1     | Acceptable |
| 2     | Attention  |
| 3     | Alert      |
| 4     | Critical   |
| 5     | Extreme    |

---

# REST API

The frontend polls backend endpoints every 30 seconds.

## `GET /api/events`

Returns recent contamination or alert events.

### Example

```json
{
  "events": [
    {
      "severity": "high",
      "crowd_count": 7,
      "triggered_at": "2024-03-15T14:32:00Z"
    }
  ]
}
```

### Severity Values

* `low`
* `medium`
* `high`
* `critical`

---

## `GET /api/stats`

Returns aggregate statistics.

### Example

```json
{
  "total": 1482,
  "max_count": 12
}
```

---

## `GET /api/history/:range`

Returns historical occupancy data.

### Parameters

| Parameter | Description    |
| --------- | -------------- |
| `hora`    | Hourly history |
| `setmana` | Weekly history |

### Example

```json
{
  "data": [
    { "timestamp": "14:00", "count": 3 },
    { "timestamp": "15:00", "count": 7 }
  ]
}
```

---

# Dashboard Panels

## Alerts

Displays the latest pollution events with severity indicators.

## Sound Analysis

Shows the currently active sound classification in real time.

## Camera Feed

Embeds the live camera stream from the local backend.

## Occupancy Chart

Displays live and historical occupancy trends using Chart.js.

## Statistics

Shows aggregate metrics including:

* Total records
* Maximum occupancy detected
* Last alert timestamp
* Current density level

## Recommendations

Displays contamination score, recommendations, and mitigation actions.

---

# Dark Mode

Dark mode can be toggled directly from the dashboard UI.

The selected preference is persisted using `localStorage`.

---

# Setup

## Prerequisites

Before running the frontend, ensure the following services are available:

* Node.js backend server
* Socket.IO endpoint
* REST API endpoints
* Camera/video stream on port `4912`
* Modern browser (Chrome, Firefox, Edge)

---

## Running the Frontend

The dashboard is a static frontend application.

Serve it from the same origin as the backend to avoid CORS issues.

### Example Express Setup

```js
app.use(express.static('public'));
```

Then open:

```text
http://localhost:<port>
```

---

## Socket.IO Compatibility

The project includes a bundled Socket.IO client inside `libs/socket.io.min.js`.

Ensure the frontend and backend Socket.IO versions are compatible.

---

# UI Design

Street Listener uses a custom interface inspired by the classic Windows XP Luna theme.

Features include:

* XP-style panels and title bars
* Custom gradients and borders
* Retro UI components
* CSS-based dark mode
* Bliss wallpaper background

All styling is implemented in vanilla CSS.

---

# License

Licensed under the MPL-2.0 License.

```text
SPDX-License-Identifier: MPL-2.0
```

---

# Notes

This repository currently contains only the frontend dashboard.

The backend service responsible for:

* Camera processing
* Sound analysis
* Crowd detection
* Event generation
* REST API responses
* Socket.IO broadcasting

must be implemented and hosted separately.
