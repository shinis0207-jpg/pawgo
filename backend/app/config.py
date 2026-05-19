from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    app_name: str = "PawGo API"
    debug: bool = False
    version: str = "1.0.0"

    # Database
    # Railway injects DATABASE_URL as postgresql:// — we convert to asyncpg scheme
    database_url: str = "postgresql+asyncpg://pawgo:pawgo@localhost:5432/pawgo"
    database_url_sync: str = "postgresql://pawgo:pawgo@localhost:5432/pawgo"

    # Redis (optional — cache is skipped when unavailable)
    redis_url: str = ""
    cache_ttl: int = 300

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
    cors_origins: list[str] = ["*"]

    # Admin role assignment.
    # Comma-separated emails in .env (e.g. ADMIN_EMAILS=a@x.com,b@y.com).
    # Empty string -> empty list (service stays healthy with no admins).
    admin_emails: str = ""

    @property
    def admin_emails_list(self) -> list[str]:
        return [e.strip().lower() for e in self.admin_emails.split(",") if e.strip()]

    def model_post_init(self, __context: object) -> None:
        # Railway provides postgresql:// — convert to asyncpg scheme
        if self.database_url.startswith("postgresql://"):
            object.__setattr__(
                self,
                "database_url",
                self.database_url.replace("postgresql://", "postgresql+asyncpg://", 1),
            )
        # Ensure sync URL uses plain postgresql://
        if self.database_url_sync.startswith("postgresql+asyncpg://"):
            object.__setattr__(
                self,
                "database_url_sync",
                self.database_url_sync.replace("postgresql+asyncpg://", "postgresql://", 1),
            )

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()
