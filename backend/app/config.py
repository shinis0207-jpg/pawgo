from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    app_name: str = "PawGo API"
    debug: bool = False
    version: str = "1.0.0"

    # Database
    database_url: str = "postgresql+asyncpg://pawgo:pawgo@localhost:5432/pawgo"
    database_url_sync: str = "postgresql://pawgo:pawgo@localhost:5432/pawgo"

    # Redis
    redis_url: str = "redis://localhost:6379"
    cache_ttl: int = 300  # 5 minutes

    # JWT
    secret_key: str = "change-this-secret-key-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    # OAuth
    kakao_client_id: str = ""
    kakao_client_secret: str = ""
    google_client_id: str = ""
    google_client_secret: str = ""
    apple_client_id: str = ""

    # Kakao Maps
    kakao_rest_api_key: str = ""

    # AWS S3
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "ap-northeast-2"
    s3_bucket_name: str = "pawgo-assets"

    # Anthropic
    anthropic_api_key: str = ""

    # CORS
    cors_origins: list[str] = ["http://localhost:8081", "exp://localhost:8081"]

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()
