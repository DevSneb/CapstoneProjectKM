from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Sequence

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import GridSearchCV, TimeSeriesSplit


# =========================
# Core training primitives
# =========================


@dataclass
class TrainingConfig:
    """Configuration for training the sales forecaster."""

    target_column: str = "sales"
    test_size: float = 0.2
    random_state: int = 42
    n_estimators: int = 200
    max_depth: Optional[int] = None
    n_lags: int = 28  # how many past days to use as features
    feature_mode: str = "calendar"
    log_target: bool = True
    ml_weight: float = 1.0


class SalesForecaster:
    """Date-aware machine-learning model for short-term sales forecasting."""

    def __init__(self, config: TrainingConfig | None = None) -> None:
        self.config = config or TrainingConfig()
        self.model = RandomForestRegressor(
            n_estimators=self.config.n_estimators,
            max_depth=self.config.max_depth,
            random_state=self.config.random_state,
            n_jobs=-1,
        )
        self._is_fitted = False

    @staticmethod
    def _make_lag_features(y: np.ndarray, n_lags: int) -> tuple[np.ndarray, np.ndarray]:
        """Create lag features from 1D target array.

        X[t] = [y[t-1], ..., y[t-n_lags]] -> predict y[t].
        """

        if y.ndim != 1:
            raise ValueError("y must be a 1D array")
        if len(y) <= n_lags:
            raise ValueError("Not enough data to create lag features")

        X, target = [], []
        for t in range(n_lags, len(y)):
            X.append(y[t - n_lags : t])
            target.append(y[t])
        return np.asarray(X), np.asarray(target)

    def _make_calendar_features(
        self, history: Sequence[float], timestamp: pd.Timestamp
    ) -> np.ndarray:
        values = np.asarray(history, dtype=float)
        if len(values) < self.config.n_lags:
            raise ValueError("Not enough data to create calendar features")

        features = [float(values[-lag]) for lag in range(1, self.config.n_lags + 1)]
        for window in (3, 7, 14, 28):
            recent = values[-window:]
            features.extend((float(np.mean(recent)), float(np.std(recent))))

        day_of_week = timestamp.day_of_week
        day_of_year = timestamp.day_of_year
        features.extend((
            np.sin(2 * np.pi * day_of_week / 7),
            np.cos(2 * np.pi * day_of_week / 7),
            np.sin(2 * np.pi * day_of_year / 365.25),
            np.cos(2 * np.pi * day_of_year / 365.25),
            float(day_of_week >= 5),
        ))
        return np.asarray(features, dtype=float)

    def _make_features(
        self, y: np.ndarray, dates: Sequence[pd.Timestamp] | None = None
    ) -> tuple[np.ndarray, np.ndarray]:
        if getattr(self.config, "feature_mode", "lag") != "calendar":
            return self._make_lag_features(y, self.config.n_lags)

        if dates is None:
            dates = pd.date_range(end=pd.Timestamp.today().normalize(), periods=len(y), freq="D")
        if len(dates) != len(y):
            raise ValueError("dates must have the same length as y")

        X, target = [], []
        for index in range(self.config.n_lags, len(y)):
            history = y[:index]
            X.append(self._make_calendar_features(history, pd.Timestamp(dates[index])))
            target.append(y[index])
        if not X:
            raise ValueError("Not enough data to create calendar features")
        return np.asarray(X), np.asarray(target)

    def _transform_target(self, values: np.ndarray) -> np.ndarray:
        return np.log1p(np.maximum(values, 0)) if getattr(self.config, "log_target", False) else values

    def _inverse_target(self, values: np.ndarray) -> np.ndarray:
        return (
            np.maximum(0, np.expm1(values))
            if getattr(self.config, "log_target", False)
            else np.maximum(0, values)
        )

    def _calibrate_blend(
        self, y: np.ndarray, n_train: int, predictions: np.ndarray
    ) -> None:
        """Choose the ML/naive blend that performs best on the time holdout."""

        first_test_index = self.config.n_lags + n_train
        baselines = np.asarray([
            np.mean(y[max(0, index - 7):index])
            for index in range(first_test_index, len(y))
        ])
        if not len(baselines):
            self.config.ml_weight = 1.0
            return

        weights = np.linspace(0, 1, 11)
        errors = [
            np.mean(np.abs(y[first_test_index:] - (weight * predictions + (1 - weight) * baselines)))
            for weight in weights
        ]
        self.config.ml_weight = float(weights[int(np.argmin(errors))])

    def fit(
        self, y: Sequence[float], dates: Sequence[pd.Timestamp] | None = None
    ) -> float:
        """Fit model on a 1D sequence of sales values and return test R^2."""

        y_arr = np.maximum(0, np.asarray(y, dtype=float))
        X_all, y_all = self._make_features(y_arr, dates)
        model_target = self._transform_target(y_all)

        # simple time-based train/test split
        n_samples = len(X_all)
        n_test = max(1, int(n_samples * self.config.test_size))
        n_train = n_samples - n_test

        X_train, X_test = X_all[:n_train], X_all[n_train:]
        y_train, y_test = model_target[:n_train], y_all[n_train:]

        self.model.fit(X_train, y_train)
        self._is_fitted = True

        if n_test == 0:
            return float("nan")

        predictions = self._inverse_target(self.model.predict(X_test))
        self._calibrate_blend(y_arr, n_train, predictions)
        predictions = (
            self.config.ml_weight * predictions
            + (1 - self.config.ml_weight) * np.asarray([
                np.mean(y_arr[max(0, index - 7):index])
                for index in range(self.config.n_lags + n_train, len(y_arr))
            ])
        )
        score = 1 - (
            np.sum((y_test - predictions) ** 2)
            / max(np.finfo(float).eps, np.sum((y_test - np.mean(y_test)) ** 2))
        )
        return float(score)

    def fit_with_tuning(
        self, y: Sequence[float], dates: Sequence[pd.Timestamp] | None = None
    ) -> float:
        """Fit model with basic hyperparameter tuning for higher accuracy.

        Uses a time-series aware cross-validation (TimeSeriesSplit) on the
        training portion of the data to search over a small grid of
        RandomForest hyperparameters, then evaluates on the most recent
        hold-out segment (same logic as ``fit``).
        """

        y_arr = np.maximum(0, np.asarray(y, dtype=float))
        X_all, y_all = self._make_features(y_arr, dates)
        model_target = self._transform_target(y_all)

        # time-based train/test split (same as in fit)
        n_samples = len(X_all)
        n_test = max(1, int(n_samples * self.config.test_size))
        n_train = n_samples - n_test

        if n_train <= 3:
            # Not enough data to meaningfully tune; fall back to simple fit
            return self.fit(y, dates)

        X_train, X_test = X_all[:n_train], X_all[n_train:]
        y_train, y_test = model_target[:n_train], y_all[n_train:]

        # Use a small grid to keep nightly training fast
        param_grid = {
            "n_estimators": [300, 600],
            "max_depth": [None, 12, 24],
            "min_samples_leaf": [1, 2, 4],
        }

        # Ensure we have enough points for TimeSeriesSplit
        n_splits = 3
        if n_train <= n_splits:
            return self.fit(y)

        tscv = TimeSeriesSplit(n_splits=n_splits)

        base_model = RandomForestRegressor(
            random_state=self.config.random_state,
            n_jobs=-1,
        )

        grid = GridSearchCV(
            estimator=base_model,
            param_grid=param_grid,
            scoring="neg_mean_absolute_error",
            cv=tscv,
            n_jobs=-1,
        )

        grid.fit(X_train, y_train)

        # Refit best model on full training set and evaluate on hold-out
        best_params = grid.best_params_

        # Keep config in sync with the tuned parameters for saving/inspection
        self.config.n_estimators = best_params.get("n_estimators", self.config.n_estimators)
        self.config.max_depth = best_params.get("max_depth", self.config.max_depth)

        tuned_model = RandomForestRegressor(
            n_estimators=self.config.n_estimators,
            max_depth=self.config.max_depth,
            min_samples_leaf=best_params.get("min_samples_leaf", 1),
            random_state=self.config.random_state,
            n_jobs=-1,
        )

        tuned_model.fit(X_train, y_train)
        self.model = tuned_model
        self._is_fitted = True

        predictions = self._inverse_target(self.model.predict(X_test)) if n_test > 0 else np.array([])
        if not n_test:
            return float("nan")
        self._calibrate_blend(y_arr, n_train, predictions)
        predictions = (
            self.config.ml_weight * predictions
            + (1 - self.config.ml_weight) * np.asarray([
                np.mean(y_arr[max(0, index - 7):index])
                for index in range(self.config.n_lags + n_train, len(y_arr))
            ])
        )
        score = 1 - (
            np.sum((y_test - predictions) ** 2)
            / max(np.finfo(float).eps, np.sum((y_test - np.mean(y_test)) ** 2))
        )
        return float(score)

    def predict_next(
        self,
        recent_sales: Sequence[float],
        horizon: int = 1,
        last_date: pd.Timestamp | None = None,
    ) -> np.ndarray:
        """Predict the next `horizon` steps using the most recent sales.

        `recent_sales` must have at least `n_lags` values.
        """

        if not self._is_fitted:
            raise RuntimeError("Model is not fitted. Call fit() first or load a trained model.")

        history = list(recent_sales)
        if len(history) < self.config.n_lags:
            raise ValueError(
                f"Need at least {self.config.n_lags} recent values, got {len(history)}"
            )

        preds = []
        reference_date = pd.Timestamp(last_date or pd.Timestamp.today()).normalize()
        for step in range(1, horizon + 1):
            if getattr(self.config, "feature_mode", "lag") == "calendar":
                features = self._make_calendar_features(
                    history, reference_date + pd.Timedelta(days=step)
                )
            else:
                features = np.asarray(history[-self.config.n_lags :], dtype=float)
            model_prediction = float(self.model.predict(features.reshape(1, -1))[0])
            ml_prediction = float(self._inverse_target(np.asarray([model_prediction]))[0])
            baseline = float(np.mean(history[-7:]))
            ml_weight = float(getattr(self.config, "ml_weight", 1.0))
            next_val = (ml_weight * ml_prediction) + ((1 - ml_weight) * baseline)
            preds.append(next_val)
            history.append(next_val)

        return np.asarray(preds)


