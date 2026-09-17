#!/usr/bin/env bash
# CRUD REST API check for a generated `Contact` resource (name:string, email:string).
# Usage: scripts/e2e-crud.sh http://127.0.0.1:8787
set -u
BASE=${1:?base url}
API="$BASE/api/contacts"
JAR=$(mktemp)
RUN=$(date +%s)-$RANDOM
fail=0
check() { if [[ "$3" == *"$2"* ]]; then echo "PASS  $1"; else echo "FAIL  $1 (expected '$2', got '${3:0:300}')"; fail=1; fi; }
json() { curl -s -b "$JAR" -H "Origin: $BASE" -H 'Content-Type: application/json' "$@"; }
code() { curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -H "Origin: $BASE" -H 'Content-Type: application/json' "$@"; }
field() { sed -E "s/.*\"$1\":\"([^\"]*)\".*/\1/"; }

check "unauthenticated list is rejected" "401" "$(curl -s -o /dev/null -w '%{http_code}' "$API")"

curl -s -c "$JAR" -H "Origin: $BASE" -H 'Content-Type: application/json' \
  -d "{\"name\":\"CRUD\",\"email\":\"crud-$RUN@example.com\",\"password\":\"correct-horse-battery-staple\"}" \
  "$BASE/api/auth/sign-up/email" > /dev/null

# POST
CREATED=$(json -X POST -d "{\"name\":\"Ada $RUN\",\"email\":\"ada-$RUN@example.com\"}" -D - "$API")
check "POST creates (201)" "201" "$(echo "$CREATED" | head -1)"
check "POST returns Location" "location: /api/contacts/" "$(echo "$CREATED" | tr -d '\r' | tr 'A-Z' 'a-z')"
ID=$(echo "$CREATED" | tail -1 | field id)
check "POST returns the record" "\"email\":\"ada-$RUN@example.com\"" "$(echo "$CREATED" | tail -1)"

check "POST validation error (422)" "422" "$(code -X POST -d '{"name":"","email":"not-an-email"}' "$API")"
check "POST rejects unknown keys (422)" "422" "$(code -X POST -d "{\"name\":\"x\",\"email\":\"x-$RUN@example.com\",\"id\":\"forced\"}" "$API")"
check "POST requires JSON (415)" "415" "$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -H "Origin: $BASE" -H 'Content-Type: text/plain' -d 'x' "$API")"
check "POST blocks cross-origin (403)" "403" "$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -H 'Origin: https://evil.example' -H 'Content-Type: application/json' -d '{}' "$API")"

# GET collection
check "GET list finds the record" "\"id\":\"$ID\"" "$(json "$API?q=ada-$RUN")"
check "GET list returns meta" "\"meta\":{\"page\":1" "$(json "$API?q=ada-$RUN&perPage=5")"
check "GET list rejects bad sort (400)" "400" "$(code "$API?sort=password")"

# GET item
check "GET item" "\"id\":\"$ID\"" "$(json "$API/$ID")"
check "GET missing item (404)" "404" "$(code "$API/does-not-exist")"

# PATCH
check "PATCH updates one field" "\"name\":\"Ada Lovelace\"" "$(json -X PATCH -d '{"name":"Ada Lovelace"}' "$API/$ID")"
check "PATCH keeps other fields" "\"email\":\"ada-$RUN@example.com\"" "$(json "$API/$ID")"
check "PATCH validation error (422)" "422" "$(code -X PATCH -d '{"email":"nope"}' "$API/$ID")"

# PUT
check "PUT replaces the record" "\"name\":\"Ada King\"" "$(json -X PUT -d "{\"name\":\"Ada King\",\"email\":\"king-$RUN@example.com\"}" "$API/$ID")"
check "PUT requires all required fields (422)" "422" "$(code -X PUT -d '{"name":"x"}' "$API/$ID")"

# DELETE
check "DELETE removes (204)" "204" "$(code -X DELETE "$API/$ID")"
check "GET after DELETE (404)" "404" "$(code "$API/$ID")"
check "DELETE missing (404)" "404" "$(code -X DELETE "$API/$ID")"

rm -f "$JAR"
exit $fail
