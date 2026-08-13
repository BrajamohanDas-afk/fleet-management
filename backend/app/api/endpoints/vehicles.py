import asyncio
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Query, status
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_redis
from app.core.database import get_db
from app.models.device import Device, Protocol
from app.models.device_channel import DeviceChannel
from app.models.vehicle_latest import VehicleLatest
from app.repositories import device_repository, vehicle_repository
from app.schemas.vehicle import (
    CameraTestRequest,
    CameraTestResponse,
    CameraUpdatePayload,
    VehicleCreate,
    VehicleDeviceUpdate,
    VehicleOut,
    VehicleUpdate,
    VehicleWithLatest,
)
from app.services.rtsp_service import mask_rtsp_url
from app.services.status_service import VehicleStatus
from app.services.stream_command_service import publish_stream_command, publish_stop
from app.services.vehicle_service import (
    get_vehicle_with_latest,
    get_vehicles_with_latest,
)

router = APIRouter(prefix="/vehicles", tags=["vehicles"])


def _stream_path(vehicle_id: int, channel_no: int) -> str:
    return f"vehicles/{vehicle_id}/channel/{channel_no}"


def _protocol(value: str | None) -> Protocol:
    try:
        return Protocol(value or Protocol.other.value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Unsupported device protocol") from exc


async def _get_primary_device(db: AsyncSession, vehicle_id: int) -> Device | None:
    result = await db.execute(
        select(Device).where(Device.vehicle_id == vehicle_id).order_by(Device.id)
    )
    return result.scalars().first()


async def _ensure_serial_available(
    db: AsyncSession,
    device_serial: str,
    *,
    current_device_id: int | None = None,
) -> None:
    existing = await device_repository.get_by_serial(db, device_serial)
    if existing and existing.id != current_device_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Device serial already exists",
        )


async def _ensure_vehicle_latest(db: AsyncSession, vehicle_id: int, device_id: int) -> None:
    latest = await db.get(VehicleLatest, vehicle_id)
    if latest is None:
        db.add(
            VehicleLatest(
                vehicle_id=vehicle_id,
                device_id=device_id,
                status=VehicleStatus.offline,
            )
        )
        return
    if latest.device_id is None:
        latest.device_id = device_id


async def _sync_device_channels(
    db: AsyncSession,
    *,
    vehicle_id: int,
    device: Device,
    cameras: list,
) -> list[tuple[str, int, str | None]]:
    result = await db.execute(
        select(DeviceChannel)
        .where(DeviceChannel.device_id == device.id)
        .order_by(DeviceChannel.channel_no)
    )
    existing_channels = result.scalars().all()
    incoming_by_channel = {camera.channel_no: camera for camera in cameras}
    commands: list[tuple[str, int, str | None]] = []

    for channel in existing_channels:
        camera = incoming_by_channel.pop(channel.channel_no, None)
        if camera is None:
            commands.append(("stop", channel.channel_no, None))
            await db.delete(channel)
            continue

        label = getattr(camera, "label", None)
        rtsp_url = camera.rtsp_url
        url_changed = channel.rtsp_url != rtsp_url
        path_changed = channel.stream_path != _stream_path(vehicle_id, camera.channel_no)
        channel.label = label.strip() if label else channel.label
        channel.rtsp_url = rtsp_url
        channel.stream_path = _stream_path(vehicle_id, camera.channel_no)
        if url_changed or path_changed:
            commands.append(("restart", channel.channel_no, rtsp_url))

    for camera in incoming_by_channel.values():
        label = getattr(camera, "label", None) or f"Camera {camera.channel_no}"
        db.add(
            DeviceChannel(
                device_id=device.id,
                channel_no=camera.channel_no,
                label=label.strip(),
                rtsp_url=camera.rtsp_url,
                stream_path=_stream_path(vehicle_id, camera.channel_no),
            )
        )
        commands.append(("start", camera.channel_no, camera.rtsp_url))

    await db.flush()
    return commands


async def _publish_channel_commands(
    redis: Redis,
    *,
    vehicle_id: int,
    commands: list[tuple[str, int, str | None]],
) -> None:
    for action, channel_no, rtsp_url in commands:
        if action == "stop":
            await publish_stop(redis, vehicle_id, channel_no)
            continue
        await publish_stream_command(
            redis,
            action=action,
            vehicle_id=vehicle_id,
            channel_no=channel_no,
            rtsp_url=rtsp_url,
        )


