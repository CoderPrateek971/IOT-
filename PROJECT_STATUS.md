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

## Four-member implementation work division

These are implementation assignments: each member should build and deliver their listed features. The firmware and dashboard have shared integration points, so agree on telemetry fields and command formats before editing those interfaces. The dashboard is composed from four member-owned feature modules under `dashboard/src/members/`; `dashboard/src/App.jsx` remains the shared coordinator. ML preparation and training/evaluation live in separate files under `ml/`. Keep one `diagram.json` for the single Wokwi circuit; JSON does not support comments, so component ownership is marked in firmware/dashboard source comments and documented here rather than adding invalid JSON comments.

### Member 1 — Irradiance/temperature sensing and live power monitoring

- Implement the photoresistor and DHT22 wiring/configuration in `diagram.json` and robust sensor reads, range handling, and telemetry fields in `src/main.cpp`.
- Implement the corresponding irradiance/temperature dashboard readings in `dashboard/src/App.jsx`.
- Implement expected power, actual power, performance ratio, and session energy calculations/display in the dashboard, including sensible handling of invalid or missing readings.
- Own the ML data preparation stage: inspect source CSV columns/units, validate timestamp matching and invalid-row handling, and prepare/document the chronological train/holdout input in `ml/prepare_and_validate.py`.
- Own the dashboard power/sensor modules in `dashboard/src/members/MemberAPowerDashboard.jsx` and `MemberASensorDashboard.jsx`.
- Implement and maintain the Firebase telemetry record fields for irradiance, temperature, and power readings through `saveTelemetry` in `dashboard/src/firebase.js`; coordinate the shared record shape with Members 2 and 4.
- Deliver reproducible prepared model inputs and a working Wokwi-to-dashboard path where changing either environmental input updates displayed readings and power values.

### Member 2 — Dataset pipeline, model training, and soiling/fault input

- Own the model training stage: choose and implement the Ridge model/features, training process, class sampling, chronological holdout evaluation, and metric reporting in `ml/train_and_evaluate.py` (using Member 1's reviewed data-preparation work).
- Generate and document model coefficients and evaluation metadata in `ml/trained_model.json`; coordinate artifact export requirements with Members 3 and 4.
- Implement the soiling potentiometer reading and fault-class mapping in `src/main.cpp`, then connect its value to dashboard telemetry and degradation display in `dashboard/src/App.jsx`.
- Add predicted power, fault class, and soiling-derived context to the Firebase prediction record schema; coordinate the write implementation with Member 4 and keep raw telemetry identifiable.
- Own the dashboard fault/diagnostics module in `dashboard/src/members/MemberBDiagnosticsDashboard.jsx`.
- Deliver repeatable model generation and a working soiling-input-to-fault/power path. Keep the dataset limitation (no direct dust measurement) explicit in code/docs.

### Member 3 — Tilt input, servo, and corrective-action controls

- Implement tilt-potentiometer wiring/reading and servo movement in `diagram.json` and `src/main.cpp`.
- Implement dashboard angle input, command submission, and angle confirmation from fresh telemetry in `dashboard/src/App.jsx` and the bridge interface.
- Implement cleaning/cooling actuator outputs and action command handling in firmware, with dashboard action selection and post-action verification.
- Own edge deployment of the trained model: consume generated coefficients in `include/ml_model.h`, implement/maintain ESP32 inference and operating-condition adjustments in `src/main.cpp`, and compare predictions with the dashboard version on shared sample inputs.
- Implement persistence of corrective-action requests and verified outcomes using the Firebase action history path (`saveActionResult` and its call sites in `dashboard/src/App.jsx`), including timestamps, action name, predicted gain, measured/simulated gain, and verification error.
- Own dashboard tilt control and corrective-action UI in `dashboard/src/members/MemberCTiltDashboard.jsx` and `MemberCCorrectiveActions.jsx`.
- Deliver matching firmware inference on reference cases, working knob/dashboard angle control, and cleaning/cooling simulations, with validated limits and clear failure states.

### Member 4 — Telemetry bridge, live history, and Firebase persistence

- Implement and maintain Wokwi serial connection/reconnection, telemetry parsing, live event delivery, REST endpoints, and dashboard command forwarding in `dashboard/vite.config.js`.
- Implement retained latest readings, the three-minute stale-data error, and session chart sampling/history behavior in the dashboard/bridge integration.
- Own dashboard ML inference integration: consume the generated model in `dashboard/src/mlModel.js`, ensure dashboard predictions and corrective-action comparisons use the shared model consistently, and surface model status/metrics with appropriate caveats in `dashboard/src/App.jsx`.
- Implement the shared Firebase foundation: configuration loading, anonymous authentication, per-user database paths, subscriptions/readback, connection/error status, and security rules in `dashboard/src/firebase.js`, `dashboard/src/App.jsx`, and `dashboard/firebase-database.rules.json`.
- Maintain the Firebase project setup and local configuration instructions in `dashboard/FIREBASE_SETUP.md` and `dashboard/.env.example`; review the Firebase data schema and integration with the other three members.
- Own the dashboard live-history module in `dashboard/src/members/MemberDHistoryDashboard.jsx`.
- Deliver a working bridge-to-dashboard stream and shared Firebase setup, including visible connection/error states and documented local configuration.

### Integration handoff

Each member implements their assigned component through to its dashboard and Firebase data result. The ML workflow is shared by stage: Member 1 prepares/validates training inputs, Member 2 trains and evaluates the model, Member 3 deploys inference to ESP32, and Member 4 integrates inference into the dashboard. Firebase work is shared by ownership: Member 1 handles sensor/power telemetry records, Member 2 defines prediction/fault fields, Member 3 handles corrective-action records, and Member 4 handles configuration, authentication, subscriptions, and security rules. Integrate using agreed data schemas and command formats, then run a joint end-to-end check covering changed inputs, matching predictions/status, an action, fresh telemetry, chart updates, and persisted records.

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
