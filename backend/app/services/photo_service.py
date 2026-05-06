import re
import logging
import httpx
from sqlalchemy import update

logger = logging.getLogger(__name__)

_OG_IMAGE_RE = re.compile(
    r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']'
    r'|<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
    re.IGNORECASE,
)


async def fetch_kakao_place_thumbnail(kakao_id: str) -> str | None:
    """
    Kakao 장소 페이지에서 OG 이미지 URL을 가져옵니다.
    실패 시 None 반환 (호출부에서 무시).
    """
    url = f"https://place.map.kakao.com/{kakao_id}"
    try:
        async with httpx.AsyncClient(timeout=6.0, follow_redirects=True) as client:
            resp = await client.get(
                url,
                headers={"User-Agent": "facebookexternalhit/1.1"},
            )
        if resp.status_code != 200:
            return None
        match = _OG_IMAGE_RE.search(resp.text)
        if not match:
            return None
        img_url = match.group(1) or match.group(2)
        # Kakao CDN 이미지만 신뢰
        if img_url and ("kakaocdn" in img_url or "kakao.co" in img_url):
            return img_url
    except Exception as e:
        logger.debug("Kakao thumbnail fetch failed for %s: %s", kakao_id, e)
    return None


async def cache_place_thumbnail(place_id: int, kakao_id: str) -> None:
    """
    Background task: thumbnail_url을 DB에 저장합니다.
    자체 세션을 열고 닫습니다 (요청 컨텍스트 외부에서 실행).
    """
    from app.database import AsyncSessionLocal
    from app.models.place import Place

    url = await fetch_kakao_place_thumbnail(kakao_id)
    if not url:
        return
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(
                update(Place).where(Place.id == place_id).values(thumbnail_url=url)
            )
            await db.commit()
        logger.info("Cached thumbnail for place %s: %s", place_id, url)
    except Exception as e:
        logger.warning("Failed to cache thumbnail for place %s: %s", place_id, e)
