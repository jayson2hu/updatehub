FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1
WORKDIR /app
ARG PIP_INDEX_URL=https://pypi.org/simple
COPY apps/api/requirements.txt ./requirements.txt
RUN python -m pip install --no-cache-dir --upgrade pip==26.2 \
    && pip install --no-cache-dir -r requirements.txt \
    && groupadd --gid 10001 updatehub \
    && useradd --uid 10001 --gid updatehub --no-create-home updatehub \
    && mkdir -p /data/uploads \
    && chown updatehub:updatehub /data/uploads
COPY --chown=updatehub:updatehub apps/api/ ./
COPY --chown=updatehub:updatehub infra/api/entrypoint.sh /usr/local/bin/updatehub-api
RUN chmod 755 /usr/local/bin/updatehub-api
USER updatehub
EXPOSE 8000
ENTRYPOINT ["/usr/local/bin/updatehub-api"]
