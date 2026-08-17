# GPS Tracking Link System - Implementation Plan

## 1. Goal

Build a fleet/person tracking system where an administrator creates a trip, generates a secure tracking link, sends it to a driver or tracked person, and receives live GPS updates on a dashboard map.

The first version should prove the full tracking loop:

```text
Admin creates trip
  -> backend generates tracking URL
  -> driver opens URL on phone
  -> driver explicitly starts tracking
  -> browser collects GPS via Geolocation API
  -> backend validates and stores locations
  -> dashboard receives live updates
  -> Google Maps marker moves in real time
```

The system must not depend on extracting GPS data from Google Maps. Google Maps is only the visualization and navigation layer. The tracking client owns GPS collection.

## 2. MVP Scope

Build these first:

1. Vehicle creation and listing.
2. Trip creation, start, and completion.
3. Secure tracking-session generation.
4. Public driver tracking page at `/t/{token}`.
5. Explicit consent and `START TRACKING` flow.
6. Browser GPS collection with `navigator.geolocation.watchPosition`.
7. Adaptive location upload to the Go backend.
8. PostgreSQL persistence for trips, sessions, and location points.
9. Idempotent location ingestion using sequence numbers.
10. WebSocket live updates.
11. Google Maps dashboard marker for latest vehicle location.
12. Session expiration and revocation.

Defer these until the MVP works end to end:

- Redis live-state cache.
- PostGIS geofencing.
- Route replay.
- Alerts.
- Advanced analytics.
- Native Android background tracker.

## 3. Target Architecture

```text
Admin Web Dashboard
        |
        | create vehicle/trip/session
        v
Go Backend API
        |
        | returns secure tracking URL
        v
Driver Phone Browser
        |
        | explicit consent + GPS permission
        v
Tracking Web Page
        |
        | HTTPS location uploads
        v
Go Backend API
        |
        +--> PostgreSQL location history
        |
        +--> WebSocket live event
                 |
                 v
          Fleet Dashboard
                 |
                 v
          Google Maps Marker
```

Recommended stack:

- Backend: Go with Chi.
- Database: PostgreSQL.
- Geospatial readiness: PostGIS later.
- Live updates: WebSocket in MVP.
- Live state cache: Redis after MVP.
- Frontend: React or Next.js for dashboard and tracking page.
- Maps: Google Maps JavaScript API.
- Dashboard auth: JWT or server-side session authentication.

## 4. Tracking Link Design

Tracking links must use cryptographically random tokens:

```text
https://track.yourapp.com/t/7cV9m2QpLx4...
```

Do not expose direct IDs:

```text
/track/1
/track/2
/track/vehicle123
```

Internal lookup:

```text
tracking_token
  -> tracking_session
  -> trip
  -> vehicle
  -> driver
  -> organization
```

Rules:

- Generate tokens with a cryptographically secure random source.
- Store only a token hash in the database.
- Show the raw token only once when creating the tracking URL.
- Validate token status and expiry for every tracking-page request and location upload.
- Support immediate revocation.
- Do not trust `vehicle_id`, `driver_id`, `trip_id`, or `organization_id` from the browser.

## 5. Tracking Session Lifecycle

Use these states:

```text
CREATED
WAITING_FOR_DRIVER
ACTIVE
PAUSED
OFFLINE
COMPLETED
EXPIRED
REVOKED
PERMISSION_DENIED
```

Expected lifecycle:

```text
CREATE SESSION
  -> WAITING_FOR_DRIVER
  -> driver opens link
  -> driver grants GPS permission
  -> ACTIVE
  -> network or GPS issue
  -> OFFLINE
  -> network restored
  -> ACTIVE
  -> trip ends
  -> COMPLETED
```

Important behavior:

- `REVOKED` blocks page access and upload.
- `EXPIRED` blocks upload after `expires_at`.
- `PERMISSION_DENIED` records that the driver denied browser location access.
- `OFFLINE` means updates stopped; it does not mean the vehicle stopped.

## 6. Backend API Design

Use versioned APIs.

### Vehicle APIs

```http
POST /api/v1/vehicles
GET  /api/v1/vehicles
GET  /api/v1/vehicles/{id}
GET  /api/v1/vehicles/{id}/live
GET  /api/v1/vehicles/{id}/history
```

### Trip APIs

```http
POST /api/v1/trips
GET  /api/v1/trips/{id}
POST /api/v1/trips/{id}/start
POST /api/v1/trips/{id}/complete
GET  /api/v1/trips/{id}/route
```

### Tracking Session APIs

```http
POST /api/v1/trips/{id}/tracking-session
GET  /api/v1/tracking/{id}/status
POST /api/v1/tracking/{id}/revoke
POST /api/v1/tracking/{id}/extend
```

