from app.services.traccar_service import normalize_position


def test_normalize_traccar_position_converts_knots_and_attributes():
    point = normalize_position(
        {
            "deviceId": 42,
            "latitude": 17.4,
            "longitude": 78.5,
            "speed": 10,
            "course": 180,
            "deviceTime": "2026-08-13T07:00:00Z",
            "attributes": {"ignition": "false"},
        }
    )
    assert point is not None
    assert point["external_device_id"] == 42
    assert point["speed_kmh"] == 18.52
    assert point["heading_deg"] == 180
    assert point["ignition_on"] is False


def test_normalize_traccar_position_rejects_incomplete_fix():
    assert normalize_position({"deviceId": 42, "latitude": 17.4}) is None
