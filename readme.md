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

## First-time setup and start

### Prerequisites

- Install VS Code.
- Install the recommended project extensions: **PlatformIO IDE** (`platformio.platformio-ide`) and **Wokwi Simulator** (`wokwi.wokwi-vscode`). VS Code may show these recommendations when you open the project.
- Install Node.js and npm for the React dashboard.
- Open the project root folder, the folder containing `platformio.ini`, `diagram.json`, and `wokwi.toml`.

### Build and start the ESP32 simulation

1. Open the project root in VS Code and let PlatformIO initialize the ESP32 environment. On the first build, PlatformIO downloads the ESP32 platform and the libraries listed in `platformio.ini`.
2. Build the firmware from the project root:

   ```sh
   pio run -e esp32dev
   ```

   If `pio` is not available in your terminal, use **PlatformIO: Build** from the VS Code PlatformIO toolbar or Command Palette. The Wokwi configuration uses the generated `.pio/build/esp32dev/firmware.bin` and `.elf` files.
3. Open the Wokwi Simulator panel and start the simulation. If you change `diagram.json` or firmware, build again and restart the simulation so it loads the updated files.

### Install and start the dashboard

Open a second terminal at the project root and run:

```sh
cd dashboard
npm ci
npm run dev
```

`npm ci` installs the exact dependencies recorded in `dashboard/package-lock.json`; repeat it only when dependencies change or when setting up a fresh copy. Vite starts at `http://localhost:3000`. Keep the simulator and dashboard running together. The dashboard bridge connects to the Wokwi serial endpoint on local TCP port 4000. The header should change from “Waiting for first reading” to “Telemetry live” after fresh simulator telemetry arrives.

### Optional Firebase setup

Firebase is not required for local monitoring. To enable cloud storage, follow `dashboard/FIREBASE_SETUP.md`, copy `dashboard/.env.example` to `dashboard/.env.local`, replace the sample values with your Firebase project settings, and restart the dashboard server. Do not commit `.env.local` or real credentials.

### If the dashboard shows no live readings

- Confirm the Wokwi simulation is running the latest firmware and has completed a fresh build.
- Check the dashboard terminal for `[Wokwi Bridge] Connected to Wokwi Simulator UART on port 4000`.
- Keep Wokwi and the dashboard on the same computer because the bridge connects to `127.0.0.1:4000`.
- Firebase connection status is separate from Wokwi telemetry status; follow the Firebase setup guide if only Firebase reports an error.

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

## Four-member implementation work division

These are implementation assignments: each member should build and deliver their listed features. The firmware and dashboard have shared integration points, so agree on telemetry fields and command formats before editing those interfaces. The dashboard is composed from four member-owned feature modules under `dashboard/src/members/`; `dashboard/src/App.jsx` remains the shared coordinator. ML preparation and training/evaluation live in separate files under `ml/`. Keep one `diagram.json` for the single Wokwi circuit; JSON does not support comments, so component ownership is marked in firmware/dashboard source comments and documented here rather than adding invalid JSON comments.

### Member 1 — Irradiance sensing and live power monitoring

- Implement the photoresistor wiring/configuration and robust irradiance sensor reads, range handling, and telemetry fields in `diagram.json` and `src/main.cpp`.
- Implement the corresponding irradiance dashboard reading in `dashboard/src/App.jsx`.
- Implement expected power, actual power, performance ratio, and session energy calculations/display in the dashboard, including sensible handling of invalid or missing readings.
- Own the ML data preparation stage: inspect source CSV columns/units, validate timestamp matching and invalid-row handling, and prepare/document the chronological train/holdout input in `ml/prepare_and_validate.py`.
- Own the dashboard power/sensor modules in `dashboard/src/members/MemberAPowerDashboard.jsx` and `MemberASensorDashboard.jsx`.
- Define the irradiance and power telemetry fields used by the project; coordinate their schema with Member 3, who owns all Firebase implementation and writes.
- Deliver reproducible prepared model inputs and a working Wokwi-to-dashboard path where changing either environmental input updates displayed readings and power values.

### Member 2 — Dataset pipeline, model training, and soiling/fault input

