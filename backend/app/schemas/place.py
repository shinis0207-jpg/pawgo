from pydantic import BaseModel
from datetime import datetime
from app.models.place import PlaceCategory


class PlacePhotoResponse(BaseModel):
    id: int
    url: str
    caption: str | None
    is_primary: bool

    model_config = {"from_attributes": True}


class PlaceCreate(BaseModel):
    name: str
    category: PlaceCategory
    latitude: float
    longitude: float
    address: str
    address_detail: str | None = None
    city: str | None = None
    province: str | None = None
    phone: str | None = None
    website: str | None = None
    hours: dict | None = None
    max_weight_kg: float | None = None
    allows_indoor: bool = False
    allows_outdoor: bool = True
    has_parking: bool = False
    entrance_fee: str | None = None
    description: str | None = None


class PlaceUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    website: str | None = None
    hours: dict | None = None
    max_weight_kg: float | None = None
    allows_indoor: bool | None = None
    allows_outdoor: bool | None = None
    has_parking: bool | None = None
    entrance_fee: str | None = None
    description: str | None = None


class PlaceFilter(BaseModel):
    category: PlaceCategory | None = None
    max_weight_kg: float | None = None
    allows_indoor: bool | None = None
    is_open_now: bool | None = None
    has_parking: bool | None = None
    radius_km: float = 5.0
    lang: str = "ko"


class PlaceResponse(BaseModel):
    id: int
    name: str
    category: PlaceCategory
    latitude: float
    longitude: float
    address: str
    city: str | None
    phone: str | None
    website: str | None
    hours: dict | None
    max_weight_kg: float | None
    allows_indoor: bool
    allows_outdoor: bool
    has_parking: bool
    entrance_fee: str | None
    description: str | None
    thumbnail_url: str | None
    rating: float
    review_count: int
    is_verified: bool
    photos: list[PlacePhotoResponse]
    distance_km: float | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PlaceListResponse(BaseModel):
    items: list[PlaceResponse]
    total: int
    page: int
    size: int


class VetHospitalResponse(BaseModel):
    id: int
    is_24h: bool
    emergency: bool
    night_hours: str | None
    specialties: list | None
    place: PlaceResponse

    model_config = {"from_attributes": True}
