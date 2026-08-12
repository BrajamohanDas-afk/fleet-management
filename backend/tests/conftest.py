import asyncio
import socket

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.deps import get_redis
from app.core.config import settings
from app.core.database import Base, get_db
from app.main import app
from app.models import (  # noqa: F401
    device,
    device_channel,
    device_session,
    telemetry_point,
    vehicle,
    vehicle_latest,
    video_clip,
)

def _default_test_database_url() -> str:
    if settings.TEST_DATABASE_URL:
        return settings.TEST_DATABASE_URL
    try:
        socket.getaddrinfo("db", 5432)
    except socket.gaierror:
        return settings.DATABASE_URL.replace("@db:5432", "@localhost:15432")
    return settings.DATABASE_URL


TEST_DATABASE_URL = _default_test_database_url()


class FakePubSub:
    def __init__(self, redis: "FakeRedis"):
        self._redis = redis
        self._channels: set[str] = set()
        self._queue: asyncio.Queue = asyncio.Queue()

    async def subscribe(self, *channels: str):
        for channel in channels:
            self._channels.add(channel)
            self._redis._pubsubs.setdefault(channel, []).append(self)
            await self._queue.put(
                {"type": "subscribe", "pattern": None, "channel": channel, "data": None}
            )

    async def unsubscribe(self, *channels: str):
        for channel in channels or list(self._channels):
            self._channels.discard(channel)
            subs = self._redis._pubsubs.get(channel, [])
            if self in subs:
                subs.remove(self)
            await self._queue.put(
                {
                    "type": "unsubscribe",
                    "pattern": None,
                    "channel": channel,
                    "data": None,
                }
            )

    async def listen(self):
        while True:
            msg = await self._queue.get()
            yield msg

    def _put(self, channel: str, message: str):
        self._queue.put_nowait(
            {"type": "message", "pattern": None, "channel": channel, "data": message}
        )

    async def close(self):
        pass


class FakeRedis:
    def __init__(self):
        self.hashes: dict[str, dict[str, str]] = {}
        self.published: list[tuple[str, str]] = []
        self._pubsubs: dict[str, list[FakePubSub]] = {}

    def pubsub(self) -> FakePubSub:
        return FakePubSub(self)

    async def hset(self, name, key=None, value=None, mapping=None):
        h = self.hashes.setdefault(name, {})
        if mapping is not None:
            h.update(mapping)
        elif key is not None:
            h[key] = value

    async def hgetall(self, name):
        return self.hashes.get(name, {})

    async def hget(self, name, key):
        return self.hashes.get(name, {}).get(key)

    async def publish(self, channel, message):
        self.published.append((channel, message))
        for sub in self._pubsubs.get(channel, []):
            sub._put(channel, message)


@pytest_asyncio.fixture
async def fake_redis() -> FakeRedis:
    return FakeRedis()


@pytest_asyncio.fixture(autouse=True)
async def override_redis(fake_redis: FakeRedis):
    app.dependency_overrides[get_redis] = lambda: fake_redis
    yield
    app.dependency_overrides.pop(get_redis, None)


@pytest_asyncio.fixture
async def db() -> AsyncSession:
    """Provide a database session rolled back after each test."""
    test_engine = create_async_engine(TEST_DATABASE_URL)
    async with test_engine.connect() as connection:
        trans = await connection.begin()
        TestingSession = async_sessionmaker(
            connection,
            expire_on_commit=False,
            class_=AsyncSession,
        )
        session = TestingSession()
        yield session
        await session.close()
        await trans.rollback()
    await test_engine.dispose()


@pytest_asyncio.fixture
async def clean_db(db: AsyncSession) -> AsyncSession:
    """Truncate mutable tables so tests start from a known empty state.

    The truncation happens inside the test transaction and is rolled back at
    the end of the test, so seeded data is restored for the next test run.
    """
    from sqlalchemy import text

    await db.execute(
        text(
            "TRUNCATE TABLE "
            "device_sessions, video_clips, telemetry_points, device_channels, "
            "devices, vehicle_latest, vehicles "
            "RESTART IDENTITY CASCADE"
        )
    )
    await db.flush()
    return db


@pytest_asyncio.fixture
async def client(db) -> AsyncClient:
    """HTTP client with DB dependency wired to the test transaction."""
    app.dependency_overrides[get_db] = lambda: db
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac
    app.dependency_overrides.pop(get_db, None)


@pytest_asyncio.fixture
async def auth_headers(client) -> dict[str, str]:
    response = await client.post(
        "/api/auth/login", json={"username": "admin", "password": "admin"}
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
