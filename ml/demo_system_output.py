"""Print a clear console demo of trained Kadiwa ML output."""

from __future__ import annotations

import json
from pathlib import Path

from kadiwa_sales_core import (
    DATA_CSV,
    MODELS_DIR,
    STORES,
    TARGET_COLUMN,
    load_model,
    load_store_daily_frame,
)


def main() -> None:
    print("=" * 64)
    print("KADIWA ML SYSTEM OUTPUT")
    print("=" * 64)

    status_path = MODELS_DIR / "last_retrain.json"
    if status_path.exists():
        status = json.loads(status_path.read_text(encoding="utf-8"))
        print(f"\nLast retrain: {status.get('trained_at')}")
        print(f"OK: {status.get('ok')}")
        for row in status.get("results", []):
            if row.get("ok"):
                print(
                    f"  - {row['store_id']}: accuracy={row.get('accuracy_pct', 0):.2f}%  "
                    f"R2={row.get('r2', 0):.4f}  source={row.get('source')}  "
                    f"trees={row.get('n_estimators')}"
                )
            else:
                print(f"  - {row.get('store_id')}: FAILED {row.get('message')}")
    else:
        print("\nNo last_retrain.json yet")

    print("\n" + "-" * 64)
    print("7-DAY FORECASTS (from trained models)")
    print("-" * 64)

    for store in STORES:
        model_path = MODELS_DIR / f"sales_forecaster_store_{store}.joblib"
        model = load_model(model_path)
        frame = load_store_daily_frame(DATA_CSV, store_id=store).tail(180)
        recent = frame[TARGET_COLUMN].astype(float).tolist()[-model.config.n_lags :]
        forecast = model.predict_next(recent, horizon=7)
        print(f"\n{store}")
        print(
            f"  engine=python  n_lags={model.config.n_lags}  "
            f"feature_mode={model.config.feature_mode}"
        )
        print("  day | predicted sales (PHP)")
        for index, value in enumerate(forecast, start=1):
            print(f"   {index:>2} | {float(value):,.2f}")

    print("\n" + "=" * 64)
    print("DONE")
    print("Notebook: Kadiwa_Sales_Forecasting_Training.ipynb")
    print("Jupyter:  http://localhost:8888/tree  (if server still running)")
    print("=" * 64)


if __name__ == "__main__":
    main()
