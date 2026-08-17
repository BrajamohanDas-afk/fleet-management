# Windows VM Same-Network Hosting Guide

This guide is for hosting the fleet management app on a Windows VM so other users on the same LAN/Wi-Fi can open it from their browsers.

Your current VM IP:

```text
172.17.105.187
```

Users on the same network should open:

```text
http://172.17.105.187:5173
```

## How The Network Works

When someone opens the app from another laptop on the same network:

```text
User browser -> http://172.17.105.187:5173
Frontend -> http://172.17.105.187:8000/api
API container -> database, Redis, MediaMTX, Traccar, cameras
```

Do not give users a `localhost` URL. `localhost` means their own laptop, not the VM.

## Requirements

- Docker Desktop installed and running on the Windows VM.
- Project code copied/cloned on the Windows VM.
- Users and the VM are on the same network.
- Cameras/DVRs are reachable from the Windows VM and from Docker containers.
- PowerShell access on the VM.
- Administrator PowerShell access for firewall rules.

## 1. Confirm The VM IP

Run this on the Windows VM:

```powershell
ipconfig
```

Find the active Ethernet/Wi-Fi adapter. In your current setup:

```text
IPv4 Address: 172.17.105.187
Default Gateway: 172.17.104.1
```

If the VM IP changes later, replace every `172.17.105.187` in this guide with the new IP.

## 2. Go To The Project Folder

Run PowerShell and go to the folder that contains `docker-compose.yml`.

Example:

```powershell
cd "C:\MyFile\Study material\fleet management"
```

Check that Docker Compose can see the project:

```powershell
docker compose ps
```

If you see this error:

```text
no configuration file provided: not found
```

you are in the wrong folder. Run `cd` into the project folder first.

## 3. Configure Docker Desktop Network

Open Docker Desktop:

```text
Settings -> Docker Engine
```

Use this JSON:

```json
{
  "bip": "10.239.0.1/24",
  "builder": {
    "gc": {
      "defaultKeepStorage": "20GB",
      "enabled": true
    }
  },
  "default-address-pools": [
    {
      "base": "10.240.0.0/16",
      "size": 24
    },
    {
      "base": "10.241.0.0/16",
      "size": 24
    }
  ],
  "experimental": false
}
```

Click:

```text
Apply & restart
```

This avoids Docker using the same `172.17.x.x` range as your LAN/camera network.

## 4. Set The Frontend API URL

Open `docker-compose.yml`.

Find this under the `frontend` service:

```yaml
environment:
  VITE_API_URL: http://localhost:8000/api
```

Change it to:

```yaml
environment:
  VITE_API_URL: http://172.17.105.187:8000/api
```

This is required because other users' browsers must call the API on the VM, not on their own `localhost`.

Also find these API environment values:

```yaml
MEDIAMTX_PUBLIC_HOST: localhost
TRACCAR_PUBLIC_URL: http://localhost:8082
TRACCAR_CLIENT_PUBLIC_URL: http://localhost:5055
PUBLIC_SHARE_BASE_URL: http://localhost:5173
```

For same-network access, change them to:

```yaml
MEDIAMTX_PUBLIC_HOST: 172.17.105.187
TRACCAR_PUBLIC_URL: http://172.17.105.187:8082
TRACCAR_CLIENT_PUBLIC_URL: http://172.17.105.187:5055
PUBLIC_SHARE_BASE_URL: http://172.17.105.187:5173
```

## 5. Open Windows Firewall Ports

Open PowerShell as Administrator.

Run:

```powershell
New-NetFirewallRule -DisplayName "Fleet Frontend 5173" -Direction Inbound -Protocol TCP -LocalPort 5173 -Action Allow
New-NetFirewallRule -DisplayName "Fleet API 8000" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
New-NetFirewallRule -DisplayName "Fleet Traccar 8082" -Direction Inbound -Protocol TCP -LocalPort 8082 -Action Allow
New-NetFirewallRule -DisplayName "Fleet Traccar Client 5055" -Direction Inbound -Protocol TCP -LocalPort 5055 -Action Allow
New-NetFirewallRule -DisplayName "Fleet MediaMTX WHEP 8890" -Direction Inbound -Protocol TCP -LocalPort 8890 -Action Allow
New-NetFirewallRule -DisplayName "Fleet MediaMTX API 8889" -Direction Inbound -Protocol TCP -LocalPort 8889 -Action Allow
New-NetFirewallRule -DisplayName "Fleet MediaMTX RTSP 8554" -Direction Inbound -Protocol TCP -LocalPort 8554 -Action Allow
New-NetFirewallRule -DisplayName "Fleet Protocol TCP 9000" -Direction Inbound -Protocol TCP -LocalPort 9000 -Action Allow
```

