import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from datetime import datetime, time, timedelta, timezone

from sqlalchemy.exc import SQLAlchemyError

from app.core.database import SessionLocal
from app.services.analytics import AnalyticsService

logger = logging.getLogger("updatehub")


def purge_expired():
    try:
        with SessionLocal() as db:
            AnalyticsService(db).purge()
    except SQLAlchemyError:
        # /ready separately reports unmigrated databases. Startup and the daily
        # task must not print database URLs or private query text on failure.
        logger.warning("daily analytics retention unavailable; check database readiness")


async def daily_retention():
    while True:
        now = datetime.now(timezone.utc)
        midnight = datetime.combine(now.date() + timedelta(days=1), time.min, tzinfo=timezone.utc)
        await asyncio.sleep((midnight - now).total_seconds())
        await asyncio.to_thread(purge_expired)


@asynccontextmanager
async def lifespan(app):
    await asyncio.to_thread(purge_expired)
    task = asyncio.create_task(daily_retention())
    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
