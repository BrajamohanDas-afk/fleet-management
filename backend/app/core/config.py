from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://fleet_user:fleet_pass@db:5432/fleet_db"
    TEST_DATABASE_URL: str | None = None
    REDIS_URL: str = "redis://redis:6379/0"
    SECRET_KEY: str = "dev-secret-change-me"
    ENV: str = "dev"
    MEDIAMTX_HOST: str = "mediamtx"
    # Docker-internal hostname is not resolvable by a browser.  Keep this
    # separate from MEDIAMTX_HOST, which is used for server-to-server calls.
    MEDIAMTX_PUBLIC_HOST: str = "localhost"
    MEDIAMTX_RTSP_PORT: int = 8554
    # WHEP/WebRTC is served on the MediaMTX HTTP port.
    MEDIAMTX_HTTP_PORT: int = 8890
    # MediaMTX control API port (v3/paths/list etc.).
    MEDIAMTX_API_PORT: int = 8889
    DEV_DEVICE_KEY: str = "dev-device-key"
    PUBLIC_SHARE_BASE_URL: str = "http://localhost:5173"


settings = Settings()
