# Fleet Tracking Dashboard

Simulator-first Track B implementation of the fleet dashboard PRD in `docs/fleet-dashboard-prd-v2.md`.

The project runs a local fleet operations stack:

- React/Vite dashboard for Vehicles, Vehicle Location, and Video Telematics.
- FastAPI backend for REST APIs, WebSocket fleet updates, auth, and recording metadata.
- PostgreSQL for durable registry, telemetry, latest-position, and clip records.
- Redis for latest fleet state and fan-out.
- MediaMTX for H.264/WebRTC video delivery.
- Python simulator for GPS telemetry and development video streams.

Production DVR integration is not implemented yet. The current device ingest path is simulator-only and uses `POST /api/dev/ingest/telemetry` guarded by `X-Device-Key`.

## Requirements

- Docker Desktop
- Node.js 20+ for local frontend commands
- `uv` for host-side backend commands
- Playwright browsers for E2E tests

`make` is optional. Windows PowerShell equivalents are listed below.

## Quick Start

Start Docker Desktop first.

With `make`:

```bash
make up
make migrate
make seed
```

With Windows PowerShell:

```powershell
docker compose up -d --build
docker compose run --rm api alembic upgrade head
docker compose run --rm api python -m app.seed
```

Open the dashboard:

```text
http://localhost:5173
```

Default login:

```text
username: admin
password: admin
```

## Services And Ports

| Service | URL / Port | Purpose |
|---|---:|---|
| Frontend | `http://localhost:5173` | React dashboard |
| API | `http://localhost:8000` | FastAPI backend |
| PostgreSQL | `localhost:15432` | Host access to database |
| Redis | `localhost:6379` | Cache and pub/sub |
| MediaMTX API | `http://localhost:8889` | Media server control API |
| MediaMTX WHEP | `http://localhost:8890` | Browser WebRTC playback |
| MediaMTX RTSP | `localhost:8554` | Simulator stream publish |

PostgreSQL is intentionally exposed on `15432` to avoid conflicts with any local Postgres already using `5432`.

## Common Commands

With `make`:

```bash
make up
make migrate
make seed
make test
make lint
make e2e
make logs
make down
```

PowerShell equivalents:

```powershell
docker compose up -d --build
docker compose run --rm api alembic upgrade head
docker compose run --rm api python -m app.seed
docker compose run --rm api python -m pytest tests/ -v
docker compose run --rm api python -m compileall app tests
cd frontend; npm run lint; cd ..
cd frontend; npx playwright test; cd ..
docker compose logs -f
docker compose down
```

## Local Development

The Compose stack runs the frontend dev server in a container. If you prefer running it directly on the host:

```powershell
cd frontend
npm install
npm run dev
```

Host-side backend tests can run against the Compose database:

```powershell
docker compose up -d db redis mediamtx
$env:TEST_DATABASE_URL = "postgresql+asyncpg://fleet_user:fleet_pass@localhost:15432/fleet_db"
cd backend
uv run pytest tests -q
```

If `TEST_DATABASE_URL` is not set, the test harness uses `db:5432` inside Docker and falls back to `localhost:15432` on the host.

## Environment

The Compose defaults are development-only:

```text
DATABASE_URL=postgresql+asyncpg://fleet_user:fleet_pass@db:5432/fleet_db
TEST_DATABASE_URL=postgresql+asyncpg://fleet_user:fleet_pass@db:5432/fleet_db
REDIS_URL=redis://redis:6379/0
SECRET_KEY=dev-secret-change-me
ENV=dev
DEV_DEVICE_KEY=dev-device-key
MEDIAMTX_HOST=mediamtx
MEDIAMTX_RTSP_PORT=8554
MEDIAMTX_HTTP_PORT=8890
MEDIAMTX_API_PORT=8889
VITE_API_URL=http://localhost:8000/api
```

Rotate secrets, restrict CORS, and lock down MediaMTX before any non-local deployment.

## Simulator

The simulator reads `simulator/config.yaml`, emits GPS every 5 seconds, and publishes H.264 RTSP streams to MediaMTX.

It tries to use a webcam first and falls back to a generated test pattern when no camera is available. Docker Desktop on Windows usually cannot expose a laptop webcam directly to Linux containers, so the test pattern is the expected local behavior. On Linux with V4L2, uncomment the `/dev/video0` mapping in `docker-compose.yml`.

Fault-injection flags are available for manual simulator runs:

```bash
python agent.py --drop-frames
python agent.py --stall 20
python agent.py --jitter
python agent.py --disconnect-every 60
```

These faults are used to exercise the video panel states: idle, connecting, live, degraded, reconnecting, and offline.

## Testing

Backend tests:

```bash
docker compose run --rm api python -m pytest tests/ -q
```

Frontend type check:

```bash
cd frontend
npm run lint
```

Frontend production build:

```bash
cd frontend
npm run build
```

E2E tests:

```bash
cd frontend
npx playwright test
```

## Operational Notes

- Video must reach the browser through MediaMTX, not FastAPI.
- Redis is required for latest-position state and WebSocket fan-out.
- OSM map tiles are acceptable for local demo use only. Use MapTiler, Stadia, or self-hosted tiles before real deployment.
- The current auth is a single development user. It is not a production identity system.
- Real DVRs are expected to push binary protocol traffic to a future protocol adapter. Do not treat the dev HTTP ingest endpoint as production device ingest.
