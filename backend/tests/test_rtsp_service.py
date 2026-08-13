import pytest

from app.services.rtsp_service import RtspValidationError, validate_rtsp_url


def test_validate_rtsp_url_allows_at_in_password():
    url = "rtsp://admin:admin@123@172.17.104.71:554/cam/realmonitor?channel=1&subtype=0"

    assert validate_rtsp_url(url) == url


@pytest.mark.parametrize(
    "url",
    [
        "http://172.17.104.71/stream",
        "rtsp:///cam/realmonitor",
        "rtsp://camera host:554/stream",
        "rtsp://172.17.104.71:bad/stream",
    ],
)
def test_validate_rtsp_url_rejects_invalid_sources(url):
    with pytest.raises(RtspValidationError):
        validate_rtsp_url(url)
