#!/usr/bin/env bash
# 5-minute create -> generate -> deploy loop check (M3 exit criteria).
#
# Does exactly what a fresh user does in the quickstart: create an app, generate
# a Contact resource, and run a plain `flare deploy`. The loop must finish in
# under 5 minutes. Then it proves the deployed app works end to end: signs up a
# user and creates and lists a Contact through the generated API (so the auth
# secret, the remote migration, and the route are all live).
#
# Usage:
#   scripts/e2e-timing.sh [appName]
#
#   SKIP_DEPLOY=1  create+gen only (no Cloudflare auth needed)
#   KEEP=1         keep the deployed Worker, D1, KV and R2 afterwards
#                  (by default they are deleted once the checks finish)
#
# Exit 0 on success, 2 if the loop exceeds LIMIT seconds (default 300), 1 on any
# other failure. Cleanup time is not counted.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FLARE="$ROOT/packages/cli/bin/flare.js"
APP=${1:-"timing-$(date +%Y%m%d%H%M%S)"}
SKIP_DEPLOY=${SKIP_DEPLOY:-0}
KEEP=${KEEP:-0}
LIMIT=${LIMIT:-300}

BASE="$(mktemp -d)"
DIR="$BASE/$APP"
LOG="$BASE/out.log"
DEPLOYED=0

now() { date +%s; }
step() { echo "== $*"; }
took() { echo "   $1: $(( $(now) - $2 ))s"; }
fail() { echo "FAIL $*"; tail -30 "$LOG" 2>/dev/null; exit 1; }

cleanup() {
  [ "$DEPLOYED" = "1" ] || return 0
  if [ "$KEEP" = "1" ]; then
    echo "   KEEP=1: leaving $APP deployed (Worker, D1 $APP-db, KV $APP-vinext-kv-cache, R2 $APP-storage)"
    return 0
  fi
  step "cleanup (not timed)"
  (
    cd "$DIR" || exit 0
    npx wrangler delete --name "$APP" --force >/dev/null 2>&1 && echo "   deleted Worker $APP"
    npx wrangler d1 delete "$APP-db" -y >/dev/null 2>&1 && echo "   deleted D1 $APP-db"
    ns=$(npx wrangler kv namespace list 2>/dev/null | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const m=d.match(/\[[\s\S]*\]/);const hit=m&&JSON.parse(m[0]).find(n=>n.title===process.argv[1]);if(hit)console.log(hit.id)})' "$APP-vinext-kv-cache")
    [ -n "$ns" ] && npx wrangler kv namespace delete --namespace-id "$ns" >/dev/null 2>&1 && echo "   deleted KV $APP-vinext-kv-cache"
    npx wrangler r2 bucket delete "$APP-storage" >/dev/null 2>&1 && echo "   deleted R2 $APP-storage"
  )
}
trap cleanup EXIT

step "create app ($APP)"
t_create=$(now)
node "$FLARE" create "$DIR" --pm pnpm >"$LOG" 2>&1 || fail "create"
took create "$t_create"

step "generate Contact resource"
t_gen=$(now)
(cd "$DIR" && node "$FLARE" gen resource Contact --fields 'name:string, email:string') >"$LOG" 2>&1 || fail "gen resource"
took gen "$t_gen"

if [ "$SKIP_DEPLOY" = "1" ]; then
  step "SKIP_DEPLOY=1: deploy leg skipped"
  total=$(( $(now) - t_create ))
else
  step "deploy"
  t_deploy=$(now)
  DEPLOYED=1
  (cd "$DIR" && node "$FLARE" deploy) >"$LOG" 2>&1 || fail "deploy"
  took deploy "$t_deploy"
  total=$(( $(now) - t_create ))

  URL=$(grep -oE 'https://[a-z0-9.-]+\.workers\.dev' "$LOG" | head -1)
  [ -n "$URL" ] || fail "no workers.dev URL in the deploy output"

  step "live checks against $URL"
  JAR="$BASE/cookies.txt"
  email="timing-$(date +%s)@example.com"
  # The auth secret is uploaded as the deploy's last step and takes a few seconds
  # to reach every location, so give sign-up a short grace period.
  for attempt in 1 2 3 4 5 6; do
    code=$(curl -s -o "$BASE/signup.json" -w '%{http_code}' -c "$JAR" -H "Origin: $URL" -H 'Content-Type: application/json' \
      -d "{\"name\":\"Timing\",\"email\":\"$email\",\"password\":\"timing-pass-123\"}" "$URL/api/auth/sign-up/email")
    [ "$code" = "200" ] && break
    sleep 5
  done
  [ "$code" = "200" ] || fail "sign-up returned $code after 30s (is BETTER_AUTH_SECRET set?): $(cat "$BASE/signup.json")"
  echo "   sign-up: 200"
  code=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -H "Origin: $URL" -H 'Content-Type: application/json' \
    -d '{"name":"Ada","email":"ada@example.com"}' "$URL/api/contacts")
  [ "$code" = "201" ] || fail "POST /api/contacts returned $code (was the migration applied?)"
  echo "   POST /api/contacts: 201"
  body=$(curl -s -b "$JAR" "$URL/api/contacts")
  echo "$body" | grep -q '"ada@example.com"' || fail "GET /api/contacts did not return the new contact: $body"
  echo "   GET /api/contacts: returns the new contact"
fi

echo
echo "TOTAL: ${total}s (limit ${LIMIT}s)"
if [ "$total" -le "$LIMIT" ]; then
  echo "PASS create -> generate -> deploy in under $LIMIT seconds."
  exit 0
fi
echo "FAIL exceeded $LIMIT seconds."
exit 2
