"""User performance tracking API."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.core.auth import CanReadPerformance
from app.core.database import get_app_database

router = APIRouter()

PERIODS = {"week", "month", "year", "total"}


class PerformanceRow(BaseModel):
    user_id: str
    display_name: str
    username: str
    role: str
    completed: int
    in_progress: int
    pending: int
    assigned_total: int
    actions: int
    completion_rate: float
    tickets_handled: int = 0
    tickets_fixed: int = 0
    tickets_converted: int = 0
    period: str = "total"


@router.get("/summary", response_model=list[PerformanceRow])
def performance_summary(
    user: CanReadPerformance,
    period: str = Query(default="total", description="week|month|year|total"),
) -> list[PerformanceRow]:
    _ = user
    if period not in PERIODS:
        raise HTTPException(status_code=400, detail="فترة غير صالحة")
    rows = get_app_database().performance_summary(period=period)
    return [PerformanceRow(**r) for r in rows]


@router.get("/tickets-overview")
def tickets_overview(user: CanReadPerformance) -> dict[str, int]:
    _ = user
    return get_app_database().ticket_status_counts()


@router.get("/me")
def my_performance(
    user: CanReadPerformance,
    period: str = Query(default="total"),
) -> dict[str, Any]:
    if period not in PERIODS:
        raise HTTPException(status_code=400, detail="فترة غير صالحة")
    rows = get_app_database().performance_summary(period=period)
    mine = next((r for r in rows if r["user_id"] == user.id), None)
    if not mine:
        return {
            "user_id": user.id,
            "display_name": user.display_name,
            "completed": 0,
            "in_progress": 0,
            "pending": 0,
            "assigned_total": 0,
            "actions": 0,
            "completion_rate": 0.0,
            "tickets_handled": 0,
            "tickets_fixed": 0,
            "tickets_converted": 0,
            "period": period,
        }
    return mine
