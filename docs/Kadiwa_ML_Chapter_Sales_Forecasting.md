# KADIWA MART — Machine Learning Module  
## Sales Forecasting using Random Forest Regression  
*(Draft chapter text aligned with MinSU BSIT / Innovet sample format — paste into your Capstone manuscript)*

---

## 3.x Machine Learning Component (Sales Forecasting)

### 3.x.1 Overview
The Kadiwa Mart e-commerce system integrates a **Machine Learning (ML)** module that forecasts short-term store sales. The module helps store owners prepare inventory and staffing based on predicted daily peso sales for the next 3 to 30 days.

The system uses a **Random Forest Regressor** (ensemble supervised learning) trained per store:
- CALSEDECO  
- PAPANDUNGIN  
- JUBILEE  

Unlike a neural network, Random Forest does **not** use epochs. Learning strength is controlled by the number of decision trees (`n_estimators`), tree depth (`max_depth`), lag window, and calendar features.

### 3.x.2 Objectives of the ML Module
1. Predict next-day and multi-day store sales from historical sales patterns.  
2. Support store decision-making through Low / Mid / High demand interpretation.  
3. Continuously retrain using finalized live orders (delivery and pickup) as the system operates.  
4. Provide a fallback estimator if the Python ML engine is temporarily unavailable.

---

## 3.x.3 Machine Learning Lifecycle

The ML lifecycle of Kadiwa Sales Forecasting follows these stages:

1. **Data Collection** — historical daily sales CSV and live finalized orders from MySQL  
2. **Data Preparation** — store filtering, daily aggregation, missing-day fill, recent 180-day window  
3. **Feature Engineering** — lag features, rolling statistics, calendar signals  
4. **Model Training** — Random Forest with time-series cross-validation and hyperparameter tuning  
5. **Model Evaluation** — holdout R² (reported also as approximate accuracy %)  
6. **Model Deployment** — saved `.joblib` models called by the Node.js Backend  
7. **Continuous Learning** — retrain from delivered/pickup orders on schedule and after order finalization  

**Figure suggestion:** *Machine Learning Lifecycle Diagram (Kadiwa Sales Forecasting)*  
*(Insert flowchart: Collect → Clean → Features → Train → Evaluate → Deploy → Retrain)*

---

## 3.x.4 Dataset Description

### A. Seed / Training Dataset
**File:** `ml/dataset/Train/kadiwa_sample_sales.csv`  

| Column | Description |
|--------|-------------|
| `date` | Sales date (daily) |
| `store_id` | Store key (`CALSEDECO`, `PAPANDUNGIN`, `JUBILEE`) |
| `sales` | Total daily sales in Philippine Peso (₱) |

This dataset is used for initial model training and as a bootstrap source when live history is still short.

### B. Live Learning Dataset
**File:** `ml/dataset/Live/kadiwa_live_sales.csv`  

Generated automatically from the production database by exporting finalized orders:

- Status included: `delivered`, `completed`, `paid`, `pickup`  
- Channels included: **delivery** and **pickup**  
- Grouped by `DATE(created_at)` and mapped store owner → model key  

### C. Dataset Usage Rule
| Purpose | Data source |
|---------|-------------|
| Train / retrain model | Seed CSV + Live CSV (blend until live is enough, then live-preferred) |
| Run forecast on website | Last ~90 days of finalized orders from MySQL for that store |
| Notebook demonstration | Seed training CSV + saved `.joblib` models |

> **Note for Results discussion:** If the Forecasting page shows ₱0 averages, the live database has no finalized sales in the recent window. The trained model may still be valid; the input history is empty.

---

## 3.x.5 Feature Engineering

For each prediction day, the Random Forest uses:

1. **Lag features (28 days)** — previous daily sales values  
2. **Rolling mean and standard deviation** — windows of 3, 7, 14, and 28 days  
3. **Calendar features**
   - day-of-week sine/cosine encoding  
   - day-of-year sine/cosine encoding  
   - weekend flag  

The target variable (sales) is transformed with `log1p` during training and inverted after prediction to stabilize variance.

**Figure suggestion:** *Sample feature vector / notebook feature preview output*

---

## 3.x.6 Model Design — Random Forest Regressor

### Algorithm
**Random Forest Regressor** (`scikit-learn`) builds many decision trees and averages their predictions. It is suitable for tabular sales data with nonlinear patterns and moderate dataset size.

### Training configuration (scheduled / live retrain)
- `n_lags = 28`  
- `feature_mode = calendar`  
- `log_target = True`  
- `test_size = 0.20` (most recent 20% holdout)  
- Hyperparameter search via `GridSearchCV` + `TimeSeriesSplit`:
  - `n_estimators`: 300 / 600  
  - `max_depth`: None / 12 / 24  
  - `min_samples_leaf`: 1 / 2 / 4  

