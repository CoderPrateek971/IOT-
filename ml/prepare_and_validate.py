"""Member A starts here: prepare and validate Kaggle training inputs."""
import csv
import random
from pathlib import Path

DATASET = "pythonafroz/pv-plant-in-normal-and-shading-faults-conditions"
FAULTS = [0.0, 1.0, 2.1, 2.2, 2.3, 3.1, 3.2, 4.0]
FAULT_FILES = {
    "dt1": "dt1_solar_and_meteorological_measurement.csv",
    "dt2": "dt2_electrical_production_inverter_1_with_faults.csv",
}
PANEL_W = 150.0
SAMPLES_PER_FAULT = 12000


def find_dataset(explicit_path):
    if explicit_path:
        return Path(explicit_path).expanduser()
    try:
        import kagglehub
        return Path(kagglehub.dataset_download(DATASET))
    except Exception as error:
        raise SystemExit(
            "Dataset not found. Download it from Kaggle or run with --data-dir PATH. "
            f"Details: {error}"
        )


def collect_samples(data_dir):
    rng = random.Random(42)
    reservoirs = {fault: [] for fault in FAULTS}
    seen = {fault: 0 for fault in FAULTS}
    inverter_path = data_dir / FAULT_FILES["dt2"]

    print("Sampling real inverter readings by fault class...")
    with inverter_path.open(newline="", encoding="utf-8") as stream:
        for row in csv.DictReader(stream):
            try:
                fault = float(row["Fault"])
                power = float(row["Pg"])
                timestamp = row["time"][:19]
            except (KeyError, TypeError, ValueError):
                continue
            if fault not in reservoirs or power <= 0:
                continue
            seen[fault] += 1
            sample = (timestamp, fault, power)
            bucket = reservoirs[fault]
            if len(bucket) < SAMPLES_PER_FAULT:
                bucket.append(sample)
            else:
                position = rng.randrange(seen[fault])
                if position < SAMPLES_PER_FAULT:
                    bucket[position] = sample

    selected = {}
    for bucket in reservoirs.values():
        for timestamp, fault, power in bucket:
            selected.setdefault(timestamp, []).append((fault, power))
    print(f"Selected {sum(map(len, reservoirs.values())):,} inverter rows; matching weather readings...")

    joined = []
    weather_path = data_dir / FAULT_FILES["dt1"]
    with weather_path.open(newline="", encoding="utf-8") as stream:
        for row in csv.DictReader(stream):
            timestamp = row.get("time", "")[:19]
            matches = selected.get(timestamp)
            if not matches:
                continue
            try:
                irradiance = float(row["GTI"])
                temperature = float(row["TPV"])
            except (KeyError, TypeError, ValueError):
                continue
            if irradiance <= 50:
                continue
            for fault, power in matches:
                joined.append((timestamp, irradiance, temperature, fault, power))

    if len(joined) < 1000:
        raise SystemExit(
            f"Only {len(joined)} matched rows. Check that dt1 and dt2 are from the same dataset version."
        )
    return sorted(joined, key=lambda item: item[0])


def features(irradiance, temperature, fault):
    return [irradiance / 1000.0, (temperature - 25.0) / 25.0] + [
        1.0 if fault == label else 0.0 for label in FAULTS
    ]


