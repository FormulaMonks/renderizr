#!/usr/bin/env bash
# Read-only: is every instance this run started worth driving?
#
#   doctor.sh <run-dir>
#
# Run it from the repository root. For each <mode>.pid in the run dir: the
# process is alive, the port in its URL belongs to its process group, and the
# URL answers. Also reports the checkout's commit, whether tracked workspaces
# changed, and the Chrome the driver will use. Exits 1 when anything is off.
set -uo pipefail

run=${1:?run dir}
status=0
say() { printf '%-5s %s\n' "$1" "$2"; }

say info "commit $(git rev-parse --short HEAD) on $(git rev-parse --abbrev-ref HEAD)"
dirty=$(git status --porcelain -- test/__fixtures__ architecture 2>/dev/null)
if [ -n "$dirty" ]; then
    say WARN "tracked workspaces changed:"
    echo "$dirty"
else
    say ok "test/__fixtures__ and architecture/ match HEAD"
fi

chrome=$(node --input-type=module -e 'import { findChrome } from "./test/support/browser.js"; console.log(findChrome() ?? "")')
if [ -n "$chrome" ]; then say ok "chrome: $chrome"; else
    say FAIL "no Chrome: set CHROME_PATH"
    status=1
fi

shopt -s nullglob
pids=("$run"/*.pid)
[ ${#pids[@]} -eq 0 ] && say info "no background instance in $run"
for file in "${pids[@]}"; do
    name=$(basename "$file" .pid)
    pid=$(cat "$file")
    url=$(cat "$run/$name.url" 2>/dev/null || echo "")
    if ! kill -0 "$pid" 2>/dev/null; then
        say FAIL "$name: pid $pid is gone (see $run/$name.log)"
        status=1
        continue
    fi
    port=$(echo "$url" | sed -nE 's#^https?://[^:/]+:([0-9]+).*#\1#p')
    owner=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | head -1)
    if [ -n "$owner" ] && [ "$(ps -o pgid= -p "$owner" | tr -d ' ')" = "$pid" ]; then
        say ok "$name: group $pid owns port $port"
    else
        say FAIL "$name: port $port is not held by this run's group $pid"
        status=1
    fi
    if curl -fsS -o /dev/null "${url%%\?*}"; then say ok "$name: $url answers"; else
        say FAIL "$name: $url does not answer"
        status=1
    fi
done
exit $status
