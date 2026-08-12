import asyncio
import json
from typing import Any

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from redis.asyncio import Redis

from app.api.deps import get_redis
from app.schemas.fleet import FleetPositionOut
from app.services import fleet_ws_service

router = APIRouter(prefix="/ws")

HEARTBEAT_INTERVAL_SECONDS = 15.0


@router.websocket("/fleet/positions")
async def websocket_fleet_positions(
    websocket: WebSocket,
    redis: Redis = Depends(get_redis),
) -> None:
    await websocket.accept()
    await fleet_ws_service.register_connection(websocket, redis)

    try:
        # Send the current fleet snapshot from Redis.
        raw_items = await redis.hgetall("fleet:latest")
        snapshot: list[dict[str, Any]] = []
        for value in raw_items.values():
            try:
                data = json.loads(value)
                snapshot.append(FleetPositionOut(**data).model_dump(mode="json"))
            except Exception:  # noqa: BLE001
                continue
        await websocket.send_json({"type": "snapshot", "data": snapshot})

        # Keep the connection alive with a heartbeat and wait for client messages.
        while True:
            try:
                await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=HEARTBEAT_INTERVAL_SECONDS,
                )
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "heartbeat"})
    except WebSocketDisconnect:
        pass
    finally:
        await fleet_ws_service.unregister_connection(websocket)