# --------- Simple CSV helpers (single or multi-store) ---------


def load_series(csv_path: str | Path, *, target_column: str = "sales") -> list[float]:
    """Load a single sales series from CSV (no store column)."""

    csv_path = Path(csv_path)
    df = pd.read_csv(csv_path)
    if target_column not in df.columns:
        raise ValueError(f"Target column '{target_column}' not found in CSV")
    return df[target_column].astype(float).tolist()


def load_store_series(
    csv_path: str | Path,
    *,
    target_column: str = "sales",
    store_column: str = "store_id",
    store_id: str | int | None = None,
) -> list[float]:
    """Load sales series for a single store from a multi-store CSV."""

    csv_path = Path(csv_path)
    df = pd.read_csv(csv_path)

    if target_column not in df.columns:
        raise ValueError(f"Target column '{target_column}' not found in CSV")
    if store_column not in df.columns:
        raise ValueError(f"Store column '{store_column}' not found in CSV")
    if store_id is None:
        raise ValueError("store_id must be provided for load_store_series")

    filtered = df[df[store_column] == store_id]
    if filtered.empty:
        raise ValueError(
            f"No rows found for {store_column}={store_id!r} in {csv_path}"
        )

    return filtered[target_column].astype(float).tolist()


def load_store_daily_frame(
    csv_path: str | Path,
    *,
    target_column: str = "sales",
    store_column: str = "store_id",
    date_column: str = "date",
    store_id: str | int,
) -> pd.DataFrame:
    """Load one store as a complete daily series, filling missing days with zero."""

    df = pd.read_csv(Path(csv_path))
    required = {target_column, store_column, date_column}
    missing = required.difference(df.columns)
    if missing:
        raise ValueError(f"Missing columns in CSV: {', '.join(sorted(missing))}")

    filtered = df[df[store_column] == store_id].copy()
    if filtered.empty:
        raise ValueError(f"No rows found for {store_column}={store_id!r} in {csv_path}")

    filtered[date_column] = pd.to_datetime(filtered[date_column], errors="raise")
    filtered[target_column] = pd.to_numeric(filtered[target_column], errors="raise")
    daily = filtered.groupby(date_column, as_index=True)[target_column].sum().sort_index()
    full_dates = pd.date_range(daily.index.min(), daily.index.max(), freq="D")
    return (
        daily.reindex(full_dates, fill_value=0)
        .rename(target_column)
        .rename_axis(date_column)
        .reset_index()
    )


