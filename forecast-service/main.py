"""
Forecast service: Prophet (or moving-average fallback) for time-series prediction.
POST /forecast with { "series": [{"ds": "YYYY-MM-DD", "y": number}, ...], "periods": N }
Returns { "history": [...], "forecast": [...], "upper_bound": [...], "lower_bound": [...] }
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Any

import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="Pulse Forecast Service", version="1.0")


class SeriesPoint(BaseModel):
    ds: str  # YYYY-MM-DD or ISO datetime
    y: float


class ForecastRequest(BaseModel):
    series: list[SeriesPoint] = Field(..., min_length=1)
    periods: int = Field(..., ge=1, le=365)
    freq: str = Field(default="D", description="Pandas freq: D=day, W=week, MS=month start, YS=year start")


class ForecastPoint(BaseModel):
    ds: str
    y: float


class ForecastResponse(BaseModel):
    history: list[ForecastPoint]
    forecast: list[ForecastPoint]
    upper_bound: list[float]
    lower_bound: list[float]


def _parse_ds(s: str) -> str:
    """Normalize to YYYY-MM-DD."""
    s = s.strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        return s
    try:
        dt = pd.to_datetime(s)
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return s


def _next_date_by_freq(last_ds: pd.Timestamp, i: int, freq: str) -> str:
    """Increment last_ds by i periods using pandas freq."""
    try:
        next_ts = last_ds + pd.DateOffset(**{_freq_to_offset_key(freq): i})
    except Exception:
        next_ts = last_ds + timedelta(days=i)
    return next_ts.strftime("%Y-%m-%d")


def _freq_to_offset_key(freq: str) -> str:
    m = {"D": "days", "W": "weeks", "MS": "months", "YS": "years"}
    return m.get(freq.upper(), "days")


def _moving_average_fallback(series: list[dict[str, Any]], periods: int, freq: str = "D") -> dict[str, Any]:
    """When len(series) < 14, extrapolate using trailing moving average. Return history + forecast + bounds."""
    df = pd.DataFrame(series)
    df["ds"] = df["ds"].astype(str).map(_parse_ds)
    df = df.sort_values("ds").drop_duplicates(subset=["ds"]).reset_index(drop=True)
    if len(df) < 2:
        raise ValueError("Need at least 2 points for moving average")
    window = min(7, len(df))
    last = df["y"].rolling(window=window, min_periods=1).mean().iloc[-1]
    std = df["y"].rolling(window=window, min_periods=1).std().iloc[-1]
    std = std if pd.notna(std) and std > 0 else last * 0.1
    history = [{"ds": row["ds"], "y": float(row["y"])} for _, row in df.iterrows()]
    last_ds = pd.to_datetime(df["ds"].iloc[-1])
    forecast = []
    upper = []
    lower = []
    for i in range(1, periods + 1):
        next_d = _next_date_by_freq(last_ds, i, freq)
        forecast.append({"ds": next_d, "y": round(last, 2)})
        upper.append(round(last + 1.96 * std, 2))
        lower.append(round(max(0, last - 1.96 * std), 2))
    return {
        "history": history,
        "forecast": forecast,
        "upper_bound": upper,
        "lower_bound": lower,
    }


def _remove_outliers_iqr(df: pd.DataFrame, column: str = "y", factor: float = 1.5) -> pd.DataFrame:
    """Remove rows where y is outside IQR * factor. Returns copy."""
    q1 = df[column].quantile(0.25)
    q3 = df[column].quantile(0.75)
    iqr = q3 - q1
    if iqr <= 0:
        return df
    low = q1 - factor * iqr
    high = q3 + factor * iqr
    return df[(df[column] >= low) & (df[column] <= high)].copy()


@app.post("/forecast", response_model=ForecastResponse)
def forecast(req: ForecastRequest) -> ForecastResponse:
    series = [{"ds": p.ds, "y": p.y} for p in req.series]
    periods = req.periods
    freq = (req.freq or "D").strip().upper() or "D"
    if freq not in ("D", "W", "MS", "YS"):
        freq = "D"

    df = pd.DataFrame(series)
    df["ds"] = df["ds"].astype(str).map(_parse_ds)
    df = df.drop_duplicates(subset=["ds"]).sort_values("ds").reset_index(drop=True)
    if len(df) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 distinct (date, value) points")

    # Small data: moving average fallback
    if len(df) < 14:
        out = _moving_average_fallback(df.to_dict("records"), periods, freq)
        return ForecastResponse(
            history=[ForecastPoint(ds=p["ds"], y=p["y"]) for p in out["history"]],
            forecast=[ForecastPoint(ds=p["ds"], y=p["y"]) for p in out["forecast"]],
            upper_bound=out["upper_bound"],
            lower_bound=out["lower_bound"],
        )

    # Optional: remove outliers before Prophet
    df = _remove_outliers_iqr(df)
    if len(df) < 2:
        raise HTTPException(status_code=400, detail="Too few points after outlier removal")

    df["ds"] = pd.to_datetime(df["ds"])

    try:
        from prophet import Prophet
    except ImportError:
        out = _moving_average_fallback(df.to_dict("records"), periods, freq)
        return ForecastResponse(
            history=[ForecastPoint(ds=p["ds"], y=p["y"]) for p in out["history"]],
            forecast=[ForecastPoint(ds=p["ds"], y=p["y"]) for p in out["forecast"]],
            upper_bound=out["upper_bound"],
            lower_bound=out["lower_bound"],
        )

    # Prophet: disable yearly seasonality if few points
    kwargs = {}
    if len(df) < 60:
        kwargs["yearly_seasonality"] = False

    model = Prophet(interval_width=0.95, **kwargs)
    model.fit(df)

    # Build future dates ourselves so freq is respected (Prophet's make_future_dataframe can default to daily)
    last = pd.Timestamp(df["ds"].max())
    try:
        future_dates = pd.date_range(start=last, periods=periods, freq=freq)
    except Exception:
        future_dates = pd.date_range(start=last, periods=periods, freq="D")
    # If first date equals last (e.g. last is already a period start), drop it and take next `periods`
    if len(future_dates) > 0 and future_dates[0] <= last:
        future_dates = pd.date_range(start=future_dates[1], periods=periods, freq=freq)
    future = pd.DataFrame({"ds": future_dates})
    pred = model.predict(future)

    pred_future = pred
    history = [ForecastPoint(ds=row["ds"].strftime("%Y-%m-%d"), y=round(float(row["y"]), 2)) for _, row in df.iterrows()]
    forecast_points = [
        ForecastPoint(ds=row["ds"].strftime("%Y-%m-%d"), y=round(float(row["yhat"]), 2))
        for _, row in pred_future.iterrows()
    ]
    upper = [round(float(row["yhat_upper"]), 2) for _, row in pred_future.iterrows()]
    lower = [round(float(row["yhat_lower"]), 2) for _, row in pred_future.iterrows()]

    return ForecastResponse(history=history, forecast=forecast_points, upper_bound=upper, lower_bound=lower)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