async def _rtsp_tcp_reachability_error(rtsp_url: str) -> str | None:
    parsed = urlsplit(rtsp_url)
    host = parsed.hostname
    port = parsed.port or 554
    if host is None:
        return "Camera URL must include a host"

    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port), timeout=3.0
        )
        _ = reader
        writer.close()
        await writer.wait_closed()
    except (TimeoutError, asyncio.TimeoutError):
        return f"RTSP host {host}:{port} is not reachable from the API container"
    except OSError as exc:
        return f"RTSP host {host}:{port} is not reachable from the API container: {exc.strerror or exc}"
    return None


async def _upsert_vehicle_device(
    db: AsyncSession,
    *,
    vehicle_id: int,
    payload: VehicleDeviceUpdate,
) -> tuple[Device | None, list[tuple[str, int, str | None]]]:
    device = await _get_primary_device(db, vehicle_id)
    commands: list[tuple[str, int, str | None]] = []

    device_serial = payload.device_serial.strip() if payload.device_serial else None
    sim_number = payload.sim_number.strip() if payload.sim_number else None

    if device is None:
        if not device_serial and not payload.cameras:
            return None, commands
        if not device_serial or not sim_number:
            raise HTTPException(
                status_code=422,
                detail="Device serial and SIM number are required when adding cameras.",
            )
        await _ensure_serial_available(db, device_serial)
        device = Device(
            vehicle_id=vehicle_id,
            device_serial=device_serial,
            sim_number=sim_number,
            protocol=_protocol(payload.protocol),
        )
        db.add(device)
        await db.flush()
        await _ensure_vehicle_latest(db, vehicle_id, device.id)
    else:
        if device_serial:
            await _ensure_serial_available(db, device_serial, current_device_id=device.id)
            device.device_serial = device_serial
        if sim_number:
            device.sim_number = sim_number
        if payload.protocol:
            device.protocol = _protocol(payload.protocol)
        await _ensure_vehicle_latest(db, vehicle_id, device.id)

    if payload.cameras is not None:
        commands = await _sync_device_channels(
            db,
            vehicle_id=vehicle_id,
            device=device,
            cameras=payload.cameras,
        )

    return device, commands


async def _run_camera_test(rtsp_url: str) -> CameraTestResponse:
    reachability_error = await _rtsp_tcp_reachability_error(rtsp_url)
    if reachability_error:
        return CameraTestResponse(status="error", detail=reachability_error)

    try:
        proc = await asyncio.create_subprocess_exec(
            "ffprobe",
            "-v",
            "error",
            "-rtsp_transport",
            "tcp",
            "-timeout",
            "5000000",
            "-i",
            rtsp_url,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            _, stderr = await asyncio.wait_for(proc.communicate(), timeout=8.0)
            detail = stderr.decode(errors="replace").strip() or "Connection failed"
            detail = detail.replace(rtsp_url, mask_rtsp_url(rtsp_url))
            if proc.returncode == 0:
                return CameraTestResponse(status="ok")
            return CameraTestResponse(status="error", detail=detail)
        except (TimeoutError, asyncio.TimeoutError):
            proc.kill()
            return CameraTestResponse(status="error", detail="Connection timeout")
    except FileNotFoundError:
        return CameraTestResponse(status="error", detail="ffprobe not installed")
    except Exception:
        return CameraTestResponse(status="error", detail="Camera connection failed")


@router.get("", response_model=list[VehicleWithLatest])
async def list_vehicles(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    status: str | None = Query(None, description="Filter by vehicle status"),
    q: str | None = Query(None, description="Search registration_no or vehicle_code"),
    type: str | None = Query(None, description="Filter by vehicle_type"),
) -> list[VehicleWithLatest]:
    _ = current_user
    return await get_vehicles_with_latest(
        db, status=status, q=q, vehicle_type=type
    )


@router.post("", response_model=VehicleOut, status_code=status.HTTP_201_CREATED)
async def create_vehicle(
    payload: VehicleCreate,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    current_user: dict = Depends(get_current_user),
) -> VehicleOut:
    _ = current_user
    existing = await vehicle_repository.get_by_registration(db, payload.registration_no)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Vehicle with this registration number already exists",
        )

    vehicle_data = payload.model_dump(exclude={"device"})
    vehicle = await vehicle_repository.create(db, vehicle_data)
    commands: list[tuple[str, int, str | None]] = []

    if payload.device:
        await _ensure_serial_available(db, payload.device.device_serial)
        device = Device(
            vehicle_id=vehicle.id,
            device_serial=payload.device.device_serial.strip(),
            sim_number=payload.device.sim_number.strip(),
            protocol=_protocol(payload.device.protocol),
        )
        db.add(device)
        await db.flush()
        await _ensure_vehicle_latest(db, vehicle.id, device.id)
        commands = await _sync_device_channels(
            db,
            vehicle_id=vehicle.id,
            device=device,
            cameras=payload.device.cameras,
        )

    await db.commit()
    await _publish_channel_commands(redis, vehicle_id=vehicle.id, commands=commands)
    await db.refresh(vehicle)
    return VehicleOut.model_validate(vehicle)


