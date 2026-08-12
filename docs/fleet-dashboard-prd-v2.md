# Fleet Tracking Dashboard — PRD v2

**Status:** Draft for review
**Supersedes:** v1 (three claims in v1 were wrong; see §12 changelog)
**Scope:** Internal rebuild of three modules from `tracking.texmin.in`
**Stack:** React + FastAPI + PostgreSQL + Redis, in Docker
**Hardware today:** 1 laptop webcam. No DVR, no GPS tracker, no device protocol spec.

---

## 0. Read this first: the project forks

Before estimating anything, one question must be answered:

> **Do we have access to the existing system's API or database?**

The answer produces two different projects with different costs, and this document covers both.

| | **Track A — we get their data** | **Track B — we build ingest ourselves** |
|---|---|---|
| What we build | 3 frontend screens + a thin read API | Everything in Track A, **plus** device protocol adapter, video transport, media server, ingest pipeline |
| Hard problems | None. It's UI work. | Vehicle-to-server networking, DVR protocol, H.264 transport over 4G |
| Rough size | ~2–3 weeks | ~7–10 weeks |
| Blocked on | Credentials | DVR hardware + protocol docs |

**Get this answered before writing code.** Track A deletes roughly two-thirds of this document. Everything below is written for Track B (the expensive case), with Track A sections marked *[Track A: skip]*.

**Two other unblocking questions of the same weight:**

- **What is the exact make and model of the DVR that will be used?** Not "a DVR" — a model number, and ideally the protocol PDF. This single fact determines the entire video architecture (§4).
- **Scope and permission.** The reference footer credits Ecross Technologies plus three named individuals. Confirm with the boss what "copy" means here: an internal rebuild of a system we own, versus reproducing a vendor's product, are different conversations. Better had now than after shipping.

---

## 1. Modules in scope

| # | Module | Reference route | Purpose |
|---|--------|-----------------|---------|
| 1 | **Video Telematics** | `/dashboard/videodvr` | Live front + rear streams for one vehicle, with GPS and telemetry panels |
| 2 | **Vehicle Location** | `/dashboard/vehiclelocation` | Fleet map, running/stationary counters, filters, vehicle cards |
| 3 | **Vehicles** | `/dashboard/vehiclelistgps` | Registry — plate, type, device, SIM, speed limit, license status |

Out of scope: Journey History, Fuel, Payload, Reports, Geo-fence, Immobilization, Real Time Alerts, IPS, Fleet Overview, multi-tenancy, roles, mobile app, driver management, route replay, notifications.

---

## 2. Non-functional requirements

v1 omitted these entirely. Without them "done" is undefinable.

| Area | Target for v1 |
|------|---------------|
| Fleet size | Design for **50 vehicles**; must not architecturally block 500 (§8) |
| Concurrent viewers | 5 users; max 4 simultaneous video panels across all users |
| Video latency | < 5s glass-to-glass on LAN. Field target deferred to v2. |
| Video uplink budget | **≤ 0.75 Mbps per channel** — this is the binding constraint (§4) |
| Map refresh | Position updates visible within 15s of the fix |
| API latency | p95 < 300ms for all REST reads |
| Uptime | Best-effort. No HA, no failover, single host. |
| Browsers | Latest Chrome + Edge, desktop only. No mobile layout, no Safari testing. |
| Storage | ≤ 50 GB total; clip retention 7 days, telemetry 90 days |
| Timezone | Store UTC everywhere; render IST; display `DD-MM-YYYY HH:mm` |

---

## 3. The webcam: what it does and does not prove

A webcam is fine for building the **dashboard**. It is worthless for validating the **transport**, and v1 conflated the two.

What a webcam legitimately gets you:
- Every UI state, layout, and interaction in Video Telematics
- The panel state machine, including failure states (inject artificial stalls)
- The whole of Vehicle Location and Vehicles, via a scripted GPS route

