from pydantic import BaseModel, Field, field_validator
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


class PetPolicyPatchRequest(BaseModel):
    """Admin direct-edit body for /admin/places/{place_id}/policy.

    Partial update — only actually-supplied fields are written (the
    router keys off model_dump(exclude_unset=True)). Fields mirror the
    admin_correction_requests._ALLOWED_POLICY_FIELDS whitelist exactly;
    admin_places.py asserts the two sets stay aligned so a schema
    change here fails loudly if the whitelist isn't updated too.

    verification_status is deliberately absent — the trust engine owns
    that column and re-computes it downstream of every policy write.
    extra="forbid" turns any unknown / verboten field into a 422 before
    the handler runs.
    """
    pet_allowed_status: PetAllowedStatus | None = None
    indoor_allowed: bool | None = None
    outdoor_allowed: bool | None = None
    dog_allowed: bool | None = None
    cat_allowed: bool | None = None
    max_weight_kg: float | None = None
    leash_required: bool | None = None
    carrier_required: bool | None = None
    vaccination_required: bool | None = None
    notes: str | None = None
    policy_source: PolicySource | None = None
    confidence_score: float | None = None

    model_config = {"extra": "forbid"}


class PlaceAdminPatchRequest(BaseModel):
    """Admin direct-edit body for /admin/places/{place_id}.

    Partial update — only supplied fields are written (the router keys off
    model_dump(exclude_unset=True)). extra="forbid" auto-rejects any field
    outside this whitelist (name / phone / visibility_status) so an admin
    can't accidentally slip a category, coordinates, or is_active edit
    through this endpoint.

    - name: DB is NOT NULL. Explicit null and blank strings are rejected;
      to leave the name unchanged, omit the field entirely.
    - phone: nullable. Explicit null clears the number.
    - visibility_status: enum only. Explicit null is rejected; omit to
      leave the status unchanged.
    """
    name: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=20)
    visibility_status: VisibilityStatus | None = None

    model_config = {"extra": "forbid"}

    @field_validator("name")
    @classmethod
    def _reject_blank_or_null_name(cls, v: str | None) -> str | None:
        # pydantic v2 does not call validators for a field's default value,
        # so a caller who omits `name` never lands here. This branch fires
        # only when the client sends `"name": null` or a blank string.
        if v is None:
            raise ValueError("name cannot be null; omit the field to skip")
        s = v.strip()
        if not s:
            raise ValueError("name must not be blank")
        return s

    @field_validator("visibility_status")
    @classmethod
    def _reject_null_visibility(
        cls, v: VisibilityStatus | None
    ) -> VisibilityStatus | None:
        if v is None:
            raise ValueError(
                "visibility_status cannot be null; omit the field to skip"
            )
        return v


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
