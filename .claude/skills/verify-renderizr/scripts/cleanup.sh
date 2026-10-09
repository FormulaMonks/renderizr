#!/usr/bin/env bash
# Stop what this run started and drop its scratch state. Keeps the evidence.
#
#   cleanup.sh <run-dir>
#
# Stops each <mode>.pid's whole process group (the pid leads it), then
# removes site/, edit/ and the pid files. evidence/ and the logs stay.
set -uo pipefail

run=${1:?run dir}
shopt -s nullglob
for file in "$run"/*.pid; do
    pid=$(cat "$file")
    if kill -0 "$pid" 2>/dev/null; then
        kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid"
        for _ in $(seq 20); do
            kill -0 "$pid" 2>/dev/null || break
            sleep 0.25
        done
        kill -KILL -- "-$pid" 2>/dev/null || true
        echo "stopped $(basename "$file" .pid) (group $pid)"
    fi
    rm -f "$file"
done
rm -rf "$run/site" "$run/edit"
echo "evidence kept in $run/evidence:"
ls "$run/evidence" 2>/dev/null
