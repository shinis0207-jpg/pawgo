import anthropic
from app.config import get_settings

settings = get_settings()

_client: anthropic.AsyncAnthropic | None = None


def get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _client


SYSTEM_PROMPT = """당신은 PawGo의 반려동물 여행 전문 AI 어시스턴트입니다.
반려동물 동반 여행, 펫 친화 장소, 반려동물 건강 관리에 대한 전문적인 조언을 제공합니다.
항상 친절하고 간결하게 답변하며, 안전과 동물 복지를 최우선으로 생각합니다.
응답 언어: 사용자가 사용하는 언어로 답변하세요."""


async def get_ai_recommendation(
    user_message: str,
    pet_info: dict | None = None,
    location: dict | None = None,
    language: str = "ko",
    conversation_history: list | None = None,
) -> str:
    client = get_client()

    context_parts = []
    if pet_info:
        context_parts.append(
            f"반려동물 정보: {pet_info.get('name')} ({pet_info.get('type')}, "
            f"{pet_info.get('breed', '')}, {pet_info.get('weight_kg', '')}kg)"
        )
    if location:
        context_parts.append(f"현재 위치: 위도 {location.get('lat')}, 경도 {location.get('lng')}")

    messages = conversation_history or []
    if context_parts:
        system = SYSTEM_PROMPT + "\n\n현재 컨텍스트:\n" + "\n".join(context_parts)
    else:
        system = SYSTEM_PROMPT

    messages.append({"role": "user", "content": user_message})

    response = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=system,
        messages=messages,
    )
    return response.content[0].text


async def translate_place_info(
    name: str,
    description: str,
    address: str,
    target_language: str,
) -> dict:
    client = get_client()

    prompt = f"""다음 한국어 장소 정보를 {target_language} 언어로 번역해주세요.
JSON 형식으로만 응답하세요.

장소명: {name}
설명: {description}
주소: {address}

응답 형식:
{{"name": "...", "description": "...", "address": "..."}}"""

    response = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )

    import json
    try:
        return json.loads(response.content[0].text)
    except Exception:
        return {"name": name, "description": description, "address": address}


async def get_travel_tips(
    destination: str,
    pet_type: str,
    pet_weight: float | None,
    language: str = "ko",
) -> str:
    client = get_client()

    prompt = f"""{destination}에서 {pet_type} ({pet_weight}kg)와 함께하는 여행 팁을 알려주세요.
- 주의사항, 추천 장소 유형, 준비물을 포함해주세요.
- 간결하게 3-5개 항목으로 답변해주세요."""

    response = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text