### Blending with baseline
After ML prediction, the system may blend with a 7-day moving average using a calibrated `ml_weight` (0.0–1.0) chosen on the holdout window. This reduces unstable spikes when data is noisy.

### Saved artifacts
| Store | Model file |
|-------|------------|
| CALSEDECO | `ml/models/sales_forecaster_store_CALSEDECO.joblib` |
| PAPANDUNGIN | `ml/models/sales_forecaster_store_PAPANDUNGIN.joblib` |
| JUBILEE | `ml/models/sales_forecaster_store_JUBILEE.joblib` |

**Figures suggestion (like Innovet RandomForest Model 1–n):**  
- Training notebook cell outputs per store  
- Actual vs ML-predicted holdout charts  
- 7-day forecast charts per store  

---

## 3.x.7 Model Evaluation (Holdout Accuracy)

Evaluation uses **R² (coefficient of determination)** on the time-based holdout set. For documentation, R² is also presented as approximate accuracy percentage (`R² × 100`).

### Latest training results

| Store | Rows used | R² | Approx. Accuracy | Trees (`n_estimators`) | ML weight |
|-------|-----------|----|------------------|------------------------|-----------|
| CALSEDECO | 180 | 0.4435 | **44.35%** | 300 | 0.8 |
| PAPANDUNGIN | 180 | 0.3621 | **36.21%** | 600 | 0.8 |
| JUBILEE | 180 | 0.5990 | **59.90%** | 600 | 1.0 |

### Interpretation
- Higher R² means predicted sales closer to actual holdout sales.  
- Sales series are naturally noisy (promos, stockouts, weather, local demand), so moderate R² is expected for short-horizon retail forecasting.  
- Continuous learning is expected to improve alignment as more finalized live orders accumulate.

**There are no training epochs.** Report `n_estimators` (number of trees), not epochs.

---

## 3.x.8 System Integration Architecture

```
[Customer Order / POS Pickup]
          |
          v
[Order marked finalized: delivered / pickup / completed / paid]
          |
          v
[MySQL orders table]
     |                 \
     |                  \-- (scheduled / after delivery)
     |                   v
     |            [Export Live CSV]
     |                   |
     |                   v
     |            [retrain_from_live.py]
     |                   |
     |                   v
     |            [.joblib store models]
     |
     v
[Backend salesForecastService.js]
     |
     +--> recent finalized daily sales (90 days)
     +--> Python predict_sales.py + store .joblib
     |
     v
[Store Owner Forecasting Page]
```

### Key files
| Layer | File |
|-------|------|
| ML core | `ml/kadiwa_sales_core.py` |
| Predict API script | `ml/predict_sales.py` |
| Live retrain | `ml/retrain_from_live.py` |
| Verify script | `ml/verify_ml.py` |
| Training notebook | `ml/Kadiwa_Sales_Forecasting_Training.ipynb` |
| Backend bridge | `Backend/services/salesForecastService.js` |
| Continuous learning | `Backend/services/mlLearningService.js` |
| UI | `Frontend/src/views/store/Forecasting.vue` (served via `Frontend/dist`) |

---

## 3.x.9 Continuous Learning (Learning Over Time)

Once the ordering system is functioning, the ML module learns from real transactions:

1. When an order becomes finalized (including **pickup**), Backend queues model relearning.  
2. Nightly/daily scheduler exports live sales and retrains store models.  
3. Store owners can manually click **Retrain from Orders** on the Forecasting page.  
4. Retrain status is saved in `ml/models/last_retrain.json`.

Until live history is long enough (`n_lags + 10` days), training uses **live + seed** data. When live history is sufficient, training prefers **live** data so the model follows the current sales regime.

---

## 3.x.10 Forecasting Page Interpretation (UI)

The Forecasting interface presents:

1. Analytics cards (90-day average, 7-day average, trend, zero-sales days)  
2. **AI Sales Outlook** chart  
   - Solid line = recent actual finalized sales  
   - Dashed line = ML predicted sales  
   - “ML starts” marker separates history and forecast  
3. Low / Mid / High demand badges (relative thirds within the current forecast window)  
4. Product trends table (qty/revenue vs previous period)  
5. Engine pill: **AI / ML model** vs **Fallback estimate**

**Important deployment note:** UI design changes require rebuilding and uploading `Frontend/dist` (or `npm run build` on VPS). Uploading only the `.vue` source will not update the hosted page.

---

## 4.x Results — ML Output Presentation *(draft text for Results chapter)*