@router.post("/cameras/test", response_model=CameraTestResponse)
async def test_camera(
    payload: CameraTestRequest,
    current_user: dict = Depends(get_current_user),
) -> CameraTestResponse:
    _ = current_user
    return await _run_camera_test(payload.rtsp_url)


@router.get("/{vehicle_id}", response_model=VehicleWithLatest)
async def get_vehicle(
    vehicle_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> VehicleWithLatest:
    _ = current_user
    vehicle = await get_vehicle_with_latest(db, vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return vehicle


@router.patch("/{vehicle_id}", response_model=VehicleOut)
async def update_vehicle(
    vehicle_id: int,
    payload: VehicleUpdate,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    current_user: dict = Depends(get_current_user),
) -> VehicleOut:
    _ = current_user
    vehicle = await vehicle_repository.get(db, vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    update_data = payload.model_dump(exclude_unset=True, exclude={"device"})
    if "registration_no" in update_data:
        existing = await vehicle_repository.get_by_registration(
            db, update_data["registration_no"]
        )
        if existing and existing.id != vehicle_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Registration number already in use",
            )

    commands: list[tuple[str, int, str | None]] = []
    if update_data:
        vehicle = await vehicle_repository.update(db, vehicle, update_data)

    if payload.device is not None:
        _, commands = await _upsert_vehicle_device(
            db,
            vehicle_id=vehicle_id,
            payload=payload.device,
        )

    await db.commit()
    await _publish_channel_commands(redis, vehicle_id=vehicle_id, commands=commands)
    await db.refresh(vehicle)
    return VehicleOut.model_validate(vehicle)


@router.delete("/{vehicle_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vehicle(
    vehicle_id: int,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    current_user: dict = Depends(get_current_user),
) -> None:
    _ = current_user
    vehicle = await vehicle_repository.get(db, vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    result = await db.execute(select(Device).where(Device.vehicle_id == vehicle_id))
    devices = result.scalars().all()
    stop_channels: list[int] = []

    for device in devices:
        result = await db.execute(
            select(DeviceChannel).where(DeviceChannel.device_id == device.id)
        )
        channels = result.scalars().all()
        stop_channels.extend(channel.channel_no for channel in channels)

    await redis.hdel("fleet:latest", str(vehicle_id))
    await vehicle_repository.delete(db, vehicle)
    await db.commit()

    for channel_no in stop_channels:
        await publish_stop(redis, vehicle_id, channel_no)


@router.get("/{vehicle_id}/latest", response_model=VehicleWithLatest)
async def get_vehicle_latest(
    vehicle_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> VehicleWithLatest:
    _ = current_user
    vehicle = await get_vehicle_with_latest(db, vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return vehicle


@router.patch("/{vehicle_id}/cameras", response_model=list[dict])
async def update_vehicle_cameras(
    vehicle_id: int,
    payload: CameraUpdatePayload,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    current_user: dict = Depends(get_current_user),
):
    _ = current_user
    vehicle = await vehicle_repository.get(db, vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    device = await _get_primary_device(db, vehicle_id)
    if device is None:
        raise HTTPException(status_code=404, detail="No device associated with this vehicle")

    commands = await _sync_device_channels(
        db,
        vehicle_id=vehicle_id,
        device=device,
        cameras=payload.cameras,
    )
    await db.commit()
    await _publish_channel_commands(redis, vehicle_id=vehicle_id, commands=commands)

    result = await db.execute(
        select(DeviceChannel)
        .where(DeviceChannel.device_id == device.id)
        .order_by(DeviceChannel.channel_no)
    )
    channels = result.scalars().all()
    return [
        {
            "channel_no": channel.channel_no,
            "label": channel.label,
            "rtsp_url": channel.rtsp_url,
        }
        for channel in channels
    ]


@router.post("/{vehicle_id}/cameras/test", response_model=CameraTestResponse)
async def test_vehicle_camera(
    vehicle_id: int,
    payload: CameraTestRequest,
    current_user: dict = Depends(get_current_user),
) -> CameraTestResponse:
    _ = vehicle_id
    _ = current_user
    return await _run_camera_test(payload.rtsp_url)
