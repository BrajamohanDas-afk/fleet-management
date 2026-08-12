from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.repositories import vehicle_repository
from app.schemas.vehicle import VehicleCreate, VehicleOut, VehicleUpdate, VehicleWithLatest
from app.services.vehicle_service import (
    get_vehicle_with_latest,
    get_vehicles_with_latest,
)

router = APIRouter(prefix="/vehicles", tags=["vehicles"])


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
    current_user: dict = Depends(get_current_user),
) -> VehicleOut:
    _ = current_user
    existing = await vehicle_repository.get_by_registration(db, payload.registration_no)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Vehicle with this registration number already exists",
        )
    vehicle = await vehicle_repository.create(db, payload.model_dump())
    return VehicleOut.model_validate(vehicle)


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
    current_user: dict = Depends(get_current_user),
) -> VehicleOut:
    _ = current_user
    vehicle = await vehicle_repository.get(db, vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    update_data = payload.model_dump(exclude_unset=True)
    if "registration_no" in update_data:
        existing = await vehicle_repository.get_by_registration(
            db, update_data["registration_no"]
        )
        if existing and existing.id != vehicle_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Registration number already in use",
            )

    updated = await vehicle_repository.update(db, vehicle, update_data)
    return VehicleOut.model_validate(updated)


@router.delete("/{vehicle_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vehicle(
    vehicle_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> None:
    _ = current_user
    vehicle = await vehicle_repository.get(db, vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    await vehicle_repository.delete(db, vehicle)


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
