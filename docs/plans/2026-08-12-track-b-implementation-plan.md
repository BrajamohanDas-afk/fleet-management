# Track B Simulator-First Fleet Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Build a Dockerized simulator-first fleet dashboard with FastAPI backend, React frontend, PostgreSQL, Redis, and MediaMTX, matching the PRD in `docs/fleet-dashboard-prd-v2.md`.

**Architecture:** The system has four runtime layers: (1) a FastAPI API that owns the domain model and serves REST/WebSocket data from PostgreSQL and Redis; (2) a MediaMTX media server that ingests H.264 and serves WebRTC/WHEP to browsers; (3) a Python simulator/dev agent that emits GPS telemetry and publishes test video streams into MediaMTX; and (4) a Vite + React + TypeScript dashboard with three screens. All stateful fan-out goes through Redis so multiple Uvicorn workers see the same data.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2 (async), Alembic, Pydantic v2, pytest, PostgreSQL 16, Redis 7, MediaMTX, Vite, React 18, TypeScript, TanStack Query, Leaflet, Tailwind CSS, uv.

---

## Reference

- PRD: `docs/fleet-dashboard-prd-v2.md`
- Data model, API surface, screens, and test plan are derived from the PRD and the Track B summary.
- All times stored UTC; render IST (`DD-MM-YYYY HH:mm`) in the UI.
- Status derived server-side: `moving` (fix < 60s, speed > 3), `standing` (fix < 60s, speed ≤ 3), `stale` (60s–15min), `offline` (> 15min or never).
- UI labels: `moving` → Running, `standing` → Stationary; stale/offline remain distinct.
- License "Needs Renewal" = expired or expiring within 30 days.
- Max 4 simultaneous video panels across all users; additional starts surface a clear "video limit reached" UI state.
- Save Video server-side via MediaMTX/ffmpeg, default 60s, max 300s.
- Clip retention 7 days; telemetry retention 90 days via scheduled cleanup.
- OSM tiles allowed for demo/local only.

---

## Task 1: Backend Foundation — Docker, Config, Models, Migrations, Seed

**Files:**
- Create: `docker-compose.yml`
- Create: `backend/pyproject.toml`
- Create: `backend/Dockerfile`
- Create: `backend/app/core/config.py`
- Create: `backend/app/core/database.py`
- Create: `backend/app/core/redis.py`
- Create: `backend/app/models/vehicle.py`
- Create: `backend/app/models/device.py`
- Create: `backend/app/models/device_channel.py`
- Create: `backend/app/models/device_session.py`
- Create: `backend/app/models/telemetry_point.py`
- Create: `backend/app/models/vehicle_latest.py`
- Create: `backend/app/models/video_clip.py`
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Create: `backend/alembic/versions/001_initial_schema.py`
- Create: `backend/app/seed.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_status_derivation.py`
- Modify: `backend/app/main.py` (scaffold)

**Steps:**

1. Write `docker-compose.yml` with services: `db` (Postgres 16), `redis`, `mediamtx`, `api` (FastAPI), `frontend` (Vite dev), and `simulator`.
2. Write `backend/pyproject.toml` with dependencies: fastapi, uvicorn[standard], sqlalchemy[asyncio], asyncpg, alembic, pydantic-settings, redis, python-jose, passlib, bcrypt, httpx, pytest-asyncio.
3. Write `backend/Dockerfile` using `python:3.12-slim` and `uv` for dependency install.
4. Implement `backend/app/core/config.py` with Pydantic Settings for `DATABASE_URL`, `REDIS_URL`, `SECRET_KEY`, `MEDIAMTX_HOST`, `MEDIAMTX_RTSP_PORT`, etc.
5. Implement `backend/app/core/database.py` with async SQLAlchemy engine, session factory, `Base`, and `get_db()` dependency.
6. Implement `backend/app/core/redis.py` with async Redis client singleton and `get_redis()` dependency.
7. Implement SQLAlchemy models matching PRD §6:
   - `Vehicle`, `Device`, `DeviceChannel`, `DeviceSession`, `TelemetryPoint` (partitioned by month), `VehicleLatest`, `VideoClip`.
   - Use enums for `vehicle_type`, `license_status`, `protocol`, `status`.
