"""Export Kadiwa ML notebook graphs to ml/figures/ as PNG files."""

from __future__ import annotations

import base64
from pathlib import Path

import nbformat

NOTEBOOK = Path(__file__).resolve().parent / "Kadiwa_Sales_Forecasting_Training.ipynb"
OUT_DIR = Path(__file__).resolve().parent / "figures"

# Map (cell_index, png_order_in_cell) -> filename
NAME_MAP = {
    (6, 0): "01_historical_sales_all_stores.png",
    (8, 0): "02_sales_lines_per_store.png",
    (8, 1): "03_sales_distribution_per_store.png",
    (15, 0): "04_accuracy_and_r2_bars.png",
    (17, 0): "05_actual_vs_predicted_holdout.png",
    (19, 0): "06_scatter_and_residuals.png",
    (21, 0): "07_seven_day_forecast_charts.png",
    (23, 0): "08_history_plus_forecast_ml_starts.png",
    (25, 0): "09_feature_importance.png",
}


def main() -> None:
    nb = nbformat.read(NOTEBOOK, as_version=4)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    saved = []
    for cell_index, cell in enumerate(nb.cells):
        if cell.cell_type != "code":
            continue
        png_order = 0
        for output in cell.get("outputs", []):
            data = output.get("data") or {}
            if "image/png" not in data:
                continue
            raw = data["image/png"]
            if isinstance(raw, list):
                raw = "".join(raw)
            filename = NAME_MAP.get((cell_index, png_order), f"cell_{cell_index:02d}_fig_{png_order+1:02d}.png")
            path = OUT_DIR / filename
            path.write_bytes(base64.b64decode(raw))
            saved.append(path.name)
            png_order += 1

    readme = OUT_DIR / "README.txt"
    readme.write_text(
        "Kadiwa ML figures exported from Kadiwa_Sales_Forecasting_Training.ipynb\n"
        "Use these PNGs in your Capstone manuscript (List of Figures).\n\n"
        + "\n".join(f"- {name}" for name in saved)
        + "\n",
        encoding="utf-8",
    )

    print(f"Saved {len(saved)} figures to: {OUT_DIR}")
    for name in saved:
        print(f"  {name}")


if __name__ == "__main__":
    main()
