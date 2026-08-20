import pytest

from app.services.camera_source_service import (
    CameraSourceValidationError,
    SOURCE_FORMAT_HLS,
    SOURCE_FORMAT_MJPEG,
    SOURCE_FORMAT_SNAPSHOT,
    SOURCE_FORMAT_DIRECT_VIDEO,
    infer_http_source_format,
    normalize_source_format,
    normalize_source_type,
    validate_camera_source_url,
)


def test_validate_camera_source_url_accepts_rtsp_and_http():
    assert validate_camera_source_url("rtsp://127.0.0.1:554/live", source_type="rtsp") == "rtsp://127.0.0.1:554/live"
    assert validate_camera_source_url("http://camera.local/mjpg/video.mjpg", source_type="http") == "http://camera.local/mjpg/video.mjpg"
    assert validate_camera_source_url("https://camera.local/live.m3u8", source_type="http") == "https://camera.local/live.m3u8"


@pytest.mark.parametrize(
    ("url", "source_type"),
    [
        ("http://camera.local/live", "rtsp"),
        ("rtsp://camera.local/live", "http"),
        ("ftp://camera.local/live", "http"),
        ("http:///missing-host", "http"),
    ],
)
def test_validate_camera_source_url_rejects_wrong_scheme(url, source_type):
    with pytest.raises(CameraSourceValidationError):
        validate_camera_source_url(url, source_type=source_type)


def test_normalize_source_type_can_infer_from_url():
    assert normalize_source_type(None, "rtsp://camera.local/live") == "rtsp"
    assert normalize_source_type(None, "http://camera.local/live") == "http"


def test_normalize_source_format():
    assert normalize_source_format("rtsp", None) == "rtsp"
    assert normalize_source_format("http", None) == "auto"
    assert normalize_source_format("http", "direct-video") == "video"


def test_infer_http_source_format():
    assert infer_http_source_format("http://camera.local/live", "multipart/x-mixed-replace; boundary=frame") == SOURCE_FORMAT_MJPEG
    assert infer_http_source_format("http://camera.local/frame", "image/jpeg") == SOURCE_FORMAT_SNAPSHOT
    assert infer_http_source_format("http://camera.local/live.m3u8", "text/plain") == SOURCE_FORMAT_HLS
    assert infer_http_source_format("http://camera.local/live", "video/mp4") == SOURCE_FORMAT_DIRECT_VIDEO