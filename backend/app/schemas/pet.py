from pydantic import BaseModel
from datetime import datetime, date


class VaccinationRecord(BaseModel):
    name: str
    date: str
    next_due: str | None = None
    vet_name: str | None = None


class PetCreate(BaseModel):
    name: str
    type: str
    breed: str | None = None
    weight_kg: float | None = None
    birth_date: date | None = None
    chip_id: str | None = None
    photo_url: str | None = None
    notes: str | None = None


class PetUpdate(BaseModel):
    name: str | None = None
    breed: str | None = None
    weight_kg: float | None = None
    birth_date: date | None = None
    chip_id: str | None = None
    photo_url: str | None = None
    vaccination_records: list[VaccinationRecord] | None = None
    notes: str | None = None


class PetResponse(BaseModel):
    id: int
    user_id: int
    name: str
    type: str
    breed: str | None
    weight_kg: float | None
    birth_date: date | None
    chip_id: str | None
    photo_url: str | None
    vaccination_records: list | None
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
