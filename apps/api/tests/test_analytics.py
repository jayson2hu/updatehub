from datetime import timedelta
from unittest.mock import patch

import pytest
from sqlalchemy import inspect, select
from sqlalchemy.exc import OperationalError

from app.core.security import public_limiter
from app.models import AnalyticsDaily
from app.models.entities import utcnow
from app.schemas.analytics import SearchEvent
from app.services.analytics import AnalyticsService, HIDDEN_QUERY, safe_query
from test_content import draft, publish, software


@pytest.mark.parametrize("query", ["person@example.com", "https://example.com/private", "127.0.0.1", "2001:db8::1", "138 0013 8000", "身份证 123456789012345678", "password secret", "sk-abcdefghijklmnopqrstuvwxy", "a" * 81, "hello\x00world", "a3a4dba5-ccb0-40b3-b8f6-d17c18ef5321"])
def test_sensitive_search_formats_never_persist(query):
    assert safe_query(query) == HIDDEN_QUERY


def test_ordinary_unknown_phrases_remain_actionable():
    assert safe_query("  ＶＳ  Code ") == "vs code"
    assert safe_query("找个截图工具") == "找个截图工具"
    assert safe_query("Python 3.14") == "python 3.14"


def test_aggregates_real_events_only_no_request_identifiers(admin, database):
    app = software(admin)
    # Public GETs, including SSR/prefetch-like traffic, never count searches.
    for _ in range(3):
        admin.get("/api/v1/search?q=编辑器")
    payload = {"event": "search", "query": "未知截图工具", "result_count": 0, "scope": "software"}
    assert admin.post("/api/v1/analytics/events", json=payload).status_code == 204
    assert admin.post("/api/v1/analytics/events", json=payload).status_code == 204
    assert admin.post("/api/v1/analytics/events", json={**payload, "query": "person@example.com", "result_count": 1}).status_code == 204
    link_id = app["official_links"][0]["id"]
    assert admin.get(f"/go/{link_id}", follow_redirects=False).status_code == 302
    assert admin.get(f"/go/{link_id}", headers={"Sec-Purpose": "prefetch"}, follow_redirects=False).status_code == 302
    assert admin.get(f"/go/{link_id}?url=https://evil.example", follow_redirects=False).status_code == 400
    assert admin.get("/go/missing", follow_redirects=False).status_code == 404
    result = admin.get("/api/v1/admin/dashboard?days=7")
    assert result.status_code == 200, result.text
    data = result.json()
    analytics = data["analytics"]
    assert (analytics["searches"], analytics["no_result_searches"], analytics["official_clicks"]) == (3, 2, 1)
    assert len(analytics["daily"]) == 7
    assert analytics["top_no_result_searches"][0]["query"] == "未知截图工具"
    assert analytics["top_searches"][0]["searches"] == 2
    assert analytics["top_links"][0]["official_link_id"] == link_id
    assert analytics["top_software"][0]["software_id"] == app["id"]
    assert "person@example.com" not in str(data)
    assert result.headers["Cache-Control"] == "no-store"
    assert admin.get("/api/v1/admin/dashboard?days=91").status_code == 422
    with database() as db:
        rows = db.scalars(select(AnalyticsDaily)).all()
        assert len(rows) == 3
        assert {column["name"] for column in inspect(db.bind).get_columns("analytics_daily")} == {"day", "event", "scope", "key", "count", "no_result_count", "software_id", "official_link_id"}
        assert "person@example.com" not in str([row.key for row in rows])


def test_public_event_input_origin_and_rate_limit(client):
    payload = {"event": "search", "query": "录屏", "result_count": 0}
    assert client.get("/api/v1/admin/dashboard").status_code == 401
    assert client.post("/api/v1/analytics/events", json={**payload, "session_id": "tracking"}).status_code == 422
    assert client.post("/api/v1/analytics/events", json={**payload, "event": "official_click"}).status_code == 422
    assert client.post("/api/v1/analytics/events", json={**payload, "result_count": -1}).status_code == 422
    assert client.post("/api/v1/analytics/events", json={**payload, "query": " "}).status_code == 422
    assert client.post("/api/v1/analytics/events", json=payload, headers={"Origin": "https://evil.example"}).status_code == 403
    with patch.object(public_limiter, "limit", 1):
        assert client.post("/api/v1/analytics/events", json=payload).status_code == 204
        assert client.post("/api/v1/analytics/events", json=payload).status_code == 429


def test_daily_retention_and_clear_are_real(database):
    today = utcnow().date()
    with database() as db:
        db.add_all([AnalyticsDaily(day=today - timedelta(days=offset), event="search", scope="software", key=f"day {offset}", count=4, no_result_count=0) for offset in (0, 89, 90, 100)])
        db.commit()
        AnalyticsService(db).search(SearchEvent(event="search", query="正常搜索", result_count=0))
        assert {row.day for row in db.scalars(select(AnalyticsDaily))} == {today, today - timedelta(days=89)}
        assert AnalyticsService(db).summary(90).searches == 9
        assert AnalyticsService(db).purge() == 0
        assert AnalyticsService(db).purge(all_data=True) == 3
        assert AnalyticsService(db).summary(30).searches == 0


def test_metrics_storage_failure_does_not_block_official_jump(admin):
    app = software(admin)
    from app.services.analytics import logger
    with patch("app.services.analytics.sqlite_insert", wraps=__import__("sqlalchemy.dialects.sqlite", fromlist=["insert"]).insert):
        # Inject only the aggregate INSERT failure, preserving link validation.
        from sqlalchemy.orm import Session
        original = Session.execute
        def execute(session, statement, *args, **kwargs):
            if getattr(getattr(statement, "table", None), "name", None) == "analytics_daily" and statement.is_insert:
                raise OperationalError("private body", {}, Exception("private values"))
            return original(session, statement, *args, **kwargs)
        with patch.object(Session, "execute", execute), patch.object(logger, "warning") as warning:
            response = admin.get("/go/" + app["official_links"][0]["id"], follow_redirects=False)
            assert response.status_code == 302
            assert response.headers["Referrer-Policy"] == "no-referrer"
            warning.assert_called_once_with("daily analytics storage unavailable")


def test_dashboard_pending_and_content_gaps_use_actual_records(admin):
    app = software(admin)
    item = draft(admin, software_id=app["id"])
    pending = admin.get("/api/v1/admin/dashboard").json()
    assert pending["totals"]["pending_content"] == 1
    assert pending["pending_content"][0]["id"] == item["id"]
    assert pending["gaps"][0]["missing"] == ["version", "guide", "faq"]
    publish(admin, item)
    published = admin.get("/api/v1/admin/dashboard").json()
    assert published["totals"]["published_content"] == 1
    assert published["pending_content"] == []
    assert published["gaps"][0]["missing"] == ["version", "faq"]
    assert published["recent_actions"][0]["action"] == "publish"
    admin.delete(f"/api/v1/admin/software/{app['id']}")
    assert admin.get("/api/v1/admin/dashboard").json()["gaps"] == []
