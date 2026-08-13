# Phone tracking with Traccar

The dashboard accepts GPS data from a phone through the self-hosted Traccar
service. It does not parse WhatsApp live-location URLs; those URLs are viewer
links, not a stable GPS data API.

## Local setup

```powershell
docker compose up -d --build
docker compose run --rm api alembic upgrade head
```

| Service | Address |
| --- | --- |
| Traccar web/API | `http://localhost:8082` |
| Traccar Client upload | `http://localhost:5055` |
| Dashboard | `http://localhost:5173` |
| Fleet API | `http://localhost:8000` |

From a phone on the same Wi-Fi, replace `localhost` with the laptop's LAN IP,
such as `http://192.168.1.20:5055` for the Traccar Client app. `localhost` on
the phone means the phone itself, not the laptop.

## Connect a phone

1. Install the native Traccar Client app.
2. In Fleet → Vehicles, create the vehicle and choose **Tracker**.
3. Copy the generated device identifier and Traccar Client URL.
4. In Traccar Client, set the server URL to `http://<laptop-lan-ip>:5055`
   and enter the identifier.
5. Grant precise location permission, allow background location, and disable
   battery optimization for Traccar Client where required.
6. Start tracking. The dashboard changes from “Waiting for first location” to
   connected after the first valid position is imported.

The backend polls Traccar every 10 seconds and sends positions through the
same telemetry service used by the simulator. A browser-only tracker is not
used for reliable background tracking because mobile browsers may suspend it.

The URL shown by the pairing dialog is the externally reachable URL. In a
local setup, replace `localhost` with the laptop LAN IP before entering it on
the phone. The API's internal `TRACCAR_URL` is only used by the Docker network.

## Production deployment

Run Traccar and the fleet stack on a public VPS or private network with a DNS
name, HTTPS reverse proxy, firewall rules for only the required device protocol
ports, separate PostgreSQL credentials/backups for `traccar-db`, rotated
secrets, restricted CORS, and a public share base URL matching the dashboard's
HTTPS domain. Keep Traccar's database separate from the fleet database.
