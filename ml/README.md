# Train the shared power model

The ML work is split into two implementation files: `prepare_and_validate.py` handles dataset loading, timestamp joins, validation, deterministic sampling, and feature construction; `train_and_evaluate.py` handles Ridge training, chronological holdout metrics, and exports for ESP32 and dashboard.

```sh
python ml/train_and_evaluate.py --data-dir /path/to/dataset
```

`train_kaggle_model.py` remains as a backward-compatible command wrapper and runs the same split workflow.

The folder must contain `dt1_solar_and_meteorological_measurement.csv` and `dt2_electrical_production_inverter_1_with_faults.csv`. Training matches timestamps, caps each fault class at 12,000 sampled rows, and reserves the latest 20% of the resulting time-sorted sample for a holdout. The reported score is therefore class-stratified, not weighted by raw dataset event frequency. It writes `ml/trained_model.json`, `include/ml_model.h`, and `dashboard/src/mlModel.js`.

Features are GTI, PV temperature, and the dataset's categorical fault label. The dataset does not measure panel angle or dust percentage; the Wokwi angle and soiling controls are simulation assumptions. Reported metrics are for a 150 W equivalent demo panel, not an independently measured 150 W panel.
