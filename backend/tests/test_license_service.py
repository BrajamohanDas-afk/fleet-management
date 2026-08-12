from datetime import date, timedelta

import pytest

from app.services.license_service import needs_renewal


def today() -> date:
    return date.today()


@pytest.mark.parametrize(
    "expiry,expected",
    [
        (None, False),
        (today() - timedelta(days=1), True),
        (today(), True),
        (today() + timedelta(days=29), True),
        (today() + timedelta(days=30), True),
        (today() + timedelta(days=31), False),
        (today() + timedelta(days=90), False),
    ],
)
def test_needs_renewal(expiry, expected):
    assert needs_renewal(expiry) is expected
