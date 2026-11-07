from typing import Literal, Optional

from pydantic import BaseModel, Field


class CheckinRequest(BaseModel):
    astronaut_id: str
    resting_heart_rate_bpm: float = Field(ge=20, le=220)
    temperature_c: float = Field(ge=30, le=43)
    sleep_hours: float = Field(ge=0, le=24)
    stress_score: float = Field(ge=0, le=10)
    mood_score: float = Field(ge=1, le=5)
    fatigue_score: float = Field(ge=0, le=10)
    pain_score: float = Field(ge=0, le=10)
    concerning_symptom: bool = False
    symptom_note: str = Field(default="", max_length=500)
    countermeasure_completed: bool = False
    captured_at: str


class ObservationIn(BaseModel):
    metric: str
    value: float
    unit: Optional[str] = None
    measured_at: str
    source: Literal["manual", "simulated_wearable"] = "manual"
    notes: Optional[str] = Field(default=None, max_length=300)
    session_id: Optional[str] = Field(default=None, max_length=64)


class ObservationsIn(BaseModel):
    items: list[ObservationIn] = Field(min_length=1, max_length=20)