8. Configure Alembic for async Postgres and partitioned `telemetry_points` table. Initial migration must create partitions for current and next month.
9. Write `backend/app/seed.py` that inserts 5 seeded vehicles, devices, channels, and initial `vehicle_latest` rows. Run via `python -m app.seed` inside the api container.
10. Scaffold `backend/app/main.py` with lifespan, CORS, and health check `/health`.
11. Write `backend/tests/conftest.py` with async Postgres test DB engine, session override, and `client` fixture.
12. Write `backend/tests/test_status_derivation.py` with parameterized tests for all four status states and boundary conditions.

**Run & Verify:**
- `docker compose up db redis mediamtx -d`
- `cd backend && alembic upgrade head`
- `python -m app.seed`
- `pytest backend/tests/test_status_derivation.py -v`

**Commit:** `git add backend/ docker-compose.yml && git commit -m "feat(backend): foundation, models, migrations, seed"`

---

## Task 2: Backend Services — Status, License, Telemetry, Video Clip Cleanup

**Files:**
- Create: `backend/app/services/status_service.py`
- Create: `backend/app/services/license_service.py`
- Create: `backend/app/services/telemetry_service.py`
- Create: `backend/app/services/cleanup_service.py`
- Create: `backend/app/repositories/vehicle_repository.py`
- Create: `backend/app/repositories/device_repository.py`
- Create: `backend/app/repositories/telemetry_repository.py`
- Create: `backend/tests/test_license_service.py`
- Create: `backend/tests/test_telemetry_service.py`

**Steps:**

1. Implement `status_service.derive_status(fix_age_seconds: float | None, speed_kmh: float | None) -> VehicleStatus`.
2. Implement `license_service.needs_renewal(expiry: date | None) -> bool`.
3. Implement `telemetry_service.ingest_telemetry(...)`:
   - Validate duplicate/late packets (ignore if `recorded_at` older than latest for device).
   - Insert into `telemetry_points`.
   - Upsert `vehicle_latest` with derived status.
   - Publish to Redis pub/sub channel `fleet:telemetry`.
4. Implement `cleanup_service`:
   - `cleanup_telemetry(retention_days=90)` deletes old monthly partitions safely.
   - `cleanup_clips(retention_days=7)` deletes `video_clips` rows and underlying files.
5. Create repository modules for vehicles, devices, telemetry using SQLAlchemy 2 async patterns.
6. Write unit tests for status boundaries, license classification, telemetry duplicate/late handling.

**Run & Verify:**
- `pytest backend/tests/test_status_derivation.py backend/tests/test_license_service.py backend/tests/test_telemetry_service.py -v`

**Commit:** `git add backend/app/services backend/app/repositories backend/tests && git commit -m "feat(backend): domain services and repositories"`

---

## Task 3: REST API — Vehicles, Fleet, Devices, Recordings

**Files:**
- Create: `backend/app/api/router.py`
- Create: `backend/app/api/deps.py`
- Create: `backend/app/api/endpoints/vehicles.py`
- Create: `backend/app/api/endpoints/fleet.py`
- Create: `backend/app/api/endpoints/devices.py`
- Create: `backend/app/api/endpoints/recordings.py`
- Create: `backend/app/api/endpoints/auth.py`
- Create: `backend/app/schemas/vehicle.py`
- Create: `backend/app/schemas/device.py`
- Create: `backend/app/schemas/fleet.py`
- Create: `backend/app/schemas/recording.py`
- Create: `backend/app/schemas/auth.py`
- Create: `backend/app/core/security.py`
- Modify: `backend/app/main.py`

**Steps:**

1. Implement JWT single-user auth: `/api/auth/login` returns token; `get_current_user` dependency.
2. Write Pydantic v2 schemas for request/response shapes.
3. Implement `/api/vehicles` CRUD + `/api/vehicles/{id}/latest`.
4. Implement `/api/fleet/positions?status=&q=&bbox=` served from Redis hash `fleet:latest` with filtering and bbox parsing.
5. Implement `/api/devices/{id}/channels` returning channel metadata with MediaMTX WHEP stream URLs.
6. Implement `/api/devices/{id}/health` returning per-channel state and `last_frame_at`.
7. Implement `/api/devices/{id}/recordings` (POST) starting an ffmpeg-based recording from MediaMTX into `video_clips`.
8. Implement `/api/recordings` (GET) and `/api/recordings/{id}/download`.
9. Implement dev-only ingest endpoint `POST /api/dev/ingest/telemetry` guarded by `X-Device-Key`, active only when `ENV=dev`.
10. Mount API router in `main.py`.

