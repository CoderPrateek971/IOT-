# Solar Panel Monitoring and Predictive Corrective Control — Project Status

## Overview

This project demonstrates solar-panel telemetry, power estimation, anomaly status, and corrective actions using an ESP32 simulated in Wokwi and a React dashboard. Firebase Realtime Database is optional storage for dashboard telemetry and completed actions.

The implementation is a simulation and educational prototype. The Kaggle dataset contains inverter and weather measurements with fault labels; it does not directly measure panel tilt or dust percentage. Tilt and soiling effects in this project are modeled assumptions, not experimentally validated recovery results.

## Implemented

- **ESP32/Wokwi telemetry:** Reads irradiance, DHT22 temperature, a soiling-control potentiometer, and a tilt potentiometer. Sends JSON telemetry over the Wokwi serial bridge, including actual and reference power, action sequence, and telemetry sequence.
- **Actuator controls:** Servo angle can be set from the dashboard or tilt potentiometer. Cleaning and cooling actions drive the corresponding LEDs in the simulation. Manual servo commands are checked against subsequent telemetry.
- **Dashboard:** Shows retained latest readings, live/stale state, power and expected output, performance status, a 30-second power-history chart, an angle control, and a corrective-action comparison.
- **Predictive model:** Shared exported Ridge model is used by firmware and dashboard. Firmware compares output against clean-panel, 25°C reference power at current irradiance. Operating power applies explicit temperature and angle derates. Underperformance uses the larger of an 8 W or 10% reference deficit threshold.
- **Firebase option:** Browser SDK uses anonymous sign-in. Telemetry is stored at most once per minute and latest telemetry is overwritten; action results are stored separately. Setup and database rules are documented in `dashboard/FIREBASE_SETUP.md`.
- **Model training:** `ml/train_kaggle_model.py` can train/export the shared model from the specified Kaggle CSV files. Dataset files themselves are not included.

## Controls and wiring

| Control | Wokwi part | ESP32 pin | Meaning |
|---|---|---:|---|
| Soiling | `pot_soiling` | GPIO 35 | Simulated soiling percentage mapped to dataset fault classes |
| Tilt | `pot_angle` | GPIO 32 | Servo angle, mapped from ADC range to 0–180° |
| Servo | `servo_angle` | GPIO 18 | Panel tilt actuator |
| Irradiance | Photoresistor | GPIO 34 | Simulated irradiance |
| Temperature | DHT22 | GPIO 4 | Panel temperature input |

To use the added tilt potentiometer, stop and restart the Wokwi simulation so it reloads `diagram.json` and the latest firmware. It is positioned next to the soiling potentiometer. Turning the tilt knob takes control back from a dashboard angle override.

## Start the project

1. Open the project in VS Code with PlatformIO and start the Wokwi simulation. If the circuit or firmware was changed, stop and start the simulation to load it again.
2. In a terminal, run the dashboard:

   ```sh
   cd dashboard
   npm install
   npm run dev
   ```

3. Open the local Vite address (normally `http://localhost:3000`). The dashboard bridge connects to Wokwi on local TCP port 4000.
4. To enable Firebase, follow `dashboard/FIREBASE_SETUP.md`, create `dashboard/.env.local` from `.env.example`, and restart Vite.

## Current behavior and limits

- The dashboard keeps the last reading on screen and marks telemetry stale after three minutes without a fresh reading. The project does not synthesize new measurements while Wokwi is stopped.
- The chart samples the latest telemetry-derived power every 30 seconds while telemetry is fresh. Its history is held in the Vite process memory and starts with the first valid reading; restarting the dashboard server starts a new chart session. Firebase telemetry history is persisted separately, but the chart does not currently restore that history from Firebase.
- Corrective-action gains are model estimates. Cleaning changes simulated soiling, cooling applies a simplified simulated temperature response, and tilt uses a cosine estimate. These are not measured physical energy savings.
- Firebase anonymous identities are browser-specific. The provided rules isolate data by user UID; cross-browser shared history and a production authentication/admin workflow are not configured.
- Wokwi is a simulator. Real hardware deployment still needs physical sensor calibration, a validated power measurement path, safe actuator/power design, and field validation of model predictions and action effects.

