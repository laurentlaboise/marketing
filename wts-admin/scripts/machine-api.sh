#!/usr/bin/env bash
# Local helper for WTS Admin Machine API v1
#
# Usage:
#   export ADMIN_API_TOKEN='…'          # from Railway Variables
#   ./scripts/machine-api.sh health
#   ./scripts/machine-api.sh seed-pricing
#   ./scripts/machine-api.sh pricing
#   ./scripts/machine-api.sh products
#   ./scripts/machine-api.sh products content-creation
#   ./scripts/machine-api.sh affiliates
#   ./scripts/machine-api.sh footer
#   ./scripts/machine-api.sh menus footer
#   ./scripts/machine-api.sh put-package growth-engine '{"name":"Growth Engine","base_price":649}'
#   ./scripts/machine-api.sh patch-footer '{"footer_social_youtube":"https://www.youtube.com/@wordsthatsells928"}'
#   ./scripts/machine-api.sh raw GET /v1/health
#
# Optional:
#   ADMIN_API_BASE=https://admin.wordsthatsells.website/api/machine
#   (default above; override for local: http://localhost:3000/api/machine)

set -euo pipefail

BASE="${ADMIN_API_BASE:-https://admin.wordsthatsells.website/api/machine}"
TOKEN="${ADMIN_API_TOKEN:-}"

usage() {
  cat <<'EOF'
WTS Admin Machine API helper

  export ADMIN_API_TOKEN='…'   # Railway → marketing service → Variables

Commands:
  health                         GET  /v1/health
  seed-pricing                   POST /v1/seed/pricing
  pricing                        GET  /v1/pricing
  products [service_page]        GET  /v1/products
  affiliates                     GET  /v1/affiliate-solutions
  footer                         GET  /v1/footer-settings
  menus [location]               GET  /v1/menus
  put-package <slug> <json>      PUT  /v1/pricing/packages/:slug
  put-feature <key> <json>       PUT  /v1/pricing/features/:key
  put-affiliate <name> <json>    PUT  /v1/affiliate-solutions/:name
  patch-footer <json>            PATCH /v1/footer-settings
  patch-menu <id> <json>         PATCH /v1/menus/:id
  raw <METHOD> <path> [json]     Arbitrary call (path starts with /v1/...)

Examples:
  ./scripts/machine-api.sh health
  ./scripts/machine-api.sh seed-pricing
  ./scripts/machine-api.sh products web-development
  ./scripts/machine-api.sh put-package growth-engine '{"name":"Growth Engine","base_price":649,"highlight":true}'
  ./scripts/machine-api.sh patch-footer '{"footer_social_youtube":"https://www.youtube.com/@wordsthatsells928"}'
EOF
}

# help / no-args before token check
if [[ "${1:-}" == "" || "${1:-}" == "-h" || "${1:-}" == "--help" || "${1:-}" == "help" ]]; then
  usage
  exit 0
fi

if [[ -z "$TOKEN" ]]; then
  echo "Error: ADMIN_API_TOKEN is not set." >&2
  echo "  1) Railway → marketing service → Variables → copy ADMIN_API_TOKEN" >&2
  echo "  2) export ADMIN_API_TOKEN='…'" >&2
  echo "  3) re-run: $0 $*" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "Error: curl is required." >&2
  exit 1
fi

json_pp() {
  if command -v python3 >/dev/null 2>&1; then
    python3 -m json.tool 2>/dev/null || cat
  elif command -v jq >/dev/null 2>&1; then
    jq .
  else
    cat
  fi
}

# api METHOD PATH [json-body]
api() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local url="${BASE}${path}"
  local args=(-sS -X "$method" "$url"
    -H "Authorization: Bearer ${TOKEN}"
    -H "Accept: application/json")

  if [[ -n "$body" ]]; then
    args+=(-H "Content-Type: application/json" -d "$body")
  fi

  local tmp http
  tmp="$(mktemp)"
  http="$(curl "${args[@]}" -w '%{http_code}' -o "$tmp")"
  if [[ ! "$http" =~ ^2 ]]; then
    echo "HTTP $http  $method $url" >&2
    cat "$tmp" >&2
    echo >&2
    rm -f "$tmp"
    exit 1
  fi
  cat "$tmp" | json_pp
  rm -f "$tmp"
}

cmd="${1:-}"
shift || true

case "$cmd" in
  health)
    api GET /v1/health
    ;;
  seed-pricing|seed)
    api POST /v1/seed/pricing
    ;;
  pricing)
    api GET /v1/pricing
    ;;
  products)
    if [[ -n "${1:-}" ]]; then
      api GET "/v1/products?service_page=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$1")&limit=200"
    else
      api GET "/v1/products?limit=200"
    fi
    ;;
  affiliates|affiliate-solutions)
    api GET /v1/affiliate-solutions
    ;;
  footer|footer-settings)
    api GET /v1/footer-settings
    ;;
  menus)
    if [[ -n "${1:-}" ]]; then
      api GET "/v1/menus?location=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$1")"
    else
      api GET /v1/menus
    fi
    ;;
  put-package)
    slug="${1:-}"; body="${2:-}"
    [[ -n "$slug" && -n "$body" ]] || { echo "Usage: $0 put-package <slug> '<json>'" >&2; exit 1; }
    api PUT "/v1/pricing/packages/${slug}" "$body"
    ;;
  put-feature)
    key="${1:-}"; body="${2:-}"
    [[ -n "$key" && -n "$body" ]] || { echo "Usage: $0 put-feature <key> '<json>'" >&2; exit 1; }
    api PUT "/v1/pricing/features/${key}" "$body"
    ;;
  put-affiliate)
    name="${1:-}"; body="${2:-}"
    [[ -n "$name" && -n "$body" ]] || { echo "Usage: $0 put-affiliate <name> '<json>'" >&2; exit 1; }
    enc="$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$name")"
    api PUT "/v1/affiliate-solutions/${enc}" "$body"
    ;;
  patch-footer)
    body="${1:-}"
    [[ -n "$body" ]] || { echo "Usage: $0 patch-footer '<json>'" >&2; exit 1; }
    api PATCH /v1/footer-settings "$body"
    ;;
  patch-menu)
    id="${1:-}"; body="${2:-}"
    [[ -n "$id" && -n "$body" ]] || { echo "Usage: $0 patch-menu <id> '<json>'" >&2; exit 1; }
    api PATCH "/v1/menus/${id}" "$body"
    ;;
  raw)
    method="${1:-}"; path="${2:-}"; body="${3:-}"
    [[ -n "$method" && -n "$path" ]] || { echo "Usage: $0 raw <METHOD> <path> [json]" >&2; exit 1; }
    [[ "$path" == /* ]] || path="/$path"
    api "$method" "$path" "$body"
    ;;
  *)
    echo "Unknown command: $cmd" >&2
    usage >&2
    exit 1
    ;;
esac
