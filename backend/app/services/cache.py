import json
import logging
import redis.asyncio as aioredis
from typing import Any
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()
_redis: aioredis.Redis | None = None
_redis_unavailable = False


async def get_redis() -> aioredis.Redis | None:
    global _redis, _redis_unavailable
    if _redis_unavailable or not settings.redis_url:
        return None
    if _redis is None:
        try:
            client = await aioredis.from_url(settings.redis_url, decode_responses=True)
            await client.ping()
            _redis = client
        except Exception as e:
            logger.warning(f"Redis unavailable, caching disabled: {e}")
            _redis_unavailable = True
            return None
    return _redis


async def cache_get(key: str) -> Any | None:
    r = await get_redis()
    if r is None:
        return None
    try:
        value = await r.get(key)
        return json.loads(value) if value else None
    except Exception:
        return None


async def cache_set(key: str, value: Any, ttl: int | None = None) -> None:
    r = await get_redis()
    if r is None:
        return
    try:
        await r.set(key, json.dumps(value, default=str), ex=ttl or settings.cache_ttl)
    except Exception:
        pass


async def cache_delete(key: str) -> None:
    r = await get_redis()
    if r is None:
        return
    try:
        await r.delete(key)
    except Exception:
        pass


async def cache_delete_pattern(pattern: str) -> None:
    r = await get_redis()
    if r is None:
        return
    try:
        keys = await r.keys(pattern)
        if keys:
            await r.delete(*keys)
    except Exception:
        pass


def place_cache_key(place_id: int, lang: str = "ko") -> str:
    return f"place:{place_id}:{lang}"


def places_nearby_cache_key(
    lat: float, lng: float, radius: float, category: str, lang: str, q: str | None = None
) -> str:
    q_part = (q or "").strip().lower()
    return f"places:nearby:{lat:.4f}:{lng:.4f}:{radius}:{category}:{lang}:{q_part}"
