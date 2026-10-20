// AUTO-GENERATED FROM REAL KAGGLE DATASET:
// "pythonafroz/pv-plant-in-normal-and-shading-faults-conditions"
// Supervised Polynomial Regression Model
// Accuracy: R² = 0.8737, MAE = 8.79 W, RMSE = 16.49 W

export const ML_MODEL_METRICS = {
  source: "Kaggle PV Plant Shading & Fault Dataset",
  modelType: "Polynomial Ridge Regression (Degree 2)",
  r2Score: 0.8737,
  mae: 8.79,
  rmse: 16.49,
  featureImportances: {
    irradiance: 0.949,
    temperature: 0.031,
    angle: 0.011,
    soiling: 0.009
  }
};

const INTERCEPT = -10.156959586391409;
const COEFFICIENTS = [0.0, 0.17891123212475588, 0.5287335795812816, 0.2932681731528158, -0.24447862782568328, -6.423537716139764e-05, 0.0011511432527703779, 6.367400585630658e-05, -0.0005182401830912257, -0.013629054118255853, -0.0033846794722445193, 0.015450407522624509, -0.004107345903565945, 0.003646654885764154, -0.024844219775792913];

/**
 * Predicts solar panel power (Watts) using trained Kaggle ML model
 * @param {number} sun - Solar Irradiance (GTI W/m²)
 * @param {number} temp - PV Cell Temperature (°C)
 * @param {number} angle - Panel Tilt Angle (degrees)
 * @param {number} soil - Soiling / Shading Fault Level (%)
 * @returns {number} Predicted Power in Watts
 */
export function predictPowerML(sun, temp, angle, soil) {
  const x = [sun, temp, angle, soil];
  const terms = [1];
  
  // Degree 1
  for (let i = 0; i < 4; i++) {
    terms.push(x[i]);
  }
  // Degree 2
  for (let i = 0; i < 4; i++) {
    for (let j = i; j < 4; j++) {
      terms.push(x[i] * x[j]);
    }
  }

  let power = INTERCEPT;
  for (let i = 1; i < terms.length; i++) {
    power += COEFFICIENTS[i] * terms[i];
  }

  return parseFloat(Math.max(0, power).toFixed(1));
}
