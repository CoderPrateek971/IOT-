#include <Arduino.h>
#include <DHT.h>
#include <ESP32Servo.h>
#include "ml_model.h"

// Member 4 owns DHT22 temperature sensing; Member 1 owns photoresistor irradiance sensing.
// Wokwi sensors model irradiance, temperature, and a software-defined soiling level.
// Member 4: DHT22 pin and sensor setup.
constexpr int PIN_DHT = 4;
// Member 1: photoresistor pin and irradiance sensing setup.
constexpr int PIN_LDR = 34;
constexpr int PIN_SOILING = 35;
constexpr int PIN_ANGLE_POT = 32;
constexpr int PIN_SERVO = 18;
constexpr int PIN_COOL = 19;
constexpr int PIN_CLEAN = 23;
constexpr int OPTIMAL_ANGLE = 20;
constexpr int COMMAND_PROTOCOL_VERSION = 2;
constexpr float PANEL_RATED_POWER_W = 150.0f;
constexpr unsigned long SAMPLE_MS = 2000;

DHT dht(PIN_DHT, DHT22);
Servo panelServo;

float irradiance = 0;
float temperature = 25;
float soiling = 0;
int angle = 25;
float actualPower = 0;
float expectedPower = 0;
int actionSequence = 0;
unsigned long telemetrySequence = 0;
bool cleanedByAction = false;
bool cooledByAction = false;
int lastPotSoiling = -1;
int anglePotAnchor = -1;
bool manualAngleOverride = false;
float coolingBaseline = NAN;
unsigned long lastSample = 0;

// Dataset labels are fault classes, not measured dust percentages. The potentiometer
// is explicitly a demo control mapped to those classes.
// Member B starts here: convert the soiling control to the model's fault class.
float faultClassForSoiling(float percent)
{
  if (percent < 12)
    return 0.0f;
  if (percent < 35)
    return 2.1f;
  if (percent < 55)
    return 2.2f;
  return 2.3f;
}

// Member C starts here: tilt/servo control and operating-angle adjustment.
float angleFactor(int degrees)
{
  const float difference = fabsf((float)degrees - OPTIMAL_ANGLE);
  return fmaxf(0.0f, cosf(difference * 0.01745329252f));
}

float temperatureFactor(float degreesC)
{
  // Use a simple panel temperature derate; the dataset's temperature correlation is not causal.
  return fmaxf(0.70f, 1.0f - 0.004f * fmaxf(0.0f, degreesC - 25.0f));
}

void sampleSensors()
{
  const int lightRaw = analogRead(PIN_LDR);
  irradiance = map(4095 - lightRaw, 0, 4095, 0, 1000);

  // Member 4: read and validate DHT22 temperature telemetry.
  const float sensorTemp = dht.readTemperature();
  if (!isnan(sensorTemp))
  {
    if (cooledByAction && !isnan(coolingBaseline) && fabsf(sensorTemp - coolingBaseline) >= 3.0f)
    {
      cooledByAction = false;
    }
    temperature = cooledByAction ? fminf(sensorTemp, 29.0f) : sensorTemp;
  }

  const int potRaw = analogRead(PIN_SOILING);
  const int potPercent = map(potRaw, 0, 4095, 0, 100);
  if (lastPotSoiling >= 0 && abs(potPercent - lastPotSoiling) >= 5)
  {
    cleanedByAction = false;
  }
  lastPotSoiling = potPercent;
  soiling = cleanedByAction ? 0.0f : (float)potPercent;

  const int anglePotRaw = analogRead(PIN_ANGLE_POT);
  if (anglePotAnchor < 0)
  {
    anglePotAnchor = anglePotRaw;
    angle = map(anglePotRaw, 0, 4095, 0, 180);
    panelServo.write(angle);
  }
  else if (manualAngleOverride)
  {
    if (abs(anglePotRaw - anglePotAnchor) >= 35)
    {
      manualAngleOverride = false;
      anglePotAnchor = anglePotRaw;
      angle = map(anglePotRaw, 0, 4095, 0, 180);
      panelServo.write(angle);
    }
  }
  else
  {
    angle = map(anglePotRaw, 0, 4095, 0, 180);
    anglePotAnchor = anglePotRaw;
    panelServo.write(angle);
  }

  const float fault = faultClassForSoiling(soiling);
  actualPower = predictPowerML(irradiance, 25.0f, fault) * temperatureFactor(temperature) * angleFactor(angle);
  expectedPower = predictPowerML(irradiance, 25.0f, 0.0f);
}

// Member D starts here: publish the shared telemetry contract to the bridge.
void publishTelemetry()
{
  ++telemetrySequence;
  Serial.printf("[IOT_DATA]{\"irradiance\":%.1f,\"temperature\":%.1f,\"soiling\":%.1f,\"angle\":%d,\"actualPower\":%.1f,\"expectedPower\":%.1f,\"actionSequence\":%d,\"telemetrySequence\":%lu,\"commandProtocol\":%d}\r\n",
                irradiance, temperature, soiling, angle, actualPower, expectedPower, actionSequence, telemetrySequence, COMMAND_PROTOCOL_VERSION);
}

void runAction(const String &command)
{
  const float before = actualPower;
  if (command == "clean")
  {
    digitalWrite(PIN_CLEAN, HIGH);
    delay(1200);
    digitalWrite(PIN_CLEAN, LOW);
    cleanedByAction = true;
  }
  else if (command == "cool")
  {
    digitalWrite(PIN_COOL, HIGH);
    delay(1200);
    digitalWrite(PIN_COOL, LOW);
    // Member 4: use the DHT22 reading as the cooling-action baseline.
    const float sensed = dht.readTemperature();
    if (!isnan(sensed))
      coolingBaseline = sensed;
    cooledByAction = true;
  }
  else if (command == "angle" || command.startsWith("angle:"))
  {
    int requestedAngle = OPTIMAL_ANGLE;
    if (command.startsWith("angle:"))
    {
      const String value = command.substring(6);
      if (value.length() == 0)
        return;
      for (size_t i = 0; i < value.length(); ++i)
      {
        if (!isDigit(value[i]))
          return;
      }
      requestedAngle = value.toInt();
      if (requestedAngle < 0 || requestedAngle > 180)
        return;
    }
    angle = requestedAngle;
    manualAngleOverride = true;
    anglePotAnchor = analogRead(PIN_ANGLE_POT);
    panelServo.write(angle);
    delay(700);
  }
  else
  {
    return;
  }

  sampleSensors();
  ++actionSequence;
  Serial.printf("[ACTION]{\"command\":\"%s\",\"beforePower\":%.1f,\"afterPower\":%.1f}\r\n",
                command.c_str(), before, actualPower);
  publishTelemetry();
}

void setup()
{
  Serial.begin(115200);
  analogReadResolution(12);
  pinMode(PIN_COOL, OUTPUT);
  pinMode(PIN_CLEAN, OUTPUT);
  pinMode(PIN_ANGLE_POT, INPUT);
  dht.begin();
  panelServo.attach(PIN_SERVO);
  sampleSensors();
  publishTelemetry();
}

void loop()
{
  if (Serial.available())
  {
    String command = Serial.readStringUntil('\n');
    command.trim();
    runAction(command);
  }

  if (millis() - lastSample >= SAMPLE_MS)
  {
    lastSample = millis();
    sampleSensors();
    publishTelemetry();
  }
}