### 4.x.1 Training Notebook Results
The researchers executed `Kadiwa_Sales_Forecasting_Training.ipynb` using the project Python virtual environment. The notebook displayed:
- historical sales by store  
- feature matrix shape  
- per-store training logs and accuracy table  
- actual vs predicted holdout plots  
- 7-day forecast plots  

### 4.x.2 Sample 7-day Forecast Output (from trained models)
*(Use the latest demo run values; update if you retrain)*

**CALSEDECO (₱):** 24,982.58 · 27,809.90 · 28,849.47 · 30,870.66 · 34,155.09 · 43,424.75 · 43,946.17  

**PAPANDUNGIN (₱):** 18,107.10 · 15,271.04 · 15,254.00 · 14,588.82 · 16,758.71 · 16,630.64 · 17,366.33  

**JUBILEE (₱):** 17,251.25 · 14,594.92 · 13,751.33 · 13,484.85 · 13,581.14 · 15,606.76 · 16,701.21  

### 4.x.3 Hosted System Observation
On the production Forecasting page, predicted values follow the store’s recent finalized-order history. If the database contains few or no finalized orders in the last 90 days, analytics and forecast values approach zero even if the offline-trained model is present. This confirms that the deployed forecast is **data-driven from live transactions**, not hard-coded.

---

## 5.x Recommendation (ML-related)
1. Continuously accumulate finalized delivery and pickup orders to improve live accuracy.  
2. Extend history to 12–24 months where possible.  
3. Add holiday/payday flags and stockout indicators as additional features.  
4. Retrain regularly after major sales regime changes (new promos, store expansion).  

---

# APPENDIX — Screenshot / Figure Checklist (capture these)

Use these as **List of Figures** entries (Innovet-style).

| Fig. | Title | Where to capture |
|------|-------|------------------|
| ML-1 | Machine Learning Lifecycle Diagram | Draw in Draw.io / PowerPoint from section 3.x.3 |
| ML-2 | Training Dataset Sample (`kadiwa_sample_sales.csv`) | Excel / VS Code / phpMyAdmin export preview |
| ML-3 | Live Dataset Folder / CSV sample | `ml/dataset/Live/` after retrain |
| ML-4 | Notebook Setup Cell Output | `Kadiwa_Sales_Forecasting_Training.ipynb` |
| ML-5 | Historical Sales by Store Chart | Notebook section 2 plot |
| ML-6 | Feature Preview Output | Notebook section 3 |
| ML-7 | Random Forest Training — CALSEDECO | Notebook section 4 log + table row |
| ML-8 | Random Forest Training — PAPANDUNGIN | Notebook section 4 |
| ML-9 | Random Forest Training — JUBILEE | Notebook section 4 |
| ML-10 | Accuracy Summary Table (R² / accuracy_pct) | Notebook section 4 summary |
| ML-11 | Actual vs ML Predicted Holdout — CALSEDECO | Notebook section 5 |
| ML-12 | Actual vs ML Predicted Holdout — PAPANDUNGIN | Notebook section 5 |
| ML-13 | Actual vs ML Predicted Holdout — JUBILEE | Notebook section 5 |
| ML-14 | 7-day Forecast Charts (3 stores) | Notebook section 6 |
| ML-15 | Saved `.joblib` Model Artifacts | Notebook section 7 / WinSCP `ml/models` |
| ML-16 | System Architecture (Order → ML → Forecast UI) | Draw from section 3.x.8 |
| ML-17 | Forecasting Page — Analytics Cards | `kadiwamart.com/.../forecasting` |
| ML-18 | Forecasting Page — AI Sales Outlook Graph | same page after dist deploy |
| ML-19 | Forecasting Page — Interpretation Box | same |
| ML-20 | Engine Pill (AI/ML model) | same (must not say only fallback) |
| ML-21 | Retrain from Orders button + learning banner | same |
| ML-22 | Product Trends Table | same |
| ML-23 | Forecast Table with Low/Mid/High meaning | same |
| ML-24 | VPS `verify_ml.py` / retrain terminal output | Hostinger Web Terminal |
| ML-25 | `last_retrain.json` status | `ml/models/last_retrain.json` |

### Capture tips
1. Rebuild/upload **`Frontend/dist`** before UI screenshots.  
2. For non-zero page screenshots, use a store with finalized delivery/pickup orders.  
3. In the manuscript, caption Random Forest figures similarly to Innovet (“RandomForest Model 1…”) but label store names clearly.  
4. State explicitly: **no epochs**; report **trees / n_estimators** and **R² accuracy**.

---

*End of draft — copy sections into your Capstone Chapters III–V and Appendices as needed.*
