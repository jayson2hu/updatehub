from typing import Annotated

from fastapi import APIRouter, Query, Request, Response

from app.api.dependencies import CurrentAdmin, Database
from app.core.security import check_origin, public_limiter, request_client_key
from app.schemas.analytics import DashboardRead, SearchEvent
from app.services.analytics import AnalyticsService, DashboardService

router = APIRouter(tags=["private aggregate analytics"])


@router.post("/analytics/events", status_code=204, response_class=Response, summary="记录可见搜索结果的每日汇总", description="仅供可见搜索页面提交；列表GET不计数。保留经过格式过滤的短搜索词及次数，含标识/凭据格式的搜索词隐藏。无IP、会话、访客ID或第三方遥测；按UTC日汇总，保留90天。")
def search_event(body: SearchEvent, request: Request, db: Database):
    check_origin(request)
    public_limiter.hit("analytics:" + request_client_key(request))
    AnalyticsService(db).search(body)
    return Response(status_code=204, headers={"Cache-Control": "no-store"})


@router.get("/admin/dashboard", response_model=DashboardRead)
def dashboard(db: Database, session: CurrentAdmin, days: Annotated[int, Query(ge=1, le=90)] = 30):
    return DashboardService(db).read(days)
