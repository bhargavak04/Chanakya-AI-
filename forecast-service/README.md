# Pulse Forecast Service

Optional Python microservice for **Prophet-based** time-series forecasting. When running and configured in the Node backend, forecast mode uses this service instead of simple linear regression.

## Features

- **Prophet** (Meta) for business time-series with automatic seasonality
- **Moving-average fallback** when fewer than 14 data points
- **Yearly seasonality disabled** when fewer than 60 points (better for SMB data)
- **Simple IQR-based outlier removal** before fitting
- **95% confidence intervals** (upper/lower bounds) in the response

## Setup

```bash
cd forecast-service
python -m venv .venv
.venv\Scripts\activate   # Windows
# source .venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
```

## Run

```bash
uvicorn main:app --reload --port 5001
```

Health: `GET http://localhost:5001/health`

## Backend configuration

In the Pulse **Backend** (Node), set:

```env
FORECAST_SERVICE_URL=http://localhost:5001
```

If unset, the backend falls back to built-in linear regression for forecast mode.

## API

**POST /forecast**

Request:

```json
{
  "series": [
    { "ds": "2025-01-01", "y": 1200 },
    { "ds": "2025-01-02", "y": 1350 }
  ],
  "periods": 7
}
```

Response:

```json
{
  "history": [{ "ds": "2025-01-01", "y": 1200 }, ...],
  "forecast": [{ "ds": "2025-01-08", "y": 1420 }, ...],
  "upper_bound": [1520, ...],
  "lower_bound": [1320, ...]
}
```

- `ds`: date string `YYYY-MM-DD`
- `periods`: 1–90 (number of steps to predict)
