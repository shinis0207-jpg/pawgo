from pydantic import BaseModel, Field
from datetime import datetime, date


class ReviewCreate(BaseModel):
    place_id: int
    pet_visit_verified: bool = False
    pet_allowed_actual: bool | None = None
    indoor_actual: bool | None = None
    outdoor_actual: bool | None = None
    pet_friendliness_score: float | None = Field(default=None, ge=0.0, le=5.0)
    taste_score: float | None = Field(default=None, ge=0.0, le=5.0)
    ambience_score: float | None = Field(default=None, ge=0.0, le=5.0)
    cleanliness_score: float | None = Field(default=None, ge=0.0, le=5.0)
    staff_friendliness_score: float | None = Field(default=None, ge=0.0, le=5.0)
    revisit_intent_score: float | None = Field(default=None, ge=0.0, le=5.0)
    comment: str | None = None
    visit_date: date | None = None


class ReviewUpdate(BaseModel):
    pet_visit_verified: bool | None = None
    pet_allowed_actual: bool | None = None
    indoor_actual: bool | None = None
    outdoor_actual: bool | None = None
    pet_friendliness_score: float | None = Field(default=None, ge=0.0, le=5.0)
    taste_score: float | None = Field(default=None, ge=0.0, le=5.0)
    ambience_score: float | None = Field(default=None, ge=0.0, le=5.0)
    cleanliness_score: float | None = Field(default=None, ge=0.0, le=5.0)
    staff_friendliness_score: float | None = Field(default=None, ge=0.0, le=5.0)
    revisit_intent_score: float | None = Field(default=None, ge=0.0, le=5.0)
    comment: str | None = None
    visit_date: date | None = None


class ReviewResponse(BaseModel):
    id: int
    place_id: int
    user_id: int | None
    pet_visit_verified: bool
    pet_allowed_actual: bool | None
    indoor_actual: bool | None
    outdoor_actual: bool | None
    pet_friendliness_score: float | None
    taste_score: float | None
    ambience_score: float | None
    cleanliness_score: float | None
    staff_friendliness_score: float | None
    revisit_intent_score: float | None
    comment: str | None
    visit_date: date | None
    created_at: datetime

    model_config = {"from_attributes": True}
