import json
import redis.asyncio as aioredis
from typing import Any
from app.config import get_settings

settings = get_settings()
_redis: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = await aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis


async def cache_get(key: str) -> Any | None:
    r = await get_redis()
    value = await r.get(key)
    if value:
        return json.loads(value)
    return None


async def cache_set(key: str, value: Any, ttl: int | None = None) -> None:
    r = await get_redis()
    await r.set(key, json.dumps(value, default=str), ex=ttl or settings.cache_ttl)


async def cache_delete(key: str) -> None:
    r = await get_redis()
    await r.delete(key)


async def cache_delete_pattern(pattern: str) -> None:
    r = await get_redis()
    keys = await r.keys(pattern)
    if keys:
        await r.delete(*keys)


def place_cache_key(place_id: int, lang: str = "ko") -> str:
    return f"place:{place_id}:{lang}"


def places_nearby_cache_key(lat: float, lng: float, radius: float, category: str, lang: str) -> str:
    return f"places:nearby:{lat:.4f}:{lng:.4f}:{radius}:{category}:{lang}"
