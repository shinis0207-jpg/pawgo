from pydantic import BaseModel
from datetime import datetime

from app.schemas.place import PlaceResponse


class FavoriteCreate(BaseModel):
    place_id: int


class FavoriteResponse(BaseModel):
    """Hydrated favorite — the full place payload is embedded so the
    "saved places" list screen reuses PlaceCard without a second
    round-trip per row.
    """

    id: int
    place_id: int
    created_at: datetime
    place: PlaceResponse

    model_config = {"from_attributes": True}


class FavoriteListResponse(BaseModel):
    items: list[FavoriteResponse]
    total: int
    page: int
    page_size: int
