from urllib.parse import SplitResult, urlsplit


class RtspValidationError(ValueError):
    pass


def _parse_rtsp_url(value: str) -> SplitResult:
    try:
        parsed = urlsplit(value)
        _ = parsed.port
    except ValueError as exc:
        raise RtspValidationError("Camera URL has an invalid host or port") from exc
    return parsed


def validate_rtsp_url(value: str) -> str:
    url = value.strip()
    if not url:
        raise RtspValidationError("Camera URL is required")
    if any(ch.isspace() or ord(ch) < 32 for ch in url):
        raise RtspValidationError("Camera URL must not contain spaces")

    parsed = _parse_rtsp_url(url)
    if parsed.scheme.lower() != "rtsp":
        raise RtspValidationError("Camera URL must start with rtsp://")
    if not parsed.netloc or not parsed.hostname:
        raise RtspValidationError("Camera URL must include a host")

    return url


def mask_rtsp_url(value: str) -> str:
    try:
        parsed = _parse_rtsp_url(value.strip())
    except RtspValidationError:
        return "rtsp://***"

    if parsed.username is None and parsed.password is None:
        return value

    user = parsed.username or ""
    host = parsed.hostname or ""
    port = f":{parsed.port}" if parsed.port else ""
    auth = f"{user}:***@" if user else "***@"
    return f"{parsed.scheme}://{auth}{host}{port}{parsed.path}" + (
        f"?{parsed.query}" if parsed.query else ""
    )
