// AUTO-GENERATED FROM REAL KAGGLE DATASET:
// "pythonafroz/pv-plant-in-normal-and-shading-faults-conditions"
#ifndef ML_MODEL_H
#define ML_MODEL_H

#include <Arduino.h>

const float ML_INTERCEPT = -10.156959586391409f;
const float ML_COEFFS[] = {
  0.0f, 0.17891123212475588f, 0.5287335795812816f, 0.2932681731528158f, -0.24447862782568328f, -6.423537716139764e-05f, 0.0011511432527703779f, 6.367400585630658e-05f, -0.0005182401830912257f, -0.013629054118255853f, -0.0033846794722445193f, 0.015450407522624509f, -0.004107345903565945f, 0.003646654885764154f, -0.024844219775792913f
};

inline float predictPowerML(float sun, float temp, float angle, float soil) {
  float x[4] = {sun, temp, angle, soil};
  float terms[15];
  terms[0] = 1.0f;
  
  int idx = 1;
  for (int i = 0; i < 4; i++) {
    terms[idx++] = x[i];
  }
  for (int i = 0; i < 4; i++) {
    for (int j = i; j < 4; j++) {
      terms[idx++] = x[i] * x[j];
    }
  }

  float power = ML_INTERCEPT;
  for (int i = 1; i < 15; i++) {
    power += ML_COEFFS[i] * terms[i];
  }

  return (power < 0.0f) ? 0.0f : power;
}

#endif // ML_MODEL_H
