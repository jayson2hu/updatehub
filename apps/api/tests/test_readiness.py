import pytest
from sqlalchemy import text


@pytest.mark.parametrize("change", [
    "UPDATE alembic_version SET version_num = 'old_schema'",
    "DELETE FROM alembic_version",
    "DROP TABLE alembic_version",
])
def test_readiness_rejects_missing_or_outdated_schema(client, database, change):
    assert client.get("/ready").status_code == 200
    with database() as db:
        db.execute(text(change))
        db.commit()
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/ready").status_code == 503
    assert client.get("/api/v1/ready").status_code == 503
