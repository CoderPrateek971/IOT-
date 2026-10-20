#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>
#include <ESP32Servo.h>

// Wokwi Virtual WiFi Credentials
const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASS = "";

// Firebase Realtime Database URL (Update with your project if needed)
const char* FIREBASE_URL = "https://solarguard-iot-default-rtdb.firebaseio.com/solar_panel.json";


// ==========================================
// PIN CONFIGURATION (Wokwi & ESP32)
// ==========================================
#define PIN_DHT        4    // DHT22 Temperature Sensor
#define PIN_LDR        34   // LDR Sunlight Sensor (ADC1)
#define PIN_SOILING    35   // Potentiometer for Dust / Soiling (ADC1)
#define PIN_SERVO      18   // Servo for Panel Angle
#define PIN_COOL_FAN   19   // Blue LED: Cooling Fan
#define PIN_CLEAN_ACT  23   // Yellow LED: Cleaning Wiper

#define DHTTYPE DHT22
DHT dht(PIN_DHT, DHTTYPE);
Servo panelServo;

// ==========================================
// SYSTEM PARAMETERS & VARIABLES
// ==========================================
float irradiance = 850.0;    // Sunlight (W/m²)
float temperature = 42.0;    // Panel Temp (°C)
float soilingLevel = 35.0;   // Dust level (0% = Clean, 100% = Dirty)
int   currentAngle = 35;     // Current Panel Angle (degrees)
const int OPTIMAL_ANGLE = 20;// Optimal angle for maximum sunlight

float actualPower = 0.0;     // Measured power (Watts)
float expectedPower = 0.0;   // Ideal power without degradation (Watts)

unsigned long lastMonitorTime = 0;
const unsigned long MONITOR_INTERVAL = 2000; // Check every 2 seconds

bool actionInProgress = false;
bool degradationHandled = false;

// ==========================================
// POWER MODELS (Easy physics-based formulas)
// ==========================================

// Ideal expected power under current sunlight
float calculateExpectedPower(float sun, int angle) {
  float sunRatio = sun / 1000.0;
  float angleDiff = abs(angle - OPTIMAL_ANGLE);
  float angleLoss = cos(radians(angleDiff));
  if (angleLoss < 0) angleLoss = 0;

  float power = 150.0 * sunRatio * angleLoss;
  return max(power, 0.0f);
}

// Actual power with losses from high temp, dust, and tilt
float calculateActualPower(float sun, float temp, float soil, int angle) {
  float ideal = calculateExpectedPower(sun, angle);

  // Temperature loss (~0.4% per °C above 25°C)
  float tempLoss = 0.0;
  if (temp > 25.0) {
    tempLoss = (temp - 25.0) * 0.4;
  }

  // Dust loss (~0.7% per % soiling)
  float soilLoss = soil * 0.7;

  float totalLossPercent = (tempLoss + soilLoss) / 100.0;
  if (totalLossPercent > 0.85) totalLossPercent = 0.85; // max 85% loss

  return ideal * (1.0 - totalLossPercent);
}

