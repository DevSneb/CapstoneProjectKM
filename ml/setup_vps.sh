#!/usr/bin/env bash
# Run once on the VPS after uploading the ml/ folder to /var/www/kadiwa/ml
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required. Install with: apt update && apt install -y python3 python3-venv python3-pip"
  exit 1
fi

python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt

# Train models if missing
if [ ! -f models/sales_forecaster_store_CALSEDECO.joblib ]; then
  echo "Training store models..."
  .venv/bin/python kadiwa_sales_core.py
fi

echo ""
echo "ML setup complete."
echo "Add this line to /var/www/kadiwa/Backend/.env :"
echo "ML_PYTHON_EXECUTABLE=/var/www/kadiwa/ml/.venv/bin/python"
echo "Then run: pm2 restart all"
