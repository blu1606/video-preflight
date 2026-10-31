FROM python:3.12-slim-bookworm AS api
COPY --from=ghcr.io/astral-sh/uv:0.11.19 /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1 \
    OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 10001 --create-home app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY core/ core/
COPY sources/ sources/
COPY agents/ agents/
COPY fixtures/ fixtures/
COPY api.py main.py ./
RUN mkdir -p data output && chown -R app:app data output
USER app
EXPOSE 8100
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8100", "--workers", "1"]

FROM node:22-alpine AS frontend-build
WORKDIR /app
RUN npm install --global pnpm@11.25.0
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

FROM caddy:2.10.2-alpine AS web
COPY --from=frontend-build /app/dist /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile

FROM node:22-alpine AS database
RUN npm install --global json-server@0.17.4 \
    && mkdir -p /var/lib/preflight /seed \
    && chown node:node /var/lib/preflight
COPY db/db.json /seed/db.json
COPY deploy/start-db.sh /usr/local/bin/start-db
USER node
EXPOSE 3101
CMD ["sh", "/usr/local/bin/start-db"]
