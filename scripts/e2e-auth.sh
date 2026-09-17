#!/usr/bin/env bash
# End-to-end check of email/password auth against a running Flare app.
# Usage: scripts/e2e-auth.sh http://127.0.0.1:8787
set -u
BASE=${1:?base url}
JAR=$(mktemp)
EMAIL="e2e-$(date +%s)-$RANDOM@example.com"
PASS="correct-horse-battery-staple"
ORIGIN_HDR="Origin: $BASE"
fail=0

check() { # label expected actual
  if [[ "$3" == *"$2"* ]]; then echo "PASS  $1"; else echo "FAIL  $1 (expected '$2', got '${3:0:200}')"; fail=1; fi
}

status() { curl -s -o /dev/null -w "%{http_code} %{redirect_url}" "$@"; }

check "auth handler is mounted" '"ok":true' "$(curl -s "$BASE/api/auth/ok")"

check "dashboard redirects signed-out visitors" "/sign-in?next=%2Fdashboard" "$(status "$BASE/dashboard")"

check "sign-up succeeds" "\"email\":\"$EMAIL\"" "$(curl -s -c "$JAR" -H "$ORIGIN_HDR" -H 'Content-Type: application/json' \
  -d "{\"name\":\"E2E\",\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" "$BASE/api/auth/sign-up/email")"

check "duplicate sign-up is rejected" "422" "$(curl -s -o /dev/null -w '%{http_code}' -H "$ORIGIN_HDR" -H 'Content-Type: application/json' \
  -d "{\"name\":\"E2E\",\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" "$BASE/api/auth/sign-up/email")"

rm -f "$JAR"; JAR=$(mktemp)

check "wrong password is rejected" "401" "$(curl -s -o /dev/null -w '%{http_code}' -H "$ORIGIN_HDR" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"wrong-password-123\"}" "$BASE/api/auth/sign-in/email")"

check "sign-in succeeds" "\"email\":\"$EMAIL\"" "$(curl -s -c "$JAR" -H "$ORIGIN_HDR" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" "$BASE/api/auth/sign-in/email")"

check "session cookie is HttpOnly" "HttpOnly" "$(grep -i "session_token" "$JAR" | head -1 | sed 's/^#HttpOnly_/HttpOnly /')"

check "get-session returns the user" "\"email\":\"$EMAIL\"" "$(curl -s -b "$JAR" "$BASE/api/auth/get-session")"

check "dashboard renders for the signed-in user" "$EMAIL" "$(curl -s -b "$JAR" "$BASE/dashboard")"

check "signed-in user is redirected away from /sign-in" "/dashboard" "$(status -b "$JAR" "$BASE/sign-in")"

check "sign-out succeeds" '"success":true' "$(curl -s -b "$JAR" -c "$JAR" -X POST -H "$ORIGIN_HDR" -H 'Content-Type: application/json' -d '{}' "$BASE/api/auth/sign-out")"

check "session is gone after sign-out" "null" "$(curl -s -b "$JAR" "$BASE/api/auth/get-session")"

check "forged cookie does not render the dashboard" "/sign-in" "$(status -H 'Cookie: better-auth.session_token=forged.value' "$BASE/dashboard")"

rm -f "$JAR"
exit $fail
