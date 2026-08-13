import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.deps import get_current_user, get_redis
from app.core.config import settings
from app.core.database import get_db
from app.models.share_link import ShareLink
from app.models.vehicle import Vehicle
from app.models.vehicle_latest import VehicleLatest
from app.schemas.share_link import PublicLocationOut, ShareLinkCreate, ShareLinkOut

router = APIRouter(tags=["sharing"])


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def _get_active_link(token: str, db: AsyncSession) -> ShareLink:
    link = await db.scalar(select(ShareLink).where(ShareLink.token_hash == _hash_token(token)))
    if link is None or link.revoked_at is not None or link.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=404, detail="Share link is invalid or expired")
    return link


@router.post("/vehicles/{vehicle_id}/share-links", response_model=ShareLinkOut, status_code=status.HTTP_201_CREATED)
async def create_share_link(vehicle_id: int, payload: ShareLinkCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)) -> ShareLinkOut:
    vehicle = await db.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    token = secrets.token_urlsafe(32)
    link = ShareLink(token_hash=_hash_token(token), vehicle_id=vehicle_id, created_by=current_user["username"], expires_at=datetime.now(timezone.utc) + timedelta(minutes=payload.duration_minutes))
    db.add(link)
    await db.commit()
    return ShareLinkOut(id=link.id, url=f"{settings.PUBLIC_SHARE_BASE_URL.rstrip('/')}/share/{token}", expires_at=link.expires_at)


@router.get("/vehicles/{vehicle_id}/share-links", response_model=list[ShareLinkOut])
async def list_share_links(vehicle_id: int, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)) -> list[ShareLinkOut]:
    links = (await db.execute(select(ShareLink).where(ShareLink.vehicle_id == vehicle_id).order_by(ShareLink.created_at.desc()))).scalars().all()
    return [ShareLinkOut(id=l.id, url="", expires_at=l.expires_at, revoked_at=l.revoked_at) for l in links if l.revoked_at is None and l.expires_at > datetime.now(timezone.utc)]


@router.post("/share-links/{link_id}/revoke", response_model=ShareLinkOut)
async def revoke_share_link(link_id: int, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)) -> ShareLinkOut:
    link = await db.get(ShareLink, link_id)
    if link is None:
        raise HTTPException(status_code=404, detail="Share link not found")
    link.revoked_at = datetime.now(timezone.utc)
    await db.flush()
    return ShareLinkOut(id=link.id, url="", expires_at=link.expires_at, revoked_at=link.revoked_at)


@router.get("/public/share/{token}", response_model=PublicLocationOut)
async def get_public_location(token: str, db: AsyncSession = Depends(get_db), redis: Redis = Depends(get_redis)) -> PublicLocationOut:
    link = await _get_active_link(token, db)
    vehicle = await db.get(Vehicle, link.vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    link.last_access_at = datetime.now(timezone.utc)
    await db.commit()
    import json
    raw = await redis.hget("fleet:latest", str(vehicle.id))
    data = json.loads(raw) if raw else {}
    latest = await db.get(VehicleLatest, vehicle.id)
    if not data and latest:
        data = {"latitude": latest.latitude, "longitude": latest.longitude, "speed_kmh": latest.speed_kmh, "heading_deg": latest.heading_deg, "ignition_on": latest.ignition_on, "status": latest.status.value, "recorded_at": latest.recorded_at, "received_at": latest.received_at}
    return PublicLocationOut(vehicle_id=vehicle.id, registration_no=vehicle.registration_no, vehicle_code=vehicle.vehicle_code, vehicle_type=vehicle.vehicle_type.value, expires_at=link.expires_at, status=data.get("status", "offline"), **{k: data.get(k) for k in ("latitude", "longitude", "speed_kmh", "heading_deg", "ignition_on", "recorded_at", "received_at")})