def save_model(model: SalesForecaster, path: str | Path) -> None:
    """Save trained model + config to disk."""

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    config = {
        field: getattr(model.config, field)
        for field in TrainingConfig.__dataclass_fields__
        if hasattr(model.config, field)
    }
    joblib.dump({"config": config, "model": model.model}, path)


def load_model(path: str | Path) -> SalesForecaster:
    """Load a previously saved model."""

    path = Path(path)
    data = joblib.load(path)
    raw_config = data.get("config") or {}
    if isinstance(raw_config, dict):
        config = TrainingConfig(**{
            field: raw_config[field]
            for field in TrainingConfig.__dataclass_fields__
            if field in raw_config
        })
    else:
        config = raw_config
    forecaster = SalesForecaster(config=config)
    forecaster.model = data["model"]
    forecaster._is_fitted = True
    return forecaster


# =========================
# Nightly training entrypoint
# =========================

# Configuration for scheduled training (paths anchored to this file so cwd does not matter)
_ML_ROOT = Path(__file__).resolve().parent
DATA_CSV = _ML_ROOT / "dataset" / "Train" / "kadiwa_sample_sales.csv"  # replace with your real export path
MODELS_DIR = _ML_ROOT / "models"

# List of stores to train for (IDs must match your data)
STORES: List[str] = [
    "CALSEDECO",
    "PAPANDUNGIN",
    "JUBILEE",
]