## Remaining work for a production or research-grade system

1. Validate model performance on the intended plant using a documented time-based evaluation and real operational measurements.
2. Calibrate the power reference, temperature response, soiling mapping, and tilt response against the actual panel and location.
3. Add durable chart-session/history recovery if graphs must survive dashboard server restarts; define retention and multi-device access requirements.
4. Add device identity/authentication and a trusted server-side data path before deploying beyond a local demo.
5. Test hardware behavior, command timeouts, reconnect behavior, and sensor failure handling on the target ESP32 and actuators.

## Suggested work division for four members

Each member owns an IoT component and the way its data or control appears in the dashboard. One member also owns Firebase as an additional responsibility. Since firmware and dashboard code are connected, members should coordinate changes to shared files while keeping the component ownership below clear.

### Member 1 — Irradiance and temperature sensing

- Own the photoresistor and DHT22 inputs in `diagram.json` and their reading/calibration logic in `src/main.cpp`.
- Connect irradiance and temperature readings to the dashboard telemetry cards and power calculation.
- Explain sensor units/ranges and how the dashboard keeps the last received values when telemetry pauses.
- Demonstrate changing both Wokwi sensor values and confirming the dashboard updates.

### Member 2 — Soiling, fault mapping, and ML prediction

- Own the soiling potentiometer and its effect on simulated panel condition in `diagram.json` and `src/main.cpp`.
- Connect the soiling reading and mapped fault class to dashboard status, estimated power, and cleaning recommendation.
- Own the Kaggle training workflow and model files: `ml/`, `include/ml_model.h`, and `dashboard/src/mlModel.js`.
- Explain dataset preparation, fault labels, model features/metrics, and the limitation that the dataset does not directly measure dust percentage.
- Demonstrate how changing the soiling control changes the estimated output and fault status.

### Member 3 — Tilt sensing and servo control

- Own the tilt potentiometer and servo hardware/control path in `diagram.json` and `src/main.cpp`.
- Connect the reported angle to the dashboard tilt reading and manual angle control in `dashboard/src/App.jsx`.
- Explain how the dashboard sends angle commands and confirms them through later telemetry, and how angle affects modeled power.
- Demonstrate both physical knob control and dashboard angle control; document the modeled cosine response and its limitations.

### Member 4 — Telemetry dashboard, integration, and Firebase

- Own the ESP32 serial telemetry transport and local Wokwi bridge in `dashboard/vite.config.js`, plus its live dashboard presentation in `dashboard/src/App.jsx`.
- Explain telemetry JSON, real-time updates, stale-device error after three minutes, power-history chart, and action confirmation flow.
- As the additional responsibility, own Firebase connection and storage in `dashboard/src/firebase.js`, `dashboard/FIREBASE_SETUP.md`, and `dashboard/firebase-database.rules.json`.
- Demonstrate that telemetry and completed action results are saved, and explain Firebase configuration and access rules.
- Coordinate the shared end-to-end demo and report simulation/model estimates as estimates rather than measured field results.

### Shared handoff

Before the demo, all four members should run one shared scenario: start Wokwi and the dashboard, vary the sensor and control assigned to each member, confirm the corresponding dashboard updates, apply a corrective action, and check the telemetry, chart, and Firebase record. Record each person's actual contribution and observed result.

## Key files

- `src/main.cpp` — ESP32 telemetry and actuator firmware
- `diagram.json` — Wokwi circuit and component wiring
- `dashboard/src/App.jsx` — dashboard UI, stream handling, controls, status, and chart
- `dashboard/vite.config.js` — local Wokwi serial bridge and API endpoints
- `dashboard/src/firebase.js` — Firebase client and persistence functions
- `dashboard/src/mlModel.js` — dashboard model and power estimates
- `ml/train_kaggle_model.py` — Kaggle-data training/export script
- `ml/README.md` — model training assumptions and instructions
- `dashboard/FIREBASE_SETUP.md` — Firebase setup steps