**Run & Verify:**
- `pytest backend/tests/test_api_vehicles.py backend/tests/test_api_fleet.py -v`
- Manual: `curl http://localhost:8000/api/fleet/positions`

**Commit:** `git add backend/app/api backend/app/schemas backend/app/core/security.py && git commit -m "feat(api): vehicles, fleet, devices, recordings endpoints"`

---

## Task 4: WebSocket Fleet Positions with Redis Fan-Out

**Files:**
- Create: `backend/app/api/endpoints/ws_fleet.py`
- Create: `backend/app/services/fleet_ws_service.py`
- Create: `backend/tests/test_ws_fleet.py`
- Modify: `backend/app/api/router.py`
- Modify: `backend/app/main.py`

**Steps:**

1. Implement `fleet_ws_service` that subscribes to Redis `fleet:telemetry` and broadcasts JSON to a set of connected WebSocket clients.
2. Implement `/ws/fleet/positions` endpoint: on connect, send current Redis state; then push updates as they arrive; fallback 15s heartbeat.
3. Ensure the service works across multiple Uvicorn workers (shared Redis pub/sub).
4. Write integration test: start 2 Uvicorn workers, connect WS clients to both, ingest telemetry, assert both clients receive it.

**Run & Verify:**
- `pytest backend/tests/test_ws_fleet.py -v`
- Manual: open two browser tabs to `ws://localhost:8000/ws/fleet/positions` and trigger simulator GPS.

**Commit:** `git add backend/app/api/endpoints/ws_fleet.py backend/app/services/fleet_ws_service.py backend/tests/test_ws_fleet.py && git commit -m "feat(api): redis-backed websocket fleet fan-out"`

---

## Task 5: Frontend Foundation — Vite, Router, API Client, Auth

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/types/index.ts`
- Create: `frontend/src/services/api.ts`
- Create: `frontend/src/services/auth.ts`
- Create: `frontend/src/hooks/useAuth.ts`
- Create: `frontend/src/pages/Login.tsx`

**Steps:**

1. Initialize Vite React TypeScript project in `frontend/`.
2. Add dependencies: react-router-dom, @tanstack/react-query, axios, leaflet, react-leaflet, date-fns, lucide-react, tailwindcss.
3. Add dev dependencies: typescript, @types/leaflet, @types/react, @types/react-dom, postcss, autoprefixer.
4. Configure Tailwind CSS and base styles.
5. Define shared TypeScript types matching backend schemas in `frontend/src/types/index.ts`.
6. Create axios-based API client with request/response interceptors for JWT and error handling.
7. Implement a minimal login page and `useAuth` hook storing token in memory/localStorage.
8. Set up React Router with protected routes for `/dashboard/vehicles`, `/dashboard/location`, `/dashboard/video`.

**Run & Verify:**
- `cd frontend && npm install && npm run dev`
- Confirm login page renders at `http://localhost:5173`.

**Commit:** `git add frontend/ && git commit -m "feat(frontend): vite scaffold, auth, router, api client"`

---

## Task 6: Vehicles Screen

**Files:**
- Create: `frontend/src/pages/Vehicles.tsx`
- Create: `frontend/src/components/vehicles/VehicleCard.tsx`
- Create: `frontend/src/components/vehicles/VehicleFilters.tsx`
- Create: `frontend/src/components/vehicles/VehicleForm.tsx`
- Create: `frontend/src/hooks/useVehicles.ts`
- Create: `frontend/src/services/vehicles.ts`

**Steps:**

1. Build `Vehicles` page with hero counters (Total, Licensed, Needs Renewal, Types).
2. Implement search + status filter + vehicle type filter.
3. Build `VehicleCard` showing type icon, plate, device code, SIM, speed limit, licensed badge, Overview/Edit actions.
4. Build `VehicleForm` for create/edit in a modal/drawer.
5. Implement `useVehicles` hook using TanStack Query with optimistic updates.
6. Render `--` for null speed limits.
7. Overview action deep-links to Video Telematics with vehicle preselected.

**Run & Verify:**
- `npm run build` succeeds with no TypeScript errors.
- Vehicles grid renders 5 seeded vehicles; filters work.

