from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import root_router
from app.core.database import AsyncSessionLocal
from app.core.redis import get_redis_client
from app.services import fleet_ws_service, protocol_ingest_service
from app.services.gps_feed_service import sync_all_gps_feed_configs
from app.tasks import shutdown_scheduler, start_scheduler

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: database and Redis clients are created lazily.
    scheduler = start_scheduler()
    app.state.scheduler = scheduler
    try:
        async with AsyncSessionLocal() as db:
            await sync_all_gps_feed_configs(db, get_redis_client())
    except Exception as exc:  # noqa: BLE001
        logger.warning("GPS feed startup sync skipped: %s", exc)
    protocol_ingest_service.start()
    yield
    # Shutdown: stop the fleet WebSocket fan-out task if it is running.
    await fleet_ws_service.stop()
    await protocol_ingest_service.stop()
    shutdown_scheduler()


app = FastAPI(title="Fleet Dashboard API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://172.17.104.142:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(root_router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
