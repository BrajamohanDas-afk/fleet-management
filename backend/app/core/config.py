from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://fleet_user:fleet_pass@db:5432/fleet_db"
    REDIS_URL: str = "redis://redis:6379/0"
    SECRET_KEY: str = "dev-secret-change-me"
    ENV: str = "dev"
    MEDIAMTX_HOST: str = "mediamtx"
    MEDIAMTX_RTSP_PORT: int = 8554
    MEDIAMTX_HTTP_PORT: int = 8889
    DEV_DEVICE_KEY: str = "dev-device-key"


settings = Settings()
