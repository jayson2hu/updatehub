from starlette.responses import JSONResponse


class BodySizeLimitMiddleware:
    """Bound the body before multipart parsing, including chunked requests."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] not in {"POST", "PUT", "PATCH"}:
            return await self.app(scope, receive, send)
        maximum = 6 * 1024 * 1024 if scope["path"].endswith("/admin/station/uploads") else (3 * 1024 * 1024 if scope["path"].endswith("/uploads/icon") else 1024 * 1024)
        headers = dict(scope.get("headers", []))
        length = headers.get(b"content-length")
        if length:
            try:
                too_large = int(length) > maximum
            except ValueError:
                return await JSONResponse({"detail": "请求长度无效"}, status_code=400)(scope, receive, send)
            if too_large:
                return await JSONResponse({"detail": "请求内容过大"}, status_code=413)(scope, receive, send)
        # A bounded buffer ensures Starlette never spools an unlimited file before
        # authentication or the image decoder enforces its stricter 2 MB limit.
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            body.extend(message.get("body", b""))
            if len(body) > maximum:
                return await JSONResponse({"detail": "请求内容过大"}, status_code=413)(scope, receive, send)
            if not message.get("more_body", False):
                break
        consumed = False

        async def replay():
            nonlocal consumed
            if not consumed:
                consumed = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        return await self.app(scope, replay, send)