- Own the model training stage: choose and implement the Ridge model/features, training process, class sampling, chronological holdout evaluation, and metric reporting in `ml/train_and_evaluate.py` (using Member 1's reviewed data-preparation work).
- Generate and document model coefficients and evaluation metadata in `ml/trained_model.json`; coordinate artifact export requirements with Members 3 and 4.
- Implement the soiling potentiometer reading and fault-class mapping in `src/main.cpp`, then connect its value to dashboard telemetry and degradation display in `dashboard/src/App.jsx`.
- Define the predicted power, fault class, and soiling-context fields; coordinate the schema and raw-telemetry identity with Member 3, who owns Firebase writes.
- Own the dashboard fault/diagnostics module in `dashboard/src/members/MemberBDiagnosticsDashboard.jsx`.
- Deliver repeatable model generation and a working soiling-input-to-fault/power path. Keep the dataset limitation (no direct dust measurement) explicit in code/docs.

### Member 3 — Tilt input, servo, and corrective-action controls, and Firebase persistence

- Implement tilt-potentiometer wiring/reading and servo movement in `diagram.json` and `src/main.cpp`.
- Implement dashboard angle input, command submission, and angle confirmation from fresh telemetry in `dashboard/src/App.jsx` and the bridge interface.
- Implement cleaning/cooling actuator outputs and action command handling in firmware, with dashboard action selection and post-action verification.
- Own edge deployment of the trained model: consume generated coefficients in `include/ml_model.h`, implement/maintain ESP32 inference and operating-condition adjustments in `src/main.cpp`, and compare predictions with the dashboard version on shared sample inputs.
- Implement persistence of corrective-action requests and verified outcomes using the Firebase action history path (`saveActionResult` and its call sites in `dashboard/src/App.jsx`), including timestamps, action name, predicted gain, measured/simulated gain, and verification error.
- Own dashboard tilt control and corrective-action UI in `dashboard/src/members/MemberCTiltDashboard.jsx` and `MemberCCorrectiveActions.jsx`.
- Deliver matching firmware inference on reference cases, working knob/dashboard angle control, and cleaning/cooling simulations, with validated limits and clear failure states.
- Own all Firebase implementation: configuration loading, anonymous authentication, per-user database paths, telemetry/prediction/action writes, subscriptions/readback, connection/error status, and security rules in `dashboard/src/firebase.js`, `dashboard/src/App.jsx`, and `dashboard/firebase-database.rules.json`. Integrate irradiance/power fields from Member 1, prediction/fault fields from Member 2, actuator results from Member 3, and temperature fields from Member 4.
- Maintain the Firebase project setup and local configuration instructions in `dashboard/FIREBASE_SETUP.md` and `dashboard/.env.example`; review the Firebase data schema and integration with the other three members.

### Member 4 — DHT22 temperature sensing, telemetry bridge, live history

- Implement DHT22 wiring/configuration and robust temperature reads, range handling, and temperature telemetry fields in `diagram.json` and `src/main.cpp`; provide the temperature field to Member 3 for Firebase persistence, and coordinate the shared telemetry format with Members 1 and 2.
- Implement the corresponding temperature dashboard reading in `dashboard/src/App.jsx`.
- Implement and maintain Wokwi serial connection/reconnection, telemetry parsing, live event delivery, REST endpoints, and dashboard command forwarding in `dashboard/vite.config.js`.
- Implement retained latest readings, the three-minute stale-data error, and session chart sampling/history behavior in the dashboard/bridge integration.
- Own dashboard ML inference integration: consume the generated model in `dashboard/src/mlModel.js`, ensure dashboard predictions and corrective-action comparisons use the shared model consistently, and surface model status/metrics with appropriate caveats in `dashboard/src/App.jsx`.
- Own the dashboard live-history module in `dashboard/src/members/MemberDHistoryDashboard.jsx`.
- Deliver a working bridge-to-dashboard stream with visible connection/error states; coordinate temperature data and Firebase integration with Member 3.

### Integration handoff

Each member implements their assigned component through to its dashboard and Firebase data result. The ML workflow is shared by stage: Member 1 prepares/validates training inputs, Member 2 trains and evaluates the model, Member 3 deploys inference to ESP32, and Member 4 integrates inference into the dashboard. Member 3 owns all Firebase implementation and persistence. Members 1, 2, and 4 provide the agreed irradiance/power, prediction/fault, and temperature fields, while Member 3 also persists corrective-action results and maintains configuration, authentication, subscriptions, and security rules. Integrate using agreed data schemas and command formats, then run a joint end-to-end check covering changed inputs, matching predictions/status, an action, fresh telemetry, chart updates, and persisted records.

## Key files

- `src/main.cpp` — ESP32 telemetry and actuator firmware
- `diagram.json` — Wokwi circuit and component wiring
- `dashboard/src/App.jsx` — dashboard UI, stream handling, controls, status, and chart
- `dashboard/src/members/` — four member-owned dashboard feature modules imported by `App.jsx`
- `dashboard/vite.config.js` — local Wokwi serial bridge and API endpoints
- `dashboard/src/firebase.js` — Firebase client and persistence functions
- `dashboard/src/mlModel.js` — dashboard model and power estimates
- `ml/prepare_and_validate.py` — ML input preparation and validation
- `ml/train_and_evaluate.py` — ML training, evaluation, and model exports
- `ml/train_kaggle_model.py` — backward-compatible training command wrapper
- `ml/README.md` — model training assumptions and instructions
- `dashboard/FIREBASE_SETUP.md` — Firebase setup steps

## File ownership and study guide

The tables below turn the implementation assignments into a file-by-file study guide. Files that appear under multiple members are shared integration points; coordinate changes to their data fields and interfaces.

| **Person / area** | **File(s) to study** | **Task and connection to the workflow** |
|---|---|---|
| Member 1 — Irradiance sensing and power monitoring | `src/main.cpp`, `diagram.json` | Implement photoresistor wiring, irradiance reads, range handling, and telemetry fields. Coordinate firmware and circuit changes with Members 2 and 3. |
| Member 1 | `dashboard/src/App.jsx`, `dashboard/src/members/MemberASensorDashboard.jsx`, `dashboard/src/members/MemberAPowerDashboard.jsx` | Display irradiance; calculate and display expected power, actual power, performance ratio, and session energy, including handling missing or invalid readings. |
| Member 1 | `ml/prepare_and_validate.py`, `ml/README.md` | Prepare and validate timestamp-matched training inputs; document source columns, units, invalid-row handling, and chronological holdout preparation. |
| Member 2 — Model training and fault input | `ml/train_and_evaluate.py`, `ml/train_model.py`, `ml/train_kaggle_model.py`, `ml/README.md` | Study model features, Ridge training, class sampling, chronological holdout evaluation, metric reporting, and the training entry points. |
| Member 2 | `ml/trained_model.json` | Review generated model coefficients and evaluation metadata; coordinate artifact export requirements with Members 3 and 4. |
| Member 2 | `src/main.cpp`, `dashboard/src/App.jsx` | Implement soiling-potentiometer readings and fault-class mapping in firmware, then connect soiling and degradation context to the dashboard. |
| Member 2 | `dashboard/src/members/MemberBDiagnosticsDashboard.jsx`, `dashboard/src/App.jsx` | Build the fault/diagnostics display and define prediction fields such as predicted power and fault class; coordinate persistence with Member 3. |
| Member 3 — Tilt, actuators, corrective actions, and Firebase | `diagram.json`, `src/main.cpp` | Implement tilt-potentiometer wiring and reads, servo movement, cleaning/cooling outputs, and action command handling. |
| Member 3 | `dashboard/src/App.jsx`, `dashboard/src/members/MemberCTiltDashboard.jsx`, `dashboard/src/members/MemberCCorrectiveActions.jsx` | Implement angle controls, command submission, corrective-action selection, angle confirmation from fresh telemetry, and post-action verification. |
| Member 3 | `include/ml_model.h`, `src/main.cpp` | Deploy the generated model coefficients to ESP32 inference, apply operating-condition adjustments, and compare firmware predictions with dashboard results. |
| Member 3 — Firebase owner | `dashboard/src/firebase.js`, `dashboard/firebase-database.rules.json`, `dashboard/FIREBASE_SETUP.md`, `dashboard/.env.example`, `dashboard/src/App.jsx` | Own Firebase configuration, anonymous authentication, per-user paths, persistence of irradiance/power, temperature, prediction/fault, and corrective-action data, subscriptions/readback, connection/error handling, and security rules. Coordinate field definitions with Members 1, 2, and 4. |
| Member 4 — Telemetry bridge and history | `dashboard/vite.config.js` | Maintain Wokwi serial connection/reconnection, telemetry parsing, live events, REST endpoints, and dashboard command forwarding. |
| Member 4 — DHT22 temperature sensing | `src/main.cpp`, `diagram.json`, `dashboard/src/App.jsx` | Own DHT22 wiring, robust temperature reads, range handling, temperature telemetry, and the dashboard temperature reading. Provide the temperature field to Member 3 for Firebase persistence; coordinate shared firmware, circuit, and dashboard changes with Members 1–3. |
| Member 4 | `dashboard/src/App.jsx`, `dashboard/src/members/MemberDHistoryDashboard.jsx` | Implement retained latest readings, stale-data status, and session chart sampling/history behavior. |
| Member 4 | `dashboard/src/mlModel.js`, `dashboard/src/App.jsx` | Integrate dashboard model inference and ensure predictions and corrective-action comparisons use the shared model consistently; surface model status and metrics. |
| Member 4 | `dashboard/src/App.jsx`, `dashboard/vite.config.js` | Provide temperature telemetry and coordinate the dashboard-to-Firebase data flow with Member 3, who owns Firebase configuration, reads, writes, and setup. |

### Common files

| **File(s)** | **Why everyone should study them** |
|---|---|
| `dashboard/src/App.jsx` | Shared dashboard coordinator for readings, controls, status, chart, model integration, and Firebase call sites. All four members have assigned work here. |
| `src/main.cpp` | Shared firmware for irradiance and temperature sensors, soiling and tilt inputs, model inference, telemetry, and actuators. Members 1–4 have assigned work here. |
| `diagram.json` | Single Wokwi circuit definition; Members 1, 3, and 4 change component wiring. |
| `dashboard/src/firebase.js` | Member 3 owns the Firebase client and persistence interface. Members 1, 2, and 4 coordinate their telemetry and prediction fields with Member 3. |
| `PROJECT_STATUS.md` | Project behavior, run instructions, member assignments, and integration handoff. |
| `ml/README.md` | Shared assumptions and instructions for data preparation and model training/export. |

Agree on telemetry fields and command formats before changing shared interfaces. Member 1 owns photoresistor/irradiance sensing and power monitoring; Member 4 owns DHT22 temperature sensing. The ML workflow is shared by stage: Member 1 prepares and validates inputs, Member 2 trains and evaluates, Member 3 deploys firmware inference, and Member 4 integrates dashboard inference. Member 3 owns all Firebase code and persistence, incorporating the telemetry and prediction fields supplied by the other members.
