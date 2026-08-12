from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.video_clip import VideoClip
from app.schemas.recording import RecordingOut

router = APIRouter(prefix="/recordings", tags=["recordings"])


@router.get("", response_model=list[RecordingOut])
async def list_recordings(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> list[RecordingOut]:
    _ = current_user
    result = await db.execute(
        select(VideoClip).order_by(desc(VideoClip.started_at))
    )
    clips = result.scalars().all()
    return [RecordingOut.model_validate(clip) for clip in clips]


@router.get("/{clip_id}/download")
async def download_recording(
    clip_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> FileResponse:
    _ = current_user
    clip = await db.get(VideoClip, clip_id)
    if clip is None:
        raise HTTPException(status_code=404, detail="Recording not found")
    return FileResponse(
        path=clip.file_path,
        media_type="video/mp4",
        filename=clip.file_path.split("/")[-1],
    )