### Public Tracking APIs

```http
GET  /t/{token}
POST /api/v1/tracking/location
POST /api/v1/tracking/heartbeat
POST /api/v1/tracking/permission-denied
```

### Live API

```http
GET /api/v1/live
```

The live endpoint upgrades to WebSocket after dashboard authentication.

## 7. Location Payload

Browser request:

```json
{
  "session_token": "7cV9m2QpLx4",
  "installation_id": "a5c821f0-2fd5-4e7b-b9ce-7d1e4e8d9b6d",
  "sequence": 184,
  "latitude": 30.7333,
  "longitude": 76.7794,
  "accuracy": 8.4,
  "speed": 12.8,
  "heading": 87.2,
  "altitude": 317.1,
  "captured_at": "2026-08-17T13:10:20Z"
}
```

Backend derives:

```text
session_id
vehicle_id
trip_id
organization_id
received_at
speed_calculated
quality
```

Use compact field names later only if payload size becomes a measurable problem.

## 8. Database Design

### organizations

```text
id uuid primary key
name text not null
created_at timestamptz not null
```

### users

```text
id uuid primary key
organization_id uuid not null references organizations(id)
name text not null
email text unique
role text not null
created_at timestamptz not null
```

Roles:

```text
ADMIN
MANAGER
DRIVER
VIEWER
```

### vehicles

```text
id uuid primary key
organization_id uuid not null references organizations(id)
registration_no text not null
name text
status text not null
created_at timestamptz not null
unique(organization_id, registration_no)
```

### drivers

```text
id uuid primary key
organization_id uuid not null references organizations(id)
name text not null
phone text
created_at timestamptz not null
```

### trips

```text
id uuid primary key
organization_id uuid not null references organizations(id)
vehicle_id uuid not null references vehicles(id)
driver_id uuid references drivers(id)
status text not null
origin text
destination text
start_time timestamptz
end_time timestamptz
created_at timestamptz not null
```

Trip statuses:

```text
CREATED
ACTIVE
COMPLETED
CANCELLED
```

### tracking_sessions

```text
id uuid primary key
trip_id uuid not null references trips(id)
token_hash text not null unique
installation_id text
status text not null
created_at timestamptz not null
expires_at timestamptz not null
revoked_at timestamptz
last_seen_at timestamptz
```

Session statuses:

```text
CREATED
WAITING_FOR_DRIVER
ACTIVE
PAUSED
OFFLINE
COMPLETED
EXPIRED
REVOKED
PERMISSION_DENIED
```

### location_points

```text
id uuid primary key
session_id uuid not null references tracking_sessions(id)
sequence bigint not null
latitude double precision not null
longitude double precision not null
accuracy double precision
speed_device double precision
speed_calculated double precision
heading double precision
altitude double precision
captured_at timestamptz not null
received_at timestamptz not null
quality text not null
created_at timestamptz not null
unique(session_id, sequence)
```

### audit_logs

```text
id uuid primary key
organization_id uuid references organizations(id)
actor_user_id uuid references users(id)
tracking_session_id uuid references tracking_sessions(id)
event_type text not null
metadata jsonb
created_at timestamptz not null
```

Examples:

```text
TRACKING_SESSION_CREATED
TRACKING_SESSION_REVOKED
TRACKING_SESSION_EXTENDED
TRACKING_STARTED
PERMISSION_DENIED
LOCATION_REJECTED
```

## 9. Location Ingestion Rules

For each `POST /api/v1/tracking/location` request:

1. Hash `session_token`.
2. Load the tracking session by `token_hash`.
3. Reject if missing, expired, revoked, completed, or not allowed.
4. Validate latitude is between `-90` and `90`.
5. Validate longitude is between `-180` and `180`.
6. Validate accuracy is positive if provided.
7. Validate heading is between `0` and `360` if provided.
8. Validate `captured_at` is not too far in the future.
9. Flag, reject, or quarantine points that are too old based on product policy.
10. Insert idempotently using `unique(session_id, sequence)`.
11. Calculate distance and speed from the previous accepted point.
12. Classify quality.
13. Update `tracking_sessions.last_seen_at`.
14. Publish a live WebSocket event.

Duplicate sequence behavior:

- If the same `session_id` and `sequence` already exists, return success without inserting again.
- Do not broadcast duplicate points.

Out-of-order behavior:

- Store valid points when possible.
- Use sequence and timestamp ordering for route history.
- Use only trusted recent points for live state and speed calculations.

## 10. Speed and Quality Rules

Store both:

```text
speed_device
speed_calculated
```

