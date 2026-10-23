"""Guards for a public deployment.

Both are off unless their env var is set, so local development is unchanged.

- ADMIN_TOKEN: when set, starting a data pipeline or a backtest requires the
  header ``X-Admin-Token: <ADMIN_TOKEN>``. These spend API quota and LLM credits
  in bulk, so visitors can view their results but not start them.
- ANALYSIS_DAILY_LIMIT: when set, caps how many matchup analyses run per UTC day
  across all visitors. Each analysis is a handful of LLM calls.
"""

from __future__ import annotations

import os
import threading
from datetime import datetime, timezone

from fastapi import Header, HTTPException

_lock = threading.Lock()
_analysis_day: str | None = None
_analysis_count = 0


def require_admin(x_admin_token: str | None = Header(default=None)) -> None:
    token = os.getenv("ADMIN_TOKEN")
    if token and x_admin_token != token:
        raise HTTPException(
            status_code=403,
            detail="This demo shows saved results; starting new runs is turned off.",
        )


def count_analysis() -> None:
    """Count one analysis toward today's cap, or refuse it once the cap is reached."""
    global _analysis_day, _analysis_count
    limit = os.getenv("ANALYSIS_DAILY_LIMIT")
    if not limit:
        return
    today = datetime.now(timezone.utc).date().isoformat()
    with _lock:
        if _analysis_day != today:
            _analysis_day, _analysis_count = today, 0
        if _analysis_count >= int(limit):
            raise HTTPException(
                status_code=429,
                detail="Today's analyses for this demo are used up. Please try again tomorrow.",
            )
        _analysis_count += 1
