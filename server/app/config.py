"""Configuration management for FocusTube backend.
Reads configuration from environment variables with sensible defaults.
"""

import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    MONGO_URL: str = "mongodb://mongo:27017/FocusTube"
    SECRET_JWT: str = "FocusTube_super_secret_jwt_key_2026_dev_secure"
    GEMINI_MODEL: str = "gemini-2.5-flash"
    JWT_EXPIRATION_SECONDS: int = 86400  # 24 hours

    @property
    def gemini_api_key(self) -> str:
        """Dynamically read GEMINI_API_KEY from environment to support runtime changes."""
        return os.environ.get("GEMINI_API_KEY", "").strip()

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
