from pydantic import BaseModel, Field
from datetime import datetime


class ReviewCreate(BaseModel):
    place_id: int
    pet_id: int | None = None
    rating: float = Field(ge=1.0, le=5.0)
    content: str | None = None
    visit_date: str | None = None


class ReviewUpdate(BaseModel):
    rating: float | None = Field(default=None, ge=1.0, le=5.0)
    content: str | None = None


class ReviewPhotoResponse(BaseModel):
    id: int
    url: str

    model_config = {"from_attributes": True}


class ReviewUserResponse(BaseModel):
    id: int
    name: str
    profile_image_url: str | None

    model_config = {"from_attributes": True}


class ReviewPetResponse(BaseModel):
    id: int
    name: str
    type: str
    photo_url: str | None

    model_config = {"from_attributes": True}


class ReviewResponse(BaseModel):
    id: int
    place_id: int
    user: ReviewUserResponse
    pet: ReviewPetResponse | None
    rating: float
    content: str | None
    visit_date: str | None
    is_helpful_count: int
    photos: list[ReviewPhotoResponse]
    created_at: datetime

    model_config = {"from_attributes": True}
