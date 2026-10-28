# OCFR — single image: nginx (:80) → Next.js + FastAPI under /api
# Usage:
#   docker build -t ocfr .
#   docker run -d -p 80:80 -v ocfr-data:/app/backend/data --name ocfr ocfr
# Open http://localhost  (API at http://localhost/api/...)

# ── Frontend build ──────────────────────────────────────────────
FROM node:22-bookworm AS frontend-build
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
ENV NEXT_TELEMETRY_DISABLED=1
# Intentionally unset: client uses relative /api on whatever host serves the UI
RUN npm run build

# ── Runtime ─────────────────────────────────────────────────────
FROM node:22-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip python3-venv \
      nginx \
      curl \
      ca-certificates \
      libgomp1 \
      libgl1 \
      libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Backend Python deps (venv so apt python packages stay clean)
COPY backend/requirements.txt /app/backend/requirements.txt
RUN python3 -m venv /app/venv \
 && /app/venv/bin/pip install --no-cache-dir -U pip \
 && /app/venv/bin/pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend/ /app/backend/

# Next.js standalone + static assets
COPY --from=frontend-build /src/frontend/.next/standalone /app/frontend
COPY --from=frontend-build /src/frontend/.next/static /app/frontend/.next/static
COPY --from=frontend-build /src/frontend/public /app/frontend/public

COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY deploy/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh \
 && sed -i 's/\r$//' /app/entrypoint.sh \
 && mkdir -p /app/backend/data /var/log/nginx /run/nginx \
 && rm -f /etc/nginx/sites-enabled/default

ENV PATH="/app/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=127.0.0.1 \
    NEXT_TELEMETRY_DISABLED=1 \
    # Backend data lives in the container (mount a volume over /app/backend/data)
    OCFR_DATA_DIR=/app/backend/data

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=5 \
  CMD curl -fsS http://127.0.0.1/api/health || exit 1

WORKDIR /app
ENTRYPOINT ["/app/entrypoint.sh"]