Device speed:

- Comes from `position.coords.speed`.
- May be null.
- Treat as meters per second unless the client explicitly converts it.

Calculated speed:

```text
speed = distance(previous_point, current_point) / elapsed_seconds
```

Quality classification:

```text
accuracy <= 20m       -> GOOD
20m < accuracy <= 50m -> USABLE
50m < accuracy <=100m -> QUESTIONABLE
accuracy > 100m       -> LOW_QUALITY
impossible movement   -> SUSPICIOUS
```

Suspicious movement:

- Check distance and elapsed time.
- Flag speeds above a configurable maximum threshold.
- Keep the raw point for audit/history unless it is structurally invalid.
- Do not let suspicious or low-quality points dominate speed and distance calculations.

## 11. Browser Tracking Page

Route:

```text
/t/{token}
```

Initial page content should include:

```text
LIVE TRACKING

Vehicle: TRUCK-102
Trip: Chandigarh -> Delhi

Your live location will be shared with the fleet operator for the duration of this trip.

[ START TRACKING ]
```

Rules:

- Do not request location permission on page load.
- Request location only after the user clicks `START TRACKING`.
- Use HTTPS in production; browser geolocation does not work reliably on insecure origins.
- Show clear errors for denied permission, unavailable GPS, expired link, and revoked link.
- Generate and store an application-level `installation_id` in browser storage.
- Do not depend on IMEI, MAC address, or hardware IDs.

Frontend state machine:

```text
NOT_STARTED
  -> STARTING
  -> TRACKING
  -> OFFLINE
  -> TRACKING

STARTING
  -> PERMISSION_DENIED

TRACKING
  -> PAUSED
  -> COMPLETED
```

## 12. Browser Location Upload Policy

Do not upload every geolocation callback directly.

Upload when at least one condition is true:

- Elapsed time is at least 5 seconds while moving.
- Distance moved is at least 10 to 20 meters.
- Heading changes significantly.
- Speed changes significantly.
- Stationary heartbeat interval is reached.

Suggested intervals:

```text
Moving:      5-10 seconds
Slow:        10-15 seconds
Stationary:  30-60 seconds
```

Stationary detection:

```text
speed < 2 km/h
and movement < 10m
```

Offline behavior:

- Queue points locally when GPS works but internet is unavailable.
- Preserve sequence numbers.
- Retry queued points when connectivity returns.
- Clear only successfully uploaded points.

## 13. WebSocket Live Updates

Dashboard connection:

```http
GET /api/v1/live
```

Example message:

```json
{
  "type": "vehicle_location",
  "vehicle_id": "TRUCK-102",
  "trip_id": "TRIP-9812",
  "latitude": 30.7333,
  "longitude": 76.7794,
  "speed": 48.2,
  "heading": 86.1,
  "accuracy": 8.4,
  "quality": "GOOD",
  "timestamp": 1786941000
}
```

Rules:

- Authenticate dashboard WebSocket clients.
- Enforce organization-level authorization.
- Broadcast only data the user is allowed to see.
- Move the Google Maps marker on each valid live update.
- Rotate marker using heading when available.

## 14. Live, Stale, Offline, and Stopped

Use `last_seen_at` for tracking freshness:

```text
0-30 seconds      -> LIVE
30 seconds-2 min  -> STALE
more than 2 min   -> OFFLINE
```

Stopped is movement-related:

```text
recent speed < 2 km/h
and recent movement < 10m
and GPS still reporting
```

Do not mark a vehicle as stopped simply because updates disappeared.

## 15. Security and Privacy

Requirements:

- HTTPS only in production.
- Dashboard authentication.
- Server-side authorization and ownership checks.
- Cryptographically random tracking tokens.
- Hash tracking tokens at rest.
- Token expiration.
- Token revocation.
- Rate limiting by session, IP, and installation ID.
- Audit logging for sensitive actions.
- Explicit driver consent before tracking starts.
- No personal or vehicle identifiers exposed in the URL.

Rate limiting:

- Normal tracking sends roughly one update every few seconds.
- Abuse thresholds should allow normal mobile jitter and retries.
- Apply stricter limits to invalid tokens and repeated failures.

Multiple-device policy:

- Default to one active installation per tracking session.
- If a different `installation_id` tries to start an already active session, show "Tracking already active on another device."
- Add transfer tracking later only with explicit admin authorization.

## 16. Google Maps Integration

Google Maps responsibilities:

- Render maps.
- Render vehicle markers.
- Render planned or historical routes later.
- Support driver navigation separately if needed.

System responsibilities:

- Collect GPS.
- Store location history.
- Validate and process location data.
- Calculate speed and quality.
- Broadcast live location.
- Detect geofence and alert events later.

