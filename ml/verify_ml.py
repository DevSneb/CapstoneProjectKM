"""Smoke-check trained Kadiwa sales models and prediction CLI path."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from kadiwa_sales_core import (
    DATA_CSV,
    MODELS_DIR,
    SCHEDULED_CONFIG,
    STORES,
    TARGET_COLUMN,
    load_model,
    load_store_daily_frame,
)


def _fail(message: str) -> None:
    print(json.dumps({"ok": False, "message": message}))
    raise SystemExit(1)


def verify_store(store_id: str) -> dict:
    model_path = MODELS_DIR / f"sales_forecaster_store_{store_id}.joblib"
    if not model_path.exists():
        _fail(f"Missing model for {store_id}: {model_path}")

    model = load_model(model_path)
    required_lags = int(getattr(model.config, "n_lags", SCHEDULED_CONFIG.n_lags) or 28)

    frame = load_store_daily_frame(
        DATA_CSV,
        target_column=TARGET_COLUMN,
        store_id=store_id,
    ).tail(180)
    y = frame[TARGET_COLUMN].astype(float).tolist()
    if len(y) < required_lags:
        _fail(f"Not enough history for {store_id}: need {required_lags}, got {len(y)}")

    recent = y[-required_lags:]
    forecast = model.predict_next(recent, horizon=7)
    if len(forecast) != 7:
        _fail(f"Expected 7 forecast steps for {store_id}, got {len(forecast)}")
    if any(not (value == value) for value in forecast):  # NaN check
        _fail(f"NaN forecast values for {store_id}")

    return {
        "store_id": store_id,
        "model_path": str(model_path),
        "n_lags": required_lags,
        "feature_mode": getattr(model.config, "feature_mode", None),
        "ml_weight": float(getattr(model.config, "ml_weight", 1.0)),
        "history_points": len(y),
        "forecast_7d": [round(float(value), 2) for value in forecast.tolist()],
    }


def main() -> None:
    if not DATA_CSV.exists():
        _fail(f"Training CSV not found: {DATA_CSV}")

    results = []
    for store_id in STORES:
        print(f"Verifying {store_id}...")
        results.append(verify_store(store_id))

    print(
        json.dumps(
            {
                "ok": True,
                "stores_checked": len(results),
                "results": results,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:
        print(json.dumps({"ok": False, "message": str(exc)}))
        sys.exit(1)
