"""Retrain store sales models from live delivered-order exports.

Merges live CSV with the seed training CSV when a store still has too little
history, so the system can learn over time as orders are delivered.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from kadiwa_sales_core import (
    DATA_CSV,
    MODELS_DIR,
    SCHEDULED_CONFIG,
    STORES,
    STORE_COLUMN,
    TARGET_COLUMN,
    SalesForecaster,
    TrainingConfig,
    save_model,
)

_ML_ROOT = Path(__file__).resolve().parent
LIVE_CSV_DEFAULT = _ML_ROOT / "dataset" / "Live" / "kadiwa_live_sales.csv"
STATUS_PATH = MODELS_DIR / "last_retrain.json"


def _read_store_frame(csv_path: Path, store_id: str) -> pd.DataFrame | None:
    if not csv_path.exists():
        return None
    df = pd.read_csv(csv_path)
    if STORE_COLUMN not in df.columns or TARGET_COLUMN not in df.columns or "date" not in df.columns:
        return None
    filtered = df[df[STORE_COLUMN] == store_id].copy()
    if filtered.empty:
        return None
    filtered["date"] = pd.to_datetime(filtered["date"], errors="coerce")
    filtered[TARGET_COLUMN] = pd.to_numeric(filtered[TARGET_COLUMN], errors="coerce").fillna(0)
    filtered = filtered.dropna(subset=["date"])
    daily = filtered.groupby("date", as_index=True)[TARGET_COLUMN].sum().sort_index()
    if daily.empty:
        return None
    full_dates = pd.date_range(daily.index.min(), daily.index.max(), freq="D")
    return (
        daily.reindex(full_dates, fill_value=0)
        .rename(TARGET_COLUMN)
        .rename_axis("date")
        .reset_index()
    )


def build_learning_frame(store_id: str, live_csv: Path, seed_csv: Path) -> tuple[pd.DataFrame, str]:
    """Prefer live orders; bootstrap with seed history until live data is rich enough."""

    live = _read_store_frame(live_csv, store_id)
    seed = _read_store_frame(seed_csv, store_id)
    min_points = SCHEDULED_CONFIG.n_lags + 10

    if live is not None and len(live) >= min_points:
        return live.tail(180).reset_index(drop=True), "live"

    if live is not None and seed is not None:
        combined = pd.concat([seed, live], ignore_index=True)
        combined["date"] = pd.to_datetime(combined["date"])
        combined = (
            combined.groupby("date", as_index=False)[TARGET_COLUMN]
            .sum()
            .sort_values("date")
            .reset_index(drop=True)
        )
        return combined.tail(180).reset_index(drop=True), "live+seed"

    if live is not None:
        return live.tail(180).reset_index(drop=True), "live_partial"

    if seed is not None:
        return seed.tail(180).reset_index(drop=True), "seed"

    raise ValueError(f"No training rows available for store {store_id}")


def train_store(store_id: str, live_csv: Path, seed_csv: Path) -> dict:
    frame, source = build_learning_frame(store_id, live_csv, seed_csv)
    y = frame[TARGET_COLUMN].astype(float).tolist()
    dates = frame["date"].tolist()

    if len(y) < SCHEDULED_CONFIG.n_lags + 10:
        return {
            "store_id": store_id,
            "ok": False,
            "message": f"Not enough points ({len(y)})",
            "source": source,
        }

    config = TrainingConfig(**{**SCHEDULED_CONFIG.__dict__})
    forecaster = SalesForecaster(config)
    score = forecaster.fit_with_tuning(y, dates)

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    model_path = MODELS_DIR / f"sales_forecaster_store_{store_id}.joblib"
    save_model(forecaster, model_path)

    return {
        "store_id": store_id,
        "ok": True,
        "source": source,
        "rows": len(frame),
        "r2": float(score),
        "accuracy_pct": float(score) * 100,
        "ml_weight": float(getattr(forecaster.config, "ml_weight", 1.0)),
        "n_estimators": forecaster.config.n_estimators,
        "model_path": str(model_path),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Retrain Kadiwa ML models from live order sales.")
    parser.add_argument("--live-csv", default=str(LIVE_CSV_DEFAULT), help="CSV exported from delivered orders")
    parser.add_argument("--seed-csv", default=str(DATA_CSV), help="Bootstrap/historical CSV")
    parser.add_argument("--stores", default=",".join(STORES), help="Comma-separated store keys")
    args = parser.parse_args()

    live_csv = Path(args.live_csv)
    seed_csv = Path(args.seed_csv)
    stores = [token.strip() for token in args.stores.split(",") if token.strip()]

    print(json.dumps({
        "event": "retrain_start",
        "live_csv": str(live_csv),
        "seed_csv": str(seed_csv),
        "stores": stores,
    }))

    results = []
    for store_id in stores:
        try:
            result = train_store(store_id, live_csv, seed_csv)
        except Exception as exc:
            result = {"store_id": store_id, "ok": False, "message": str(exc)}
        results.append(result)
        print(json.dumps({"event": "store_result", **result}))

    payload = {
        "ok": any(item.get("ok") for item in results),
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "live_csv": str(live_csv),
        "seed_csv": str(seed_csv),
        "results": results,
    }
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    STATUS_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps(payload))


if __name__ == "__main__":
    main()
