from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://updatehub@postgres:5432/updatehub"
    environment: str = "development"
    public_site_url: str = "http://localhost:3000"
    cors_origins: str = "http://localhost:3000"
    site_name: str = "UpdateHub"
    site_description: str = "查看软件更新、使用提醒与维护通知，了解影响和下一步行动。"
    upload_dir: Path = Path("uploads")
    session_ttl_hours: int = 12
    admin_initial_email: str = ""
    admin_initial_password: str = ""

    @property
    def production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def allowed_origins(self) -> list[str]:
        return list(dict.fromkeys([self.public_site_url.rstrip("/")] + [v.strip().rstrip("/") for v in self.cors_origins.split(",") if v.strip()]))

    @model_validator(mode="after")
    def validate_production(self):
        if self.production and ("database_url" not in self.model_fields_set or not self.database_url.startswith("postgresql")):
            raise ValueError("Production requires an explicit PostgreSQL DATABASE_URL")
        if self.production and not self.public_site_url.startswith("https://"):
            raise ValueError("PUBLIC_SITE_URL must use HTTPS in production")
        if not 1 <= self.session_ttl_hours <= 168:
            raise ValueError("SESSION_TTL_HOURS must be between 1 and 168")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
