import hashlib
import secrets
import threading
import time
from collections import OrderedDict, deque

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import HTTPException, Request

from app.core.config import get_settings

password_hasher = PasswordHasher()
_dummy_hash = password_hasher.hash(secrets.token_urlsafe(32))
SESSION_COOKIE = "updatehub_session"


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def verify_password(password: str, password_hash: str | None) -> bool:
    try:
        return password_hasher.verify(password_hash or _dummy_hash, password) and password_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def check_origin(request: Request):
    origin = request.headers.get("origin")
    if origin and origin.rstrip("/") not in get_settings().allowed_origins:
        raise HTTPException(status_code=403, detail="请求来源不受信任")
    if request.headers.get("sec-fetch-site") == "cross-site":
        raise HTTPException(status_code=403, detail="不允许跨站管理请求")


class WindowRateLimiter:
    """Bounded in-process limiter. Deploy one API worker; shared store in later phases."""
    def __init__(self, limit=10, seconds=900, max_keys=10000):
        self.limit, self.seconds, self.max_keys = limit, seconds, max_keys
        self.entries: OrderedDict[str, deque[float]] = OrderedDict()
        self.lock = threading.Lock()

    def hit(self, key: str):
        now = time.monotonic()
        with self.lock:
            while self.entries:
                first_key, first = next(iter(self.entries.items()))
                if first and first[-1] > now - self.seconds:
                    break
                del self.entries[first_key]
            times = self.entries.get(key)
            if times is None:
                if len(self.entries) >= self.max_keys:
                    # Fail closed instead of evicting active throttles under load.
                    raise HTTPException(429, "请求过于频繁，请稍后重试", headers={"Retry-After": str(self.seconds)})
                times = self.entries[key] = deque()
            while times and times[0] <= now - self.seconds:
                times.popleft()
            self.entries.move_to_end(key)
            if len(times) >= self.limit:
                raise HTTPException(429, "尝试过于频繁，请稍后重试", headers={"Retry-After": str(self.seconds)})
            times.append(now)


login_limiter = WindowRateLimiter()
public_limiter = WindowRateLimiter(limit=180, seconds=60)
# Anonymous station writes (docs/v4/adr/0005). IPs live only in memory as keys.
station_feedback_limiter = WindowRateLimiter(limit=20, seconds=3600)
station_events_limiter = WindowRateLimiter(limit=240, seconds=60)
station_sync_create_limiter = WindowRateLimiter(limit=10, seconds=3600)
station_sync_restore_limiter = WindowRateLimiter(limit=30, seconds=3600)
STATION_LIMITERS = (station_feedback_limiter, station_events_limiter, station_sync_create_limiter, station_sync_restore_limiter)


def request_client_key(request: Request) -> str:
    # Forwarded headers are only trusted by Uvicorn from configured proxy IPs.
    return request.client.host if request.client else "unknown"
