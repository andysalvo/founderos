#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/root/.config/founderos/aps.env"
RUN_FETCH=0
RUN_RESTART=0
SMOKE_REPO="${FOUNDEROS_SMOKE_REPO:-}"
SMOKE_BRANCH="${FOUNDEROS_SMOKE_BRANCH:-main}"
SMOKE_OBJECTIVE="${FOUNDEROS_SMOKE_OBJECTIVE:-Inspect the repo and return the current bounded worker proposal contract.}"
WORKER_SERVICE="${FOUNDEROS_WORKER_SERVICE:-founderos-openclaw-worker.service}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --repo)
      SMOKE_REPO="$2"
      shift 2
      ;;
    --branch)
      SMOKE_BRANCH="$2"
      shift 2
      ;;
    --objective)
      SMOKE_OBJECTIVE="$2"
      shift 2
      ;;
    --fetch)
      RUN_FETCH=1
      shift
      ;;
    --restart)
      RUN_RESTART=1
      shift
      ;;
    --service)
      WORKER_SERVICE="$2"
      shift 2
      ;;
    *)
      echo "unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CHECK_SCRIPT="${ROOT_DIR}/services/openclaw/check-worker.sh"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "env file not found: ${ENV_FILE}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

cd "${ROOT_DIR}"

echo "== Local repo state =="
echo "branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || printf 'unknown')"
echo "head=$(git rev-parse HEAD 2>/dev/null || printf 'unknown')"

if [[ "${RUN_FETCH}" -eq 1 ]]; then
  echo
  echo "== Fetching remote state =="
  git fetch --all --prune
  echo "origin_main=$(git rev-parse origin/main 2>/dev/null || printf 'unknown')"
fi

if [[ "${RUN_RESTART}" -eq 1 ]]; then
  echo
  echo "== Restarting worker =="
  if command -v systemctl >/dev/null 2>&1; then
    systemctl restart "${WORKER_SERVICE}"
    systemctl --no-pager --full status "${WORKER_SERVICE}" | sed -n '1,12p'
  else
    echo "systemctl not available; restart manually and rerun this script" >&2
    exit 1
  fi
fi

echo
"${CHECK_SCRIPT}" \
  --env-file "${ENV_FILE}" \
  --repo "${SMOKE_REPO}" \
  --branch "${SMOKE_BRANCH}" \
  --objective "${SMOKE_OBJECTIVE}"
