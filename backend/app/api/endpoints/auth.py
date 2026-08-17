from datetime import timedelta
from hmac import compare_digest

from fastapi import APIRouter, HTTPException, status

from app.core.config import settings
from app.core.security import create_access_token
from app.schemas.auth import LoginRequest, Token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=Token)
async def login(payload: LoginRequest) -> Token:
    username_matches = compare_digest(payload.username, settings.ADMIN_USERNAME)
    password_matches = compare_digest(payload.password, settings.ADMIN_PASSWORD)
    if not username_matches or not password_matches:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
    access_token = create_access_token(
        data={"sub": settings.ADMIN_USERNAME},
        expires_delta=timedelta(hours=24),
    )
    return Token(access_token=access_token, token_type="bearer")
