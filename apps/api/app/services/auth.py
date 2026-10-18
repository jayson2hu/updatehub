import secrets
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import hash_token, password_hasher, verify_password
from app.models import AdminSession
from app.models.entities import utcnow
from app.repositories.auth import AuthRepository
from app.services.catalog import CatalogService


class AuthService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = AuthRepository(db)

    def login(self, email: str, password: str):
        user = self.repo.by_email(email)
        valid = verify_password(password, user.password_hash if user else None)
        if not user or not valid or not user.is_active:
            raise HTTPException(401, "邮箱或密码不正确")
        if password_hasher.check_needs_rehash(user.password_hash):
            user.password_hash = password_hasher.hash(password)
        self.repo.prune_sessions()
        token = secrets.token_urlsafe(32)
        session = AdminSession(token_hash=hash_token(token), csrf_token=secrets.token_hex(32), admin_user_id=user.id, expires_at=utcnow() + timedelta(hours=get_settings().session_ttl_hours))
        user.last_login_at = utcnow()
        self.db.add(session)
        CatalogService(self.db).audit(user.id, "login", "admin_user", user.id)
        self.db.commit()
        return user, session, token

    def authenticate(self, token: str | None):
        if not token or len(token) > 128:
            raise HTTPException(401, "请先登录管理后台")
        session = self.repo.session(hash_token(token))
        if session is None:
            raise HTTPException(401, "登录已过期，请重新登录")
        return session

    def logout(self, session: AdminSession):
        CatalogService(self.db).audit(session.admin_user_id, "logout", "admin_user", session.admin_user_id)
        self.db.delete(session)
        self.db.commit()
