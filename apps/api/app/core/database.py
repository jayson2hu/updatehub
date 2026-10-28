from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


def build_engine(url: str):
    engine = create_engine(url, pool_pre_ping=True, connect_args={"check_same_thread": False, "timeout": 5} if url.startswith("sqlite") else {})
    if url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def sqlite_pragmas(connection, _):
            # WAL lets readers proceed during a write; busy_timeout queues writers
            # instead of failing. pysqlite starts a transaction only at the first
            # write, so read-then-write requests do not hit lock-upgrade deadlocks.
            connection.execute("PRAGMA foreign_keys=ON")
            connection.execute("PRAGMA busy_timeout=5000")
            if connection.execute("PRAGMA journal_mode").fetchone()[0] != "memory":
                connection.execute("PRAGMA journal_mode=WAL")
                connection.execute("PRAGMA synchronous=NORMAL")
    return engine


engine = build_engine(get_settings().database_url)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_db():
    with SessionLocal() as db:
        yield db