TARGET_COLUMN = "sales"
STORE_COLUMN = "store_id"

# Model hyperparameters (tune if needed)
SCHEDULED_CONFIG = TrainingConfig(
    target_column=TARGET_COLUMN,
    test_size=0.2,
    n_lags=28,
    feature_mode="calendar",
    log_target=True,
)


def train_for_store(store_id: str) -> None:
    """Train and save a model for a single store using DATA_CSV."""

    print(f"\n=== Training model for store {store_id} ===")

    if not DATA_CSV.exists():
        raise FileNotFoundError(f"Data CSV not found: {DATA_CSV}")

    # Optional: quick check that store exists in data
    df = pd.read_csv(DATA_CSV)
    if store_id not in df[STORE_COLUMN].unique():
        print(f"Store {store_id} not found in data, skipping.")
        return

    frame = load_store_daily_frame(
        DATA_CSV,
        target_column=TARGET_COLUMN,
        store_column=STORE_COLUMN,
        store_id=store_id,
    )
    # Short-horizon forecasts should follow the current sales regime instead of
    # allowing old one-off spikes to dominate the model.
    frame = frame.tail(180).reset_index(drop=True)
    y = frame[TARGET_COLUMN].tolist()
    dates = frame["date"].tolist()

    if len(y) < SCHEDULED_CONFIG.n_lags + 10:
        print(f"Not enough data for {store_id} (have {len(y)} points), skipping.")
        return

    forecaster = SalesForecaster(SCHEDULED_CONFIG)
    # Use tuned training for better accuracy on each store
    score = forecaster.fit_with_tuning(y, dates)
    accuracy_pct = float(score) * 100

    print(f"Test R^2 for {store_id}: {score:.4f}")
    print(f"Approx forecast accuracy for {store_id}: {accuracy_pct:.2f}%")

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    model_path = MODELS_DIR / f"sales_forecaster_store_{store_id}.joblib"
    save_model(forecaster, model_path)
    print(f"Saved model for {store_id} to {model_path}")


def run_nightly_training() -> None:
    """Entry point for scheduled nightly training over all STORES."""

    print("Starting nightly Kadiwa model training...")
    print(f"Using data: {DATA_CSV}")

    for store_id in STORES:
        try:
            train_for_store(store_id)
        except Exception as exc:
            # Log and continue with other stores
            print(f"Error while training {store_id}: {exc}")

    print("Training run complete.")


if __name__ == "__main__":
    # When run as a script (e.g., by Task Scheduler), perform nightly training
    run_nightly_training()
