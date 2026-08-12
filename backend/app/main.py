from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import root_router
from app.services import fleet_ws_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: database and Redis clients are created lazily.
    yield
    # Shutdown: stop the fleet WebSocket fan-out task if it is running.
    await fleet_ws_service.stop()


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