// ==========================================
// WHAT-IF ANALYSIS & DECISION (NOVELTY)
// ==========================================
void performWhatIfAnalysis() {
  actionInProgress = true;

  Serial.println(F("\r\n=================================================="));
  Serial.println(F("         CORRECTIVE ACTION ANALYSIS"));
  Serial.println(F("=================================================="));
  Serial.print(F("Current Power    : ")); Serial.print(actualPower, 1); Serial.println(F(" W"));
  Serial.print(F("Expected Power   : ")); Serial.print(expectedPower, 1); Serial.println(F(" W"));
  Serial.print(F("Performance Loss : -")); Serial.print(expectedPower - actualPower, 1); Serial.println(F(" W"));
  Serial.println(F("--------------------------------------------------"));
  Serial.println(F("Simulating 3 Possible Actions Virtually First:"));
  Serial.println();

  // 1. What-If Angle Adjustment (Servo energy = 1 Wh)
  float p_angle = calculateActualPower(irradiance, temperature, soilingLevel, OPTIMAL_ANGLE);
  float gain_angle = p_angle - actualPower;
  float cost_angle = 1.0;
  float net_angle = gain_angle - cost_angle;

  // 2. What-If Cooling to 28°C (Fan energy = 5 Wh)
  float p_cool = calculateActualPower(irradiance, 28.0, soilingLevel, currentAngle);
  float gain_cool = p_cool - actualPower;
  float cost_cool = 5.0;
  float net_cool = gain_cool - cost_cool;

  // 3. What-If Cleaning dust to 0% (Wiper energy = 7 Wh)
  float p_clean = calculateActualPower(irradiance, temperature, 0.0, currentAngle);
  float gain_clean = p_clean - actualPower;
  float cost_clean = 7.0;
  float net_clean = gain_clean - cost_clean;

  // Print Clean Comparison Table
  Serial.println(F("Action           Predicted Gain   Energy Cost   Net Benefit"));
  Serial.println(F("-----------------------------------------------------------"));
  
  Serial.print(F("1. Change Angle  +")); Serial.print(gain_angle, 1); 
  Serial.print(F(" W           ")); Serial.print(cost_angle, 1);
  Serial.print(F(" Wh        +")); Serial.print(net_angle, 1); Serial.println(F(" Wh"));

  Serial.print(F("2. Cool Panel    +")); Serial.print(gain_cool, 1); 
  Serial.print(F(" W           ")); Serial.print(cost_cool, 1);
  Serial.print(F(" Wh        +")); Serial.print(net_cool, 1); Serial.println(F(" Wh"));

  Serial.print(F("3. Clean Panel   +")); Serial.print(gain_clean, 1); 
  Serial.print(F(" W           ")); Serial.print(cost_clean, 1);
  Serial.print(F(" Wh        +")); Serial.print(net_clean, 1); Serial.println(F(" Wh"));
  Serial.println(F("-----------------------------------------------------------"));

  // Select Best Action with Highest Net Energy Benefit
  String bestAction = "NONE";
  float maxNet = 0.0;
  float predictedRecovery = 0.0;

  if (net_angle > maxNet) {
    maxNet = net_angle;
    bestAction = "ANGLE ADJUSTMENT";
    predictedRecovery = gain_angle;
  }
  if (net_cool > maxNet) {
    maxNet = net_cool;
    bestAction = "COOLING";
    predictedRecovery = gain_cool;
  }
  if (net_clean > maxNet) {
    maxNet = net_clean;
    bestAction = "CLEANING";
    predictedRecovery = gain_clean;
  }

  Serial.print(F(">>> BEST ACTION SELECTED: "));
  Serial.println(bestAction);
  Serial.print(F(">>> HIGHEST NET BENEFIT : +"));
  Serial.print(maxNet, 1);
  Serial.println(F(" Wh"));
  Serial.println(F("=================================================="));

  // --- Execute the Selected Action ---
  float actualRecovery = 0.0;

  if (bestAction == "CLEANING") {
    Serial.println(F("\r\n[ACTUATOR] >> Activating Cleaning Wiper (Yellow LED ON)..."));
    digitalWrite(PIN_CLEAN_ACT, HIGH);
    delay(2500);
    digitalWrite(PIN_CLEAN_ACT, LOW);
    Serial.println(F("[ACTUATOR] >> Cleaning Completed (Yellow LED OFF)."));

    // Simulating post-clean measurement (soiling reduced to ~5%)
    float newPower = calculateActualPower(irradiance, temperature, 5.0, currentAngle);
    actualRecovery = newPower - actualPower;

  } else if (bestAction == "COOLING") {
    Serial.println(F("\r\n[ACTUATOR] >> Activating Cooling Fan (Blue LED ON)..."));
    digitalWrite(PIN_COOL_FAN, HIGH);
    delay(2500);
    digitalWrite(PIN_COOL_FAN, LOW);
    Serial.println(F("[ACTUATOR] >> Cooling Completed (Blue LED OFF)."));

    float newPower = calculateActualPower(irradiance, 29.0, soilingLevel, currentAngle);
    actualRecovery = newPower - actualPower;

  } else if (bestAction == "ANGLE ADJUSTMENT") {
    Serial.print(F("\r\n[ACTUATOR] >> Moving Servo from "));
    Serial.print(currentAngle);
    Serial.print(F("° to optimal "));
    Serial.print(OPTIMAL_ANGLE);
    Serial.println(F("°..."));
    panelServo.write(OPTIMAL_ANGLE);
    delay(1000);
    currentAngle = OPTIMAL_ANGLE;
    Serial.println(F("[ACTUATOR] >> Angle Position Adjusted."));

    float newPower = calculateActualPower(irradiance, temperature, soilingLevel, OPTIMAL_ANGLE);
    actualRecovery = newPower - actualPower;
  }

  // --- Closed-Loop Verification ---
  float predictionError = abs(predictedRecovery - actualRecovery);
  Serial.println(F("\r\n--------------------------------------------------"));
  Serial.println(F("          ACTION COMPLETED & VERIFIED"));
  Serial.println(F("--------------------------------------------------"));
  Serial.print(F("Predicted Recovery : +")); Serial.print(predictedRecovery, 1); Serial.println(F(" W"));
  Serial.print(F("Actual Recovery    : +")); Serial.print(actualRecovery, 1);    Serial.println(F(" W"));
  Serial.print(F("Prediction Error   :   ")); Serial.print(predictionError, 1);   Serial.println(F(" W"));
  Serial.println(F("--------------------------------------------------\r\n"));

  degradationHandled = true;
  actionInProgress = false;
}

// ==========================================
// READ ALL SENSORS
// ==========================================
void readSensors() {
  // LDR Light Sensor (0 - 4095 ADC)
  int ldrRaw = analogRead(PIN_LDR);
  irradiance = map(4095 - ldrRaw, 0, 4095, 200, 1000);

  // DHT22 Temperature Sensor
  float t = dht.readTemperature();
  if (!isnan(t)) {
    temperature = t;
  }

  // Potentiometer for Soiling (0% to 100%)
  int potRaw = analogRead(PIN_SOILING);
  float newSoiling = map(potRaw, 0, 4095, 0, 100);

  // If user changed the potentiometer dust knob significantly, reset handled flag
  if (abs(newSoiling - soilingLevel) > 8.0) {
    degradationHandled = false;
  }
  soilingLevel = newSoiling;

  // Compute power values
  expectedPower = calculateExpectedPower(irradiance, currentAngle);
  actualPower = calculateActualPower(irradiance, temperature, soilingLevel, currentAngle);
}

