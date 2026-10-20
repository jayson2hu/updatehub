"""Signed, client-held vote receipts. No persistent visitor identifier."""
import base64
import hashlib
import hmac
import json
import secrets

from fastapi import HTTPException

from app.core.config import get_settings


def signing_key():
    settings = get_settings()
    if settings.station_signing_key:
        return settings.station_signing_key.encode()
    # Development only. Kept beside the persistent database/uploads and included
    # in backups so a restart does not invalidate local vote corrections.
    path = settings.upload_dir.parent / "station-signing.key"
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open("x", encoding="ascii") as file:
            file.write(secrets.token_hex(32))
    except FileExistsError:
        pass
    return path.read_text(encoding="ascii").strip().encode()


def encode_receipt(payload):
    raw = json.dumps({**payload, "nonce": secrets.token_urlsafe(18)}, separators=(",", ":")).encode()
    part = base64.urlsafe_b64encode(raw).decode().rstrip("=")
    signature = hmac.new(signing_key(), part.encode(), hashlib.sha256).hexdigest()
    return part + "." + signature


def decode_receipt(token):
    try:
        part, signature = token.split(".", 1)
        expected = hmac.new(signing_key(), part.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, signature):
            raise ValueError()
        value = json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))
        if not isinstance(value, dict) or value.get("verdict") not in {"ok", "issue"}:
            raise ValueError()
        return value
    except (ValueError, KeyError, TypeError):
        raise HTTPException(422, "反馈凭据无效，请刷新页面后重试") from None
