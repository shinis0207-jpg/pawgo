from pydantic import BaseModel
from datetime import datetime
from app.models.place import PlaceCategory, VisibilityStatus
from app.models.pet_policy import PetAllowedStatus, VerificationStatus, PolicySource


class PlacePhotoResponse(BaseModel):
    id: int
    url: str
    caption: str | None
    is_primary: bool

    model_config = {"from_attributes": True}


class PetPolicyResponse(BaseModel):
    pet_allowed_status: PetAllowedStatus
    verification_status: VerificationStatus
    indoor_allowed: bool | None = None
    outdoor_allowed: bool | None = None
    dog_allowed: bool | None = None
    cat_allowed: bool | None = None
    max_weight_kg: float | None = None
    leash_required: bool | None = None
    carrier_required: bool | None = None
    vaccination_required: bool | None = None
    notes: str | None = None
    policy_source: PolicySource
    confidence_score: float
    last_verified_at: datetime | None = None

    model_config = {"from_attributes": True}


class PlaceCreate(BaseModel):
    name: str
    category: PlaceCategory
    latitude: float
    longitude: float
    address: str
    road_address: str | None = None
    address_detail: str | None = None
    city: str | None = None
    province: str | None = None
    phone: str | None = None
    website: str | None = None
    hours: dict | None = None
    has_parking: bool = False
    entrance_fee: str | None = None
    description: str | None = None
    kakao_place_id: str | None = None
    naver_place_id: str | None = None
    official_mfds_id: str | None = None


class PlaceUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    website: str | None = None
    hours: dict | None = None
    has_parking: bool | None = None
    entrance_fee: str | None = None
    description: str | None = None
    visibility_status: VisibilityStatus | None = None


class PlaceFilter(BaseModel):
    category: PlaceCategory | None = None
    has_parking: bool | None = None
    radius_km: float = 5.0
    lang: str = "ko"
    q: str | None = None


class PlaceResponse(BaseModel):
    id: int
    name: str
    category: PlaceCategory
    latitude: float
    longitude: float
    address: str
    road_address: str | None = None
    city: str | None
    phone: str | None
    website: str | None
    hours: dict | None
    has_parking: bool
    entrance_fee: str | None
    description: str | None
    thumbnail_url: str | None
    # NOTE: rating/review_count are kept on places until place_ratings is populated.
    # See report sync TODO (Phase 2/3 consolidation).
    rating: float
    review_count: int
    visibility_status: VisibilityStatus
    photos: list[PlacePhotoResponse]
    pet_policy: PetPolicyResponse | None = None
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
