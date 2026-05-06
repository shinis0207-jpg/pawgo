from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.models.user import User
from app.services.auth import get_current_user
from app.services.ai import get_ai_recommendation, get_travel_tips

router = APIRouter(prefix="/ai", tags=["ai"])


class ChatMessage(BaseModel):
    message: str
    pet_info: dict | None = None
    location: dict | None = None
    conversation_history: list | None = None


class TravelTipsRequest(BaseModel):
    destination: str
    pet_type: str
    pet_weight: float | None = None


@router.post("/chat")
async def chat(
    data: ChatMessage,
    current_user: User = Depends(get_current_user),
):
    response = await get_ai_recommendation(
        user_message=data.message,
        pet_info=data.pet_info,
        location=data.location,
        language=current_user.language.value,
        conversation_history=data.conversation_history,
    )
    return {"response": response}


@router.post("/travel-tips")
async def travel_tips(
    data: TravelTipsRequest,
    current_user: User = Depends(get_current_user),
):
    tips = await get_travel_tips(
        destination=data.destination,
        pet_type=data.pet_type,
        pet_weight=data.pet_weight,
        language=current_user.language.value,
    )
    return {"tips": tips}
