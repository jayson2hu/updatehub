import secrets
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import SESSION_COOKIE, check_origin
from app.models import AdminSession
from app.services.auth import AuthService

Database = Annotated[Session, Depends(get_db)]


def require_admin(request: Request, db: Database) -> AdminSession:
    return AuthService(db).authenticate(request.cookies.get(SESSION_COOKIE))


CurrentAdmin = Annotated[AdminSession, Depends(require_admin)]


def require_csrf(request: Request, session: CurrentAdmin) -> AdminSession:
    check_origin(request)
    csrf = request.headers.get("x-csrf-token", "")
    if not secrets.compare_digest(csrf, session.csrf_token):
        raise HTTPException(403, "安全校验失败，请刷新页面后重试")
    return session


WriteAdmin = Annotated[AdminSession, Depends(require_csrf)]
