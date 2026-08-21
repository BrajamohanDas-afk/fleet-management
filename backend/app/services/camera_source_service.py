from urllib.parse import SplitResult, urlsplit

import httpx


class CameraSourceValidationError(ValueError):
    pass


SOURCE_TYPE_RTSP = "rtsp"
SOURCE_TYPE_HTTP = "http"

SOURCE_FORMAT_RTSP = "rtsp"
SOURCE_FORMAT_AUTO = "auto"
SOURCE_FORMAT_MJPEG = "mjpeg"
SOURCE_FORMAT_SNAPSHOT = "snapshot"
SOURCE_FORMAT_HLS = "hls"
SOURCE_FORMAT_DIRECT_VIDEO = "video"
SOURCE_FORMAT_WHEP = "whep"

HTTP_SOURCE_FORMATS = {
    SOURCE_FORMAT_AUTO,
    SOURCE_FORMAT_MJPEG,
    SOURCE_FORMAT_SNAPSHOT,
    SOURCE_FORMAT_HLS,
    SOURCE_FORMAT_DIRECT_VIDEO,
    SOURCE_FORMAT_WHEP,
}


def _parse_url(value: str) -> SplitResult:
    try:
        parsed = urlsplit(value)
        _ = parsed.port
    except ValueError as exc:
        raise CameraSourceValidationError("Camera URL has an invalid host or port") from exc
    return parsed


def normalize_source_type(value: str | None, url: str) -> str:
    source_type = (value or "").strip().lower()
    if not source_type:
        scheme = _parse_url(url).scheme.lower()
        source_type = SOURCE_TYPE_RTSP if scheme == "rtsp" else SOURCE_TYPE_HTTP

    if source_type not in {SOURCE_TYPE_RTSP, SOURCE_TYPE_HTTP}:
        raise CameraSourceValidationError("Camera source type must be rtsp or http")
    return source_type


def normalize_source_format(source_type: str, value: str | None) -> str:
    source_format = (value or "").strip().lower().replace("-", "_")
    if source_format == "direct_video":
        source_format = SOURCE_FORMAT_DIRECT_VIDEO

    if source_type == SOURCE_TYPE_RTSP:
        if source_format and source_format not in {SOURCE_FORMAT_RTSP, SOURCE_FORMAT_AUTO}:
            raise CameraSourceValidationError("RTSP cameras must use rtsp source format")
        return SOURCE_FORMAT_RTSP

    if not source_format:
        return SOURCE_FORMAT_AUTO
    if source_format not in HTTP_SOURCE_FORMATS:
        raise CameraSourceValidationError(
            "HTTP camera source format must be auto, mjpeg, snapshot, hls, video, or whep"
        )
    return source_format


def validate_camera_source_url(
    value: str,
    *,
    source_type: str | None = None,
) -> str:
    url = value.strip()
    if not url:
        raise CameraSourceValidationError("Camera URL is required")
    if any(ch.isspace() or ord(ch) < 32 for ch in url):
        raise CameraSourceValidationError("Camera URL must not contain spaces")

    parsed = _parse_url(url)
    normalized_type = normalize_source_type(source_type, url)
    scheme = parsed.scheme.lower()
    if normalized_type == SOURCE_TYPE_RTSP and scheme != "rtsp":
        raise CameraSourceValidationError("RTSP camera URL must start with rtsp://")
    if normalized_type == SOURCE_TYPE_HTTP and scheme not in {"http", "https"}:
        raise CameraSourceValidationError("HTTP camera URL must start with http:// or https://")
    if not parsed.netloc or not parsed.hostname:
        raise CameraSourceValidationError("Camera URL must include a host")

    return url


def infer_http_source_format(url: str, content_type: str | None = None) -> str:
    media_type = (content_type or "").split(";", 1)[0].strip().lower()
    path = urlsplit(url).path.lower()

    if media_type == "multipart/x-mixed-replace":
        return SOURCE_FORMAT_MJPEG
    if media_type.startswith("image/"):
        return SOURCE_FORMAT_SNAPSHOT
    if media_type in {"application/vnd.apple.mpegurl", "application/x-mpegurl", "audio/mpegurl"} or path.endswith(".m3u8"):
        return SOURCE_FORMAT_HLS
    if path.endswith("/whep") or path.endswith(".whep"):
        return SOURCE_FORMAT_WHEP
    if media_type.startswith("video/"):
        return SOURCE_FORMAT_DIRECT_VIDEO
    if path.endswith((".mjpg", ".mjpeg")):
        return SOURCE_FORMAT_MJPEG
    if path.endswith((".jpg", ".jpeg", ".png", ".webp", ".gif")):
        return SOURCE_FORMAT_SNAPSHOT
    if path.endswith((".mp4", ".webm", ".mov", ".m4v", ".ogg", ".ts")):
        return SOURCE_FORMAT_DIRECT_VIDEO
    return SOURCE_FORMAT_AUTO


async def probe_http_camera_source(url: str) -> tuple[str, str | None]:
    detected_from_url = infer_http_source_format(url)
    if detected_from_url == SOURCE_FORMAT_WHEP:
        return SOURCE_FORMAT_WHEP, None

    timeout = httpx.Timeout(connect=5.0, read=5.0, write=5.0, pool=5.0)
    headers = {
        "Accept": "multipart/x-mixed-replace,image/*,video/*,application/vnd.apple.mpegurl,*/*;q=0.8",
        "User-Agent": "VLC media player",
    }
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        try:
            async with client.stream("GET", url, headers=headers) as streamed:
                status_code = streamed.status_code
                content_type = streamed.headers.get("content-type")
                final_url = str(streamed.url)
            if status_code >= 400 or not content_type:
                response = await client.head(url, headers=headers)
                status_code = response.status_code
                content_type = response.headers.get("content-type")
                final_url = str(response.url)
        except httpx.HTTPError as exc:
            raise CameraSourceValidationError(f"HTTP camera URL is not reachable: {exc}") from exc

    if status_code >= 400:
        raise CameraSourceValidationError(f"HTTP camera URL returned status {status_code}")

    detected_format = infer_http_source_format(final_url, content_type)
    if detected_format == SOURCE_FORMAT_AUTO:
        return detected_format, "HTTP URL is reachable, but the media format could not be detected"
    return detected_format, None

def is_rtsp_source(source_type: str | None) -> bool:
    return (source_type or SOURCE_TYPE_RTSP).lower() == SOURCE_TYPE_RTSP
