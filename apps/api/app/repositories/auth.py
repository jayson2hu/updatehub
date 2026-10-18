from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import AdminSession, AdminUser
from app.models.entities import utcnow


class AuthRepository:
    def __init__(self, db: Session):
        self.db = db

    def by_email(self, email: str):
        return self.db.scalar(select(AdminUser).where(AdminUser.email == email))

    def session(self, token_hash: str):
        return self.db.scalar(select(AdminSession).join(AdminUser).where(AdminSession.token_hash == token_hash, AdminSession.expires_at > utcnow(), AdminUser.is_active.is_(True)))

    def prune_sessions(self):
        self.db.execute(delete(AdminSession).where(AdminSession.expires_at <= utcnow()))