**Commit:** `git add frontend/src/pages/Vehicles.tsx frontend/src/components/vehicles frontend/src/hooks/useVehicles.ts frontend/src/services/vehicles.ts && git commit -m "feat(frontend): vehicles registry screen"`

---

## Task 7: Vehicle Location Screen

**Files:**
- Create: `frontend/src/pages/VehicleLocation.tsx`
- Create: `frontend/src/components/location/MapView.tsx`
- Create: `frontend/src/components/location/VehicleMarker.tsx`
- Create: `frontend/src/components/location/VehicleCardRail.tsx`
- Create: `frontend/src/components/location/CounterBand.tsx`
- Create: `frontend/src/hooks/useFleetPositions.ts`
- Create: `frontend/src/hooks/useWebSocket.ts`
- Create: `frontend/src/services/fleet.ts`

**Steps:**

1. Build `VehicleLocation` page with counter band (Visible, Running, Stationary, Needs Renewal).
2. Implement Leaflet map with `VehicleMarker` components for each vehicle.
3. Implement left rail with All/Stationary/Running radio, Show Popup Labels toggle, vehicle search.
4. Implement synchronized markers and cards: one filter state drives both.
5. Auto-fit bounds on first load only.
6. Implement `useWebSocket` hook connecting to `/ws/fleet/positions` with reconnect and "Live Feed" indicator that greys out on disconnect.
7. Implement 15s poll fallback when WebSocket is disconnected.

**Run & Verify:**
- Map renders 5 markers; simulated GPS moves markers live.
- Filters sync markers and cards.
- Disconnecting network greys out live feed indicator.

**Commit:** `git add frontend/src/pages/VehicleLocation.tsx frontend/src/components/location frontend/src/hooks/useFleetPositions.ts frontend/src/hooks/useWebSocket.ts frontend/src/services/fleet.ts && git commit -m "feat(frontend): vehicle location map screen"`

---

## Task 8: Video Telematics Screen

**Files:**
- Create: `frontend/src/pages/VideoTelematics.tsx`
- Create: `frontend/src/components/video/VideoPanel.tsx`
- Create: `frontend/src/components/video/VideoControls.tsx`
- Create: `frontend/src/components/video/ChannelBadge.tsx`
- Create: `frontend/src/components/video/SaveVideoModal.tsx`
- Create: `frontend/src/hooks/useVideoChannels.ts`
- Create: `frontend/src/hooks/useVideoPanelState.ts`
- Create: `frontend/src/services/video.ts`

**Steps:**

1. Build `VideoTelematics` page with vehicle selector, layout toggle (Side-by-side / Front focus / Rear focus), and action bar.
2. Implement two `VideoPanel` components using MediaMTX WHEP/WebRTC stream URLs.
3. Implement panel state machine: `idle`, `connecting`, `live`, `degraded`, `reconnecting`, `offline`.
4. Poll `/api/devices/{id}/health` every 3s to drive `degraded` state.
5. Implement backoff: 1s, 2s, 4s, 8s, capped 15s; stop after 5 attempts and show manual Retry.
6. Enforce max 4 simultaneous video panels globally (use a lightweight context or backend-enforced limit surfaced in UI).
7. Implement Save Video modal with default 60s, max 300s; call POST `/api/devices/{id}/recordings`.
8. Show channel badges, health status strip, current location mini-map, and vehicle data grid.

**Run & Verify:**
- Video panels reach `live` state when simulator streams are active.
- Fault injection (drop frames, disconnect) reaches all six states.
- Save Video triggers recording and returns download link.

**Commit:** `git add frontend/src/pages/VideoTelematics.tsx frontend/src/components/video frontend/src/hooks/useVideoChannels.ts frontend/src/hooks/useVideoPanelState.ts frontend/src/services/video.ts && git commit -m "feat(frontend): video telematics screen"`

---

## Task 9: Simulator / Dev Agent

**Files:**
- Create: `simulator/pyproject.toml`
- Create: `simulator/Dockerfile`
- Create: `simulator/agent.py`
- Create: `simulator/gps_routes.py`
- Create: `simulator/video_publisher.py`
- Create: `simulator/supervisor.py`
- Create: `simulator/fault_injection.py`
- Create: `simulator/config.yaml`

