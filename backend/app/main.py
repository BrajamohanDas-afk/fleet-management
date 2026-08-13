from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import root_router
from app.services import fleet_ws_service, protocol_ingest_service
from app.tasks import shutdown_scheduler, start_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: database and Redis clients are created lazily.
    scheduler = start_scheduler()
    app.state.scheduler = scheduler
    protocol_ingest_service.start()
    yield
    # Shutdown: stop the fleet WebSocket fan-out task if it is running.
    await fleet_ws_service.stop()
    await protocol_ingest_service.stop()
    shutdown_scheduler()


app = FastAPI(title="Fleet Dashboard API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(root_router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