What it cannot tell you, and will actively mislead you about:
- Whether your video transport survives 4G uplink — localhost has effectively infinite bandwidth
- Whether the DVR can even be reached from a server (it usually can't; see §4)
- Reconnect behaviour under real packet loss, NAT timeouts, and tower handoffs

**The trap:** MJPEG at 640×480/10fps is ~2.5–4 Mbps per channel. Two channels is 5–8 Mbps sustained *uplink* from a vehicle. Typical Indian 4G uplink is 1–5 Mbps and unstable. **MJPEG cannot work in the field.** It will work flawlessly in your demo, which is exactly why it's dangerous — a beautiful Phase-3 demo will read as "90% done" when the transport layer still needs replacing wholesale.

So: MJPEG is permitted **for local development only**, and the PRD commits to H.264 for anything real (§4). Say this out loud in the demo.

---

## 4. Video architecture — the part v1 got wrong

v1 claimed "swap the webcam for an RTSP URL, zero changes elsewhere." That is probably false, for two reasons.

**Reachability.** Vehicle DVRs sit behind a 4G SIM on carrier-grade NAT. They have no public IP. **You cannot dial into a moving truck.** All traffic must be *pushed out* from the vehicle to a server with a public IP. Any design that pulls from the device is dead on arrival.

**Protocol.** Most vehicle DVRs sold in this market are Chinese-manufactured and speak the **JT/T 808** family (telemetry) and **JT/T 1078** (video) over proprietary binary TCP — not RTSP, not HTTP. Some units offer RTSP but only on the vehicle's local network, which reachability already rules out.

Consequence: there is a component v1 didn't have at all.

```
IN-VEHICLE                    OUR SERVER (public IP)              BROWSER
┌──────────┐   binary TCP    ┌────────────────────┐
│ DVR/GPS  │ ──────────────► │ protocol-adapter   │ ── Redis ──► FastAPI ──► WS (positions)
│  unit    │                 │ (808/1078 listener)│              │
└──────────┘                 └─────────┬──────────┘              │
                                       │ H.264 sub-stream        │
                                       ▼                         ▼
                                 ┌───────────┐            WebRTC / LL-HLS
                                 │ MediaMTX  │ ──────────────────►
                                 └───────────┘
```

- **protocol-adapter** — a standalone service holding long-lived TCP sockets, parsing device frames, writing telemetry to Postgres + Redis, and republishing video into MediaMTX. Not FastAPI; a plain asyncio TCP server. **This is the single largest unpriced item in v1.**
- **MediaMTX** — off-the-shelf media server. Handles H.264 ingest and fans out as WebRTC (low latency) or LL-HLS (compatible). Do not hand-roll this.
- **Sub-stream, not main stream.** DVRs publish a low-bitrate secondary stream (~0.3–0.5 Mbps) precisely for live monitoring. Always request the sub-stream; the main stream is for on-device recording only.

**The dev shim.** The Device Agent still exists, but it now targets MediaMTX directly instead of a custom HTTP endpoint: read webcam via OpenCV → encode H.264 via ffmpeg → publish RTSP to MediaMTX. This means **development and production use the same delivery path**, which is what v1's abstraction was reaching for and missed. The seam moves to "how frames enter MediaMTX," which is genuinely swappable.

**Fallback if the DVR turns out to be undocumented:** buy one supported unit, or use a vendor gateway/SDK if offered. Budget 1–2 weeks of protocol reverse-engineering as a real risk, not a footnote.

*[Track A: skip this entire section — consume their video URL directly.]*

---

## 5. Fan-out: why Redis is now mandatory

v1 had the agent POST frames into FastAPI and browsers hold open connections to FastAPI. **Run more than one Uvicorn worker and this silently breaks** — a frame arriving at worker A is invisible to a viewer attached to worker B, and the panel just hangs forever. Same bug for the WebSocket position feed.

Rules:

- All ingest writes publish to **Redis pub/sub**; all delivery paths subscribe. No in-process state shared between ingest and delivery.
- Latest-position reads come from a Redis hash (`fleet:latest`) refreshed on write, with Postgres as the durable record.
- Video never passes through FastAPI at all — the browser connects to MediaMTX. FastAPI only issues stream URLs and reports health.
- One slow video client must not affect others. MediaMTX handles this; a hand-rolled multipart endpoint does not.

---

## 6. Data model

Changes from v1: channels are a table (a bike doesn't have two cameras), plus a device-session record for connection debugging.

```
vehicles
  id, registration_no UNIQUE, vehicle_code, vehicle_type ENUM,
  speed_limit_kmh NULL, license_status ENUM, license_expiry NULL, created_at

devices
  id, vehicle_id FK NULL, device_serial UNIQUE, sim_number,
  protocol ENUM(jt808, sim, other), last_seen_at NULL

device_channels                      -- replaces v1's front_channel/rear_channel columns
  id, device_id FK, channel_no INT, label TEXT,     -- "Front", "Rear", "Cabin"
  stream_path TEXT,                                  -- MediaMTX path
  UNIQUE (device_id, channel_no)

device_sessions                      -- NEW: connection history, for debugging the field
  id, device_id FK, connected_at, disconnected_at NULL, remote_ip, bytes_in

telemetry_points                     -- append-only
  id BIGSERIAL, device_id FK, recorded_at, received_at,
  latitude, longitude, speed_kmh, heading_deg, ignition_on
  INDEX (device_id, recorded_at DESC)
  -- partition by month from day one (§8)

vehicle_latest                       -- 1 row per vehicle, denormalised current state
  vehicle_id PK, ...latest fix..., status ENUM(moving, standing, stale, offline)

video_clips
  id, device_id FK, channel_no, started_at, ended_at, file_path, size_bytes
```

**Status derivation** (server-side only, so map and cards never disagree):

- `moving` — fix < 60s old and speed > 3 km/h
- `standing` — fix < 60s old and speed ≤ 3 km/h
- `stale` — fix 60s–15min old
- `offline` — fix > 15min old, or never

The reference UI shows a vehicle last seen **16/4/2026** labelled "Standing" beside one from two minutes ago. Do not copy that. `stale` and `offline` get distinct badges.

Store `recorded_at` and `received_at` separately — the gap between them is the clearest signal of a struggling link.

---

## 7. API surface

```
# Vehicles
GET/POST/PATCH  /api/vehicles[/{id}]
GET             /api/vehicles/{id}/latest

# Fleet
GET  /api/fleet/positions?status=&q=&bbox=     → served from Redis
WS   /ws/fleet/positions                       → Redis-backed push; 15s poll fallback

# Video
GET  /api/devices/{id}/channels                → [{channel_no, label, stream_url, state}]
GET  /api/devices/{id}/health                  → per-channel state + last_frame_at
POST /api/devices/{id}/recordings              → {channel_no, duration_s}
GET  /api/recordings[/{id}/download]

# Ingest  [Track A: skip]
# Telemetry arrives over TCP at protocol-adapter, NOT over HTTP.
# Real trackers will not POST JSON. HTTP ingest exists only for the dev agent:
POST /api/dev/ingest/telemetry                 → guarded by X-Device-Key, dev profile only
```

`stream_url` points at MediaMTX (WebRTC/WHEP), not FastAPI.

---

## 8. Scale: two designs, decided now

v1 asked about scale in the open questions. Decide instead:

- **≤ 50 vehicles (v1 target):** current design as written. ~17k telemetry rows/vehicle/day ≈ 850k/day, trivially handled.
- **→ 500 vehicles:** partition `telemetry_points` by month (do this from day one — retrofitting is painful), add marker clustering on the map, make `/api/fleet/positions` bbox-bounded, and move from WebSocket-per-client broadcast to a single Redis fan-out channel.

Both paths share the same schema. The only day-one cost is declaring the table partitioned, which is cheap.

**Agent supervision:** one agent process per simulated device. At 5 devices that's 5 processes and 5 encoders — meaningful CPU on a laptop. Run them under a single supervisor process with a device list in config, not five terminal tabs. Cap the dev fleet at 5 live video devices; the rest simulate GPS only.

---

## 9. Screens

### 9.1 Video Telematics

Header (vehicle selector; Side-by-side / Front focus / Rear focus; Start Cameras, Save Video, Saved Videos, Reconnect View, Stop Cameras) → status strip (Vehicle, Cameras, GPS, Last Seen) → two video panels with channel badges, refresh, fullscreen → Current Location mini-map + Vehicle Data grid.

**Panel state machine** — get this right and the module is 80% done:

| State | Display | Trigger |
|-------|---------|---------|
| `idle` | Dark panel + Start Stream | Before Start Cameras |
| `connecting` | Spinner, "Connecting…" | Request in flight, < 10s |
| `live` | Video | First frame decoded |
| `degraded` | Video + amber "Last frame 8s ago" | `/health` reports stale frames |
| `reconnecting` | Camera-off icon, last-frame time, Start Stream + Reconnect | > 10s without frames |
| `offline` | "Camera offline" + Retry | Health says offline, or 5 failed attempts |

Backoff: 1s, 2s, 4s, 8s, capped 15s, **stop after 5 attempts** and surface manual Retry. The reference appears to retry forever, which is why those screenshots show a permanently spinning dashboard. **Never let "Reconnecting" be the resting state.**

**Correction to v1:** v1 specced a live "last frame Xs ago" chip while also specifying `<img src>` MJPEG — an `<img>` tag exposes no per-frame events, so that state was unimplementable as written. Resolution: `degraded` is driven by polling `/api/devices/{id}/health` every 3s, which works for both MJPEG dev and WebRTC production.

**Save Video** records server-side from MediaMTX into `video_clips`. No client-side MediaRecorder.

### 9.2 Vehicle Location

Hero band → four counters (Visible, Running, Stationary, Needs Renewal) → left rail (All/Stationary/Running radio, Show Popup Labels, vehicle search) → Leaflet map → fleet cards carousel (plate, status, speed, SIM, last-known, Track).

One filter state drives markers and cards together. Auto-fit bounds **on first load only** — never steal the user's zoom afterwards. (The reference screenshots are zoomed out across Africa and Asia, which is what fit-bounds on bad data looks like.) Show a "Live Feed" indicator that greys out when the socket drops.

**Map tiles:** OSM's public tile servers prohibit heavy/commercial use. Fine for the demo; before any real deployment switch to MapTiler, Stadia, or self-hosted tiles. Put this in the budget conversation now.

### 9.3 Vehicles

Hero band → counters (Total, Licensed, Needs Renewal, Types) → search + status filter → card grid (type illustration, plate, device code, SIM, speed limit, licensed badge, Overview + Edit).

Render `--` for null speed limits. Overview deep-links to Video Telematics with the vehicle preselected. Confirm we own the vehicle-type artwork or source our own icons.

---

## 10. Build order — de-risk first

v1 said build Vehicles first because it's low-risk. **That was backwards.** Two polished screens don't help if week five reveals the video path is impossible.

| Phase | Days | Deliverable | Kill criterion |
|-------|------|-------------|----------------|
| **0. Spike** | 3 | DVR model + protocol identified. One H.264 frame from a non-laptop source through MediaMTX to a browser. Compose skeleton up. | If protocol is undocumented and no unit is available → escalate before Phase 1 |
| **1. Vehicles** | 5 | Schema, migrations, seed (5 vehicles matching the reference), CRUD API, card grid | — |
| **2. Location** | 7 | Agent emits GPS → Redis + Postgres → map, counters, filters, cards, WS push | — |
| **3. Video** | 10 | Agent → MediaMTX → WebRTC in the panel, full state machine, health polling | — |
| **4. Polish** | 5 | Save Video, Saved Videos, single-user JWT, error states, README | — |

~30 working days for Track B assuming Phase 0 lands cleanly. **Track A: skip Phase 0 and most of Phase 3; ~12 days.**

Estimates assume one developer, no DVR procurement delay, and no protocol reverse-engineering. Any of those three slipping moves the whole thing.

---

## 11. Testing

v1 had none.

- **Unit:** status derivation (all four states incl. boundaries), telemetry parsing, backoff logic.
- **Integration:** ingest → Redis → WS delivery; multi-worker fan-out must be explicitly tested (start 2 Uvicorn workers, confirm a viewer on either sees frames).
- **Simulation harness:** the agent gains fault-injection flags — `--drop-frames`, `--stall 20s`, `--jitter`, `--disconnect-every 60s`. Every panel state must be reachable on demand. This is how you test failure without a vehicle.
- **Bandwidth check:** run the agent with `tc` throttling uplink to 1 Mbps before declaring video done. Non-negotiable — it's the only thing standing between a demo and a false sense of completion.
- **Load:** simulate 50 devices emitting GPS; confirm map and API latency targets hold.

---

## 12. Changelog from v1

| v1 claimed | Corrected |
|---|---|
| "Swap webcam for RTSP, zero changes" | False — NAT and binary protocols mean a whole protocol-adapter service is needed (§4) |
| MJPEG is fine for v1 | Dev-only; physically impossible over 4G uplink (§3) |
| Agent POSTs frames to FastAPI | Breaks with >1 worker; Redis + MediaMTX required (§5) |
| `degraded` state via `<img>` | Unimplementable as specced; now health-polled (§9.1) |
| Build Vehicles first | De-risk first: video spike is Phase 0 (§10) |
| `front_channel`/`rear_channel` columns | `device_channels` table — a bike isn't a truck (§6) |
| Scale as an open question | Two designs specified; partition from day one (§8) |
| No NFRs, no dates, no tests | §2, §10, §11 |

---

## 13. v1 done means

- [ ] Phase 0 spike passed, or the blocker escalated in writing
- [ ] `docker compose up` works on a clean machine
- [ ] Three modules render real Postgres data, no mocks
- [ ] Video reaches the browser via MediaMTX over WebRTC, not MJPEG
- [ ] Video path verified under 1 Mbps throttling
- [ ] Fan-out verified with ≥ 2 Uvicorn workers
- [ ] Every panel state reachable via fault-injection flags
- [ ] Simulated GPS moves markers in real time; `stale`/`offline` distinguished
- [ ] README covers setup, the host-vs-container webcam caveat, seeding, and fault injection
```
