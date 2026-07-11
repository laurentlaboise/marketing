#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOKEN="${ADMIN_API_TOKEN:?Set ADMIN_API_TOKEN from Railway wts-admin Variables}"
BASE="${ADMIN_API_BASE:-https://admin.wordsthatsells.website/api/machine/v1}"
BODY=$(node -e "console.log(JSON.stringify({terms:require('$ROOT/database/glossary_seed_data.json')}))")
curl -sS -X POST "$BASE/glossary/bulk-upsert" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$BODY" | tee /tmp/glossary-upsert-result.json
echo
