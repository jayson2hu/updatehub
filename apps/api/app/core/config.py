from functools import lru_cache
from pathlib import Path, PurePosixPath, PureWindowsPath
from urllib.parse import urlsplit

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError


def validate_https_address(value: str, label: str, *, prefix: bool = False):
    """Validate configuration without echoing potentially secret input in errors."""
    try:
        if any(char.isspace() or ord(char) < 32 for char in value) or "\\" in value:
            raise ValueError()
        parsed = urlsplit(value)
        _ = parsed.port
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or "?" in value or "#" in value or "*" in value:
            raise ValueError()
        if prefix:
            if not parsed.path.endswith("/") or parsed.path == "/" or not parsed.path:
                raise ValueError()
        elif parsed.path not in {"", "/"}:
            raise ValueError()
    except ValueError as exc:
        requirement = "an exact HTTPS app-specific path ending in /" if prefix else "an HTTPS origin without credentials, query, fragment or page path"
        raise ValueError(f"{label} requires {requirement}") from exc


def is_sqlite_file(url: str) -> bool:
    """Production SQLite must be a persistent absolute file, never in-memory or cwd-relative."""
    try:
        parsed = make_url(url)
    except ArgumentError:
        return False
    database = parsed.database or ""
    return parsed.get_backend_name() == "sqlite" and database != ":memory:" and not database.startswith("file:") and (PurePosixPath(database).is_absolute() or PureWindowsPath(database).is_absolute())


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", hide_input_in_errors=True)

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
    station_signing_key: str = ""
    legacy_enabled: bool = False
    miniapp_referer_prefixes: str = ""

    @property
    def production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def allowed_origins(self) -> list[str]:
        return list(dict.fromkeys([self.public_site_url.rstrip("/")] + [v.strip().rstrip("/") for v in self.cors_origins.split(",") if v.strip()]))

    @model_validator(mode="after")
    def validate_production(self):
        if self.production and ("database_url" not in self.model_fields_set or not (self.database_url.startswith("postgresql") or is_sqlite_file(self.database_url))):
            raise ValueError("Production requires an explicit DATABASE_URL: an absolute SQLite file path or PostgreSQL")
        if self.production:
            validate_https_address(self.public_site_url, "PUBLIC_SITE_URL")
            for origin in self.cors_origins.split(","):
                if origin.strip():
                    validate_https_address(origin.strip(), "CORS_ORIGINS")
        for prefix in self.miniapp_referer_prefixes.split(","):
            if prefix.strip():
                validate_https_address(prefix.strip(), "MINIAPP_REFERER_PREFIXES", prefix=True)
        if self.production and len(self.station_signing_key) < 32:
            raise ValueError("STATION_SIGNING_KEY must contain at least 32 random characters in production")
        if not 1 <= self.session_ttl_hours <= 168:
            raise ValueError("SESSION_TTL_HOURS must be between 1 and 168")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