// ==========================================
// DISPLAY STATUS ON SERIAL MONITOR
// ==========================================
void printLiveStatus() {
  float powerLoss = expectedPower - actualPower;
  bool isUnderperforming = (powerLoss > 15.0);

  Serial.println(F("\r\n+------------------- SOLAR PANEL STATUS -------------------+"));
  Serial.print(F("| Sunlight (LDR)   : ")); Serial.print(irradiance, 0);   Serial.println(F(" W/m²"));
  Serial.print(F("| Temperature      : ")); Serial.print(temperature, 1);  Serial.println(F(" °C"));
  Serial.print(F("| Soiling / Dust   : ")); Serial.print(soilingLevel, 0); Serial.println(F(" %"));
  Serial.print(F("| Panel Tilt Angle : ")); Serial.print(currentAngle);    Serial.print(F("°  (Optimal: ")); Serial.print(OPTIMAL_ANGLE); Serial.println(F("°)"));
  Serial.print(F("| Expected Power   : ")); Serial.print(expectedPower, 1); Serial.println(F(" W"));
  Serial.print(F("| Actual Power     : ")); Serial.print(actualPower, 1);   Serial.println(F(" W"));
  Serial.print(F("| Power Difference : -")); Serial.print(powerLoss, 1);    Serial.println(F(" W"));
  
  if (isUnderperforming) {
    Serial.println(F("| State            : [!] UNDERPERFORMING"));
    Serial.println(F("| Status           : Deficit detected! Click 'Solve This' on Dashboard or type 'run'"));
    Serial.println(F("+----------------------------------------------------------+"));
  } else {
    degradationHandled = false;
    Serial.println(F("| State            : [OK] NORMAL (Operating efficiently)"));
    Serial.println(F("+----------------------------------------------------------+"));
  }
}

// ==========================================
// SYNC TELEMETRY TO LOCAL DASHBOARD & SERIAL
// ==========================================
void syncWithDashboard() {
  // Always output clean machine-readable telemetry JSON to Serial for local monitoring
  // Streamed over RFC2217 TCP port 4000 to the React Dashboard
  Serial.printf("[IOT_DATA]{\"irradiance\":%.0f,\"temperature\":%.1f,\"soiling\":%.0f,\"angle\":%d,\"actualPower\":%.1f,\"expectedPower\":%.1f}\r\n",
                irradiance, temperature, soilingLevel, currentAngle, actualPower, expectedPower);
}


// ==========================================
// SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(500);

  dht.begin();

  pinMode(PIN_COOL_FAN, OUTPUT);
  pinMode(PIN_CLEAN_ACT, OUTPUT);
  digitalWrite(PIN_COOL_FAN, LOW);
  digitalWrite(PIN_CLEAN_ACT, LOW);

  panelServo.attach(PIN_SERVO);
  panelServo.write(currentAngle);

  Serial.println(F("\r\n========================================================"));
  Serial.println(F("   IoT Solar Panel Predictive Corrective Recovery        "));
  Serial.println(F("========================================================"));
  Serial.println(F("System Ready!"));
  Serial.println(F("Listening for Dashboard & Serial commands:"));
  Serial.println(F("  'run'   -> Force run What-If Analysis"));
  Serial.println(F("  'clean' -> Test Cleaning Wiper LED"));
  Serial.println(F("  'cool'  -> Test Cooling Fan LED"));
  Serial.println(F("========================================================\r\n"));

  // Initial sensor read and instant telemetry broadcast
  readSensors();
  printLiveStatus();
  syncWithDashboard();
}

// ==========================================
// MAIN LOOP
// ==========================================
void loop() {
  // Check user Serial input
  if (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();

    if (cmd.equalsIgnoreCase("run")) {
      degradationHandled = false;
      performWhatIfAnalysis();
    } else if (cmd.equalsIgnoreCase("clean")) {
      digitalWrite(PIN_CLEAN_ACT, HIGH);
      delay(2000);
      digitalWrite(PIN_CLEAN_ACT, LOW);
      Serial.println(F("Manual Wiper Test Completed.\r\n"));
    } else if (cmd.equalsIgnoreCase("cool")) {
      digitalWrite(PIN_COOL_FAN, HIGH);
      delay(2000);
      digitalWrite(PIN_COOL_FAN, LOW);
      Serial.println(F("Manual Cooling Test Completed.\r\n"));
    }
  }

  // Periodic sensor sampling
  unsigned long now = millis();
  if (!actionInProgress && (now - lastMonitorTime >= MONITOR_INTERVAL)) {
    lastMonitorTime = now;
    readSensors();
    printLiveStatus();
    syncWithDashboard();
  }
}