Do not build:

```text
Google Maps -> extract GPS -> backend
```

Build:

```text
Tracking page or native app -> GPS -> backend -> dashboard -> Google Maps
```

## 17. Roadmap

### Phase 1 - Backend Foundation

- Create Go project.
- Add Chi router.
- Add PostgreSQL connection and migrations.
- Implement vehicles, drivers, trips, and tracking sessions.
- Generate secure tokens.
- Store token hashes only.

### Phase 2 - Tracking Page

- Add `/t/{token}` route.
- Show consent and trip summary.
- Add `START TRACKING` button.
- Request GPS permission after user action.
- Start `watchPosition`.
- Generate browser `installation_id`.

### Phase 3 - Location API

- Implement location ingestion.
- Validate token and session.
- Validate coordinates and timestamps.
- Handle sequence numbers and duplicates.
- Store raw location points.
- Calculate speed and quality.

### Phase 4 - Live Dashboard

- Implement WebSocket.
- Add vehicle live endpoint.
- Add dashboard vehicle list.
- Display latest location status.
- Move Google Maps marker in real time.

### Phase 5 - Reliability

- Add offline browser queue.
- Add heartbeat endpoint.
- Add stale/offline detection.
- Add rate limiting.
- Add session expiration job.
- Add revocation handling.

### Phase 6 - Redis and PostGIS

- Store latest live vehicle state in Redis.
- Keep PostgreSQL as source of historical truth.
- Enable PostGIS for distance, geofence, and route queries.

### Phase 7 - Fleet Features

- Route history.
- Route replay.
- Overspeed alerts.
- Long-stop alerts.
- GPS lost alerts.
- Geofence entry and exit events.
- Route deviation detection.
- Trip reports.

### Phase 8 - Native Android Tracker

- Reuse the same backend tracking APIs.
- Add background location support.
- Improve long-duration reliability.
- Support screen-lock tracking.
- Improve battery behavior beyond browser limitations.

## 18. MVP Acceptance Criteria

The MVP is complete when:

1. An admin can create a vehicle.
2. An admin can create a trip for that vehicle.
3. The backend can generate a secure tracking URL.
4. The tracking URL opens a driver page.
5. The driver sees clear consent text.
6. The browser asks for location only after `START TRACKING`.
7. Valid GPS points are sent to the backend.
8. Duplicate sequence uploads do not create duplicate rows.
9. The latest location appears on the dashboard map.
10. WebSocket updates move the marker without page refresh.
11. Revoked links stop accepting uploads.
12. Expired links stop accepting uploads.
13. Permission denial is visible to the driver and recorded by the backend.
14. Offline/stale status is distinct from stopped status.

## 19. Test Plan

Backend tests:

- Create vehicle successfully.
- Create trip successfully.
- Generate tracking session with hashed token.
- Reject invalid, expired, revoked, and completed sessions.
- Accept valid location payload.
- Reject invalid latitude and longitude.
- Flag poor GPS accuracy.
- Flag impossible speed jumps.
- Handle duplicate `session_id + sequence` idempotently.
- Store `captured_at` and `received_at`.
- Update `last_seen_at` on valid upload.
- Broadcast WebSocket event after valid upload.

Frontend tracking tests:

- Page does not request geolocation on load.
- `START TRACKING` requests permission.
- Permission denied shows a useful message.
- GPS unavailable shows waiting/error state.
- Location callbacks are throttled by upload policy.
- Offline points are queued.
- Queued points are retried after reconnect.
- Refresh resumes an active session.

Dashboard tests:

- Vehicle marker appears on Google Maps.
- Marker moves after WebSocket location event.
- Heading rotates marker when heading exists.
- Vehicle status transitions from live to stale to offline.
- Stopped state requires fresh GPS data and low movement.

Security tests:

- Browser-sent vehicle or trip identifiers are ignored.
- Dashboard users cannot view another organization's vehicles.
- Revoked token receives unauthorized/forbidden response.
- Expired token receives unauthorized/forbidden response.
- Invalid-token requests are rate-limited.

## 20. Implementation Defaults

- Use Go + Chi for the API.
- Use PostgreSQL for MVP persistence.
- Design schema so PostGIS can be added without redesigning the domain model.
- Use WebSocket directly in MVP.
- Add Redis only after the basic live path works.
- Use Google Maps JavaScript API for dashboard visualization.
- Keep tracking browser page minimal and mobile-first.
- Use one active browser installation per tracking session by default.
- Treat the tracking session token as the browser tracking authorization mechanism.
- Treat browser `installation_id` as a weak client identifier, not strong authentication.
