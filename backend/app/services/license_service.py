from datetime import date, timedelta


def needs_renewal(expiry: date | None) -> bool:
    """Return True if the license is expired or expires within 30 days.

    Unknown expiry (None) does not trigger renewal.
    """
    if expiry is None:
        return False

    today = date.today()
    return expiry < today or expiry <= today + timedelta(days=30)
