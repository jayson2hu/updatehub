import argparse
import getpass
import re

from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.core.security import password_hasher
from app.models import AdminUser
from app.seed import seed
from app.seed_updates import seed_updates
from app.seed_content import seed_content
from app.seed_station import seed_station
from app.services.analytics import AnalyticsService
from app.services.catalog import CatalogService


def main():
    parser = argparse.ArgumentParser(description="UpdateHub maintenance commands; run Alembic migrations first.")
    parser.add_argument("command", choices=["seed", "seed-updates", "seed-content", "seed-station", "purge-analytics", "create-admin"])
    parser.add_argument("--all", action="store_true", help="With purge-analytics, remove all aggregate counters instead of only expired days")
    args = parser.parse_args()
    if args.all and args.command != "purge-analytics":
        parser.error("--all is only supported by purge-analytics")
    with SessionLocal() as db:
        if args.command == "seed-station":
            print(f"Created station examples: {seed_station(db)}. All download links are intentionally unconfigured. Existing content was preserved.")
            return
        if args.command == "seed":
            print(f"Created {seed(db)} demo software records and seeded eligible demo announcements. Existing records were preserved.")
            return
        if args.command == "seed-updates":
            print(f"Created {seed_updates(db)} demo announcements. Existing announcements were preserved.")
            return
        if args.command == "seed-content":
            print(f"Created and published {seed_content(db)} demo guides, FAQ and collections. Existing content was preserved.")
            return
        if args.command == "purge-analytics":
            print(f"Removed {AnalyticsService(db).purge(all_data=args.all)} aggregate rows.")
            return
        settings = get_settings()
        email = settings.admin_initial_email.strip().casefold() or input("Admin email: ").strip().casefold()
        password = settings.admin_initial_password or getpass.getpass("Admin password (12+ characters): ")
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email) or len(email) > 254:
            parser.error("A valid admin email is required")
        if not 12 <= len(password) <= 1024:
            parser.error("Admin password must contain 12–1024 characters")
        if db.scalar(select(AdminUser.id).where(AdminUser.email == email)):
            parser.error("This administrator already exists; credentials were not modified")
        admin = AdminUser(email=email, password_hash=password_hasher.hash(password))
        db.add(admin)
        db.flush()
        CatalogService(db).audit(admin.id, "create", "admin_user", admin.id, after={"email": admin.email, "is_active": True})
        db.commit()
        print("Administrator created. No password was stored in plaintext.")


if __name__ == "__main__":
    main()
