from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.place import Place
from app.models.review import Review
from app.models.user import User
from app.schemas.review import ReviewCreate, ReviewUpdate, ReviewResponse
from app.services.auth import get_current_user
from app.services.cache import cache_delete

router = APIRouter(prefix="/reviews", tags=["reviews"])


@router.get("/place/{place_id}", response_model=list[ReviewResponse])
async def list_place_reviews(
    place_id: int,
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, le=50),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Review)
        .where(Review.place_id == place_id)
        .options(selectinload(Review.user), selectinload(Review.pet), selectinload(Review.photos))
        .order_by(Review.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    return result.scalars().all()


@router.post("", response_model=ReviewResponse, status_code=status.HTTP_201_CREATED)
async def create_review(
    data: ReviewCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    place_result = await db.execute(select(Place).where(Place.id == data.place_id))
    place = place_result.scalar_one_or_none()
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")

    review = Review(**data.model_dump(), user_id=current_user.id)
    db.add(review)
    await db.flush()

    new_count = place.review_count + 1
    new_rating = ((place.rating * place.review_count) + data.rating) / new_count
    place.review_count = new_count
    place.rating = round(new_rating, 2)

    await cache_delete(f"place:{data.place_id}:*")
    await db.refresh(review, ["user", "pet", "photos"])
    return review


@router.patch("/{review_id}", response_model=ReviewResponse)
async def update_review(
    review_id: int,
    data: ReviewUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Review)
        .where(Review.id == review_id, Review.user_id == current_user.id)
        .options(selectinload(Review.user), selectinload(Review.pet), selectinload(Review.photos))
    )
    review = result.scalar_one_or_none()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(review, field, value)
    return review


@router.delete("/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_review(
    review_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Review).where(Review.id == review_id, Review.user_id == current_user.id)
    )
    review = result.scalar_one_or_none()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    await db.delete(review)
