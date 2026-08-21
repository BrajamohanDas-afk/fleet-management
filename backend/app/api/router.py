from fastapi import APIRouter

from app.api.endpoints import (
    auth,
    dev,
    devices,
    fleet,
    recordings,
    sharing,
    vehicles,
    ws_fleet,
)

api_router = APIRouter(prefix="/api")

api_router.include_router(auth.router)
api_router.include_router(vehicles.router)
api_router.include_router(fleet.router)
api_router.include_router(devices.router)
api_router.include_router(recordings.router)
api_router.include_router(dev.router)
api_router.include_router(sharing.router)

root_router = APIRouter()
root_router.include_router(api_router)
root_router.include_router(ws_fleet.router)
