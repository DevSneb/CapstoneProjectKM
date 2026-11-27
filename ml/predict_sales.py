import argparse
import json
from pathlib import Path

from kadiwa_sales_core import load_model


def parse_recent(raw: str):
    values = []
    for token in raw.split(','):
        token = token.strip()
        if not token:
            continue
        values.append(float(token))
    return values


def main():
    parser = argparse.ArgumentParser(description='Predict next-day sales using trained Kadiwa model.')
    parser.add_argument('--model-path', required=True, help='Path to .joblib model file')
    parser.add_argument('--horizon', type=int, default=7, help='Number of future days to predict')
    parser.add_argument('--recent', required=True, help='Comma-separated recent daily sales values')
    args = parser.parse_args()

    model_path = Path(args.model_path)
    if not model_path.exists():
        print(json.dumps({
            'ok': False,
            'message': f'Model file not found: {model_path}'
        }))
        return

    horizon = max(1, min(30, int(args.horizon or 7)))
    recent_sales = parse_recent(args.recent)

    model = load_model(model_path)
    required_lags = int(getattr(model.config, 'n_lags', 28) or 28)

    if len(recent_sales) < required_lags:
        padding = [0.0] * (required_lags - len(recent_sales))
        recent_sales = padding + recent_sales

    forecast = model.predict_next(recent_sales, horizon=horizon)

    print(json.dumps({
        'ok': True,
        'engine': 'python',
        'model_path': str(model_path),
        'horizon': horizon,
        'required_lags': required_lags,
        'recent_sales': [round(float(x), 2) for x in recent_sales],
        'forecast': [round(float(x), 2) for x in forecast.tolist()]
    }))


if __name__ == '__main__':
    main()