For only dashboard access, ports `5173` and `8000` are the minimum. For live video, tracking, and device integrations, keep the additional rules.

## 6. Start Everything

From the project folder:

```powershell
docker compose down
docker compose up -d --build
docker compose run --rm api alembic upgrade head
```

Optional seed data:

```powershell
docker compose run --rm api python -m app.seed
```

## 7. Verify The Stack

Check containers:

```powershell
docker compose ps
```

Expected containers:

```text
fleet-api
fleet-frontend
fleet-db
fleet-redis
fleet-mediamtx
fleet-protocol-layer
fleet-traccar
fleet-traccar-db
```

Check frontend from the VM:

```powershell
Invoke-WebRequest -Uri http://localhost:5173 -UseBasicParsing -TimeoutSec 15
```

Check API from the VM:

```powershell
Invoke-WebRequest -Uri http://localhost:8000/api/vehicles -UseBasicParsing -TimeoutSec 15
```

Both should return HTTP `200`.

## 8. Test From Another Laptop

From another laptop on the same network, open:

```text
http://172.17.105.187:5173
```

If it does not open, test from that laptop:

```powershell
Test-NetConnection 172.17.105.187 -Port 5173
Test-NetConnection 172.17.105.187 -Port 8000
```

Both should show:

```text
TcpTestSucceeded : True
```

## 9. Add A Vehicle And Camera

Use values like these for testing:

```text
Device serial: VH001
SIM number: 9999999999
```

For your RTSP camera, use the encoded password form because the password contains `@`:

```text
rtsp://admin:admin%40123@172.17.104.70:554/cam/realmonitor?channel=1&subtype=0
```

Check camera reachability from inside the API container:

```powershell
docker compose exec api python -c "import socket; s=socket.socket(); s.settimeout(8); print(s.connect_ex(('172.17.104.70',554))); s.close()"
```

Expected output:

```text
0
```

`0` means the API container can reach the camera RTSP port.

## 10. Common Problems

### Other users see the frontend but actions fail

The frontend is probably still using `localhost` for the API.

Check `docker-compose.yml`:

```yaml
VITE_API_URL: http://172.17.105.187:8000/api
```

Then rebuild:

```powershell
docker compose up -d --build
```

### API returns Internal Server Error after restart

Run migrations:

```powershell
docker compose run --rm api alembic upgrade head
```

### `docker compose ps` says no configuration file

You are not in the project folder.

Run:

```powershell
cd "C:\MyFile\Study material\fleet management"
docker compose ps
```

### Camera RTSP says not reachable

Check from Windows:

```powershell
Test-NetConnection 172.17.104.70 -Port 554
```

Check from the API container:

```powershell
docker compose exec api python -c "import socket; s=socket.socket(); s.settimeout(8); print(s.connect_ex(('172.17.104.70',554))); s.close()"
```

If Windows works but Docker fails, check Docker Engine networking and make sure it is not using the `172.17.x.x` range.

### Docker containers are running but users cannot access the VM

Check Windows firewall:

```powershell
Get-NetFirewallProfile | Select-Object Name,Enabled
```

Then add the firewall rules from step 5 using Administrator PowerShell.

## 11. Useful URLs

From the VM:

```text
Frontend: http://localhost:5173
API: http://localhost:8000
Traccar: http://localhost:8082
```

From another laptop on the same network:

```text
Frontend: http://172.17.105.187:5173
API: http://172.17.105.187:8000
Traccar: http://172.17.105.187:8082
```

## Security Notes

This setup is for same-network testing/demo use.

Before internet/public hosting:

- Change default passwords and secrets.
- Use HTTPS.
- Put the app behind a reverse proxy.
- Restrict allowed origins/CORS.
- Lock down database, Redis, MediaMTX, and Traccar ports.
- Do not expose development credentials publicly.
