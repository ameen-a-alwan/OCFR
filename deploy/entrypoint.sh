#!/bin/bash
set -e

DATA_DIR="${OCFR_DATA_DIR:-/app/backend/data}"
mkdir -p "$DATA_DIR/uploads" "$DATA_DIR/raw" "$DATA_DIR/chroma"

export PYTHONPATH="/app/backend${PYTHONPATH:+:$PYTHONPATH}"

cd /app/backend
/app/venv/bin/python -c "from app.core.database import get_app_database; get_app_database()._init_schema(); get_app_database().ensure_seed_users()" || true

echo "[ocfr] starting FastAPI on 127.0.0.1:8000"
/app/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 &
API_PID=$!

echo "[ocfr] starting Next.js on 127.0.0.1:3000"
cd /app/frontend
HOSTNAME=127.0.0.1 PORT=3000 node server.js &
WEB_PID=$!

i=0
until curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 90 ]; then
    echo "[ocfr] API failed to become ready" >&2
    exit 1
  fi
  sleep 2
done
echo "[ocfr] API ready"

echo "[ocfr] starting nginx on :80"
nginx -g "daemon off;" &
NGINX_PID=$!

term() {
  echo "[ocfr] shutting down…"
  kill -TERM "$NGINX_PID" "$WEB_PID" "$API_PID" 2>/dev/null || true
  wait || true
}
trap term INT TERM

wait -n "$API_PID" "$WEB_PID" "$NGINX_PID"
EXIT=$?
term
exit "$EXIT"
