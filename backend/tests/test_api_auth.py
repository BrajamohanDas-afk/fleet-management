from app.core.config import settings


async def test_login_uses_configured_admin_credentials(client, monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_USERNAME", "dispatcher")
    monkeypatch.setattr(settings, "ADMIN_PASSWORD", "FleetPass@2026")

    response = await client.post(
        "/api/auth/login",
        json={"username": "dispatcher", "password": "FleetPass@2026"},
    )

    assert response.status_code == 200
    assert response.json()["token_type"] == "bearer"
    assert response.json()["access_token"]


async def test_login_rejects_wrong_configured_password(client, monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_USERNAME", "dispatcher")
    monkeypatch.setattr(settings, "ADMIN_PASSWORD", "FleetPass@2026")

    response = await client.post(
        "/api/auth/login",
        json={"username": "dispatcher", "password": "admin"},
    )

    assert response.status_code == 401