**Steps:**

1. Write `simulator/pyproject.toml` with dependencies: asyncio-mqtt is not needed; use asyncio, aiohttp, opencv-python-headless, numpy, ffmpeg-python wrapper optional. Prefer calling `ffmpeg` binary via subprocess for H.264 RTSP publish.
2. Implement `gps_routes.py` with 5 deterministic routes around a test area (e.g., Hyderabad city center) producing lat/lon updates every 5s.
3. Implement `video_publisher.py` that reads webcam (or test pattern if no webcam) via OpenCV, pipes raw frames to ffmpeg, and publishes H.264 RTSP to MediaMTX path per device/channel.
4. Implement `agent.py` that combines GPS emitter (POST to `/api/dev/ingest/telemetry` or TCP placeholder) and optional video publisher.
5. Implement `supervisor.py` that reads `config.yaml` and runs one agent process per configured device, capping live video devices at 5; others simulate GPS only.
6. Implement `fault_injection.py` with CLI flags `--drop-frames`, `--stall 20s`, `--jitter`, `--disconnect-every 60s`.
7. Add `simulator` service to `docker-compose.yml`.

**Run & Verify:**
- `docker compose up simulator -d`
- Confirm GPS telemetry appears in `/api/fleet/positions` every 5s.
- Confirm video streams are published to MediaMTX (`rtsp://mediamtx:8554/device-{id}-ch{no}`).

**Commit:** `git add simulator/ docker-compose.yml && git commit -m "feat(simulator): gps + h.264 dev agent with supervisor"`

---

## Task 10: Integration Tests, E2E, and Cleanup

**Files:**
- Create: `backend/tests/test_integration_ingest.py`
- Create: `backend/tests/test_integration_recordings.py`
- Create: `backend/tests/test_api_bbox.py`
- Create: `frontend/playwright.config.ts`
- Create: `frontend/e2e/vehicles.spec.ts`
- Create: `frontend/e2e/location.spec.ts`
- Create: `frontend/e2e/video.spec.ts`
- Create: `Makefile`
- Modify: `docker-compose.yml`

**Steps:**

1. Write backend integration tests:
   - dev ingest → Postgres + Redis latest state.
   - `/api/fleet/positions` filters and bbox behavior.
   - recording creation and retention cleanup.
2. Write multi-worker WebSocket fan-out test with 2 Uvicorn workers.
3. Add Playwright E2E tests for the three modules (happy path).
4. Add a scheduled cleanup task (APScheduler or Celery beat lightweight) for telemetry and clip retention.
5. Create `Makefile` with targets: `up`, `down`, `test`, `seed`, `migrate`, `lint`.
6. Ensure `docker compose up` works on a clean machine.

**Run & Verify:**
- `make test` passes backend tests.
- `make e2e` passes Playwright tests.
- `docker compose up` boots all services.

**Commit:** `git add backend/tests frontend/e2e Makefile docker-compose.yml && git commit -m "test: integration, e2e, cleanup, and orchestration"`

---

## Task 11: README, Final Review, and Documentation

**Files:**
- Create: `README.md`
- Create: `docs/ARCHITECTURE.md`
- Modify: `docs/plans/2026-08-12-track-b-implementation-plan.md`

**Steps:**

1. Write `README.md` covering:
   - Quick start: `docker compose up`, seeding, login.
   - Host-vs-container webcam caveat.
   - Environment variables.
   - Fault injection flags.
   - OSM tile demo-only note.
2. Write `docs/ARCHITECTURE.md` with diagram and component responsibilities.
3. Update plan status to completed tasks.
4. Run full test suite and fix any remaining issues.
5. Final code quality review.

**Commit:** `git add README.md docs/ARCHITECTURE.md && git commit -m "docs: readme and architecture"`

---

## Execution Notes for Implementer Agents

- Follow TDD: write failing test first, then implementation, then commit.
- Use the skills loaded in this session: fastapi-templates, react-best-practices, typescript-best-practices, testing-best-practices, python-best-practices.
- Prefer explicit types, discriminated unions, and dependency injection.
- Keep UI state minimal; derive what you can.
- Never store shared state in FastAPI globals; use Redis.
- Do not treat MJPEG as production video path.
- Run `pytest` / `npm run build` before marking a task done.
- Commit after each task with a conventional commit message.
