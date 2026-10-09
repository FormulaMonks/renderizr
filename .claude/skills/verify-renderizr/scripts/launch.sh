#!/usr/bin/env bash
# Start one Renderizr instance for a verification run, and record what it
# started so doctor.sh and cleanup.sh can find it.
#
#   launch.sh <run-dir> build <workspace> [render flags...]
#   launch.sh <run-dir> serve
#   launch.sh <run-dir> dev   <workspace> [dev flags...]
#   launch.sh <run-dir> edit  <workspace.json|workspace.dsl|folder> [edit flags...]
#
# Run it from the repository root. Each mode writes into <run-dir>:
#   build  site/ (pnpm render --out), then prints the path of site/index.html
#   serve  serves site/ on a free port (verification scaffolding: python3's
#          http.server), for a multi-file build that needs HTTP
#   dev    pnpm dev on a free port, with --strictPort
#   edit   copies the workspace (a file, or the whole folder of a DSL) into
#          edit/ and runs `pnpm render edit` on the copy, on a free port,
#          so saves never touch a tracked file
#
# Every background instance leaves <mode>.pid, <mode>.log and <mode>.url.
# The pid leads its own process group, so cleanup.sh stops the whole tree.
set -euo pipefail

run=${1:?run dir}
mode=${2:?mode}
shift 2
mkdir -p "$run/evidence"
run=$(cd "$run" && pwd)

free_port() {
    python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()'
}

# Start "$@" in its own process group, log to <name>.log, record the pid.
start() {
    local name=$1
    shift
    # perl's setpgrp gives the tree its own group on macOS, which has no setsid.
    perl -e 'setpgrp(0, 0); exec @ARGV' "$@" >"$run/$name.log" 2>&1 &
    echo $! >"$run/$name.pid"
}

# Wait until <pattern> appears in <name>.log, or fail with the log's tail.
wait_for_log() {
    local name=$1 pattern=$2 tries=${3:-240}
    for _ in $(seq "$tries"); do
        if grep -qE "$pattern" "$run/$name.log" 2>/dev/null; then return 0; fi
        if ! kill -0 "$(cat "$run/$name.pid")" 2>/dev/null; then break; fi
        sleep 0.5
    done
    echo "launch: $name never got ready; last lines of $run/$name.log:" >&2
    tail -20 "$run/$name.log" >&2
    return 1
}

case "$mode" in
build)
    workspace=${1:?workspace}
    shift
    rm -rf "$run/site"
    pnpm render "$workspace" --out "$run/site" "$@" >"$run/build.log" 2>&1 || {
        tail -20 "$run/build.log" >&2
        exit 1
    }
    echo "$run/site/index.html" | tee "$run/build.url"
    ;;
serve)
    test -f "$run/site/index.html" || {
        echo "launch: build a site first" >&2
        exit 1
    }
    port=$(free_port)
    start serve python3 -m http.server "$port" --bind 127.0.0.1 --directory "$run/site"
    for _ in $(seq 40); do
        curl -fsS "http://127.0.0.1:$port/" >/dev/null 2>&1 && break
        sleep 0.25
    done
    echo "http://127.0.0.1:$port/" | tee "$run/serve.url"
    ;;
dev)
    workspace=${1:?workspace}
    shift
    port=$(free_port)
    start dev pnpm dev --port "$port" --strictPort -- "$workspace" "$@"
    wait_for_log dev "Local:"
    echo "http://localhost:$port/" | tee "$run/dev.url"
    ;;
edit)
    source=${1:?workspace}
    shift
    rm -rf "$run/edit"
    mkdir -p "$run/edit"
    if [ -d "$source" ]; then
        cp -R "$source/." "$run/edit/"
        target="$run/edit"
    elif [ "${source##*.}" = "dsl" ]; then
        # A DSL pulls in its whole folder.
        cp -R "$(dirname "$source")/." "$run/edit/"
        target="$run/edit/$(basename "$source")"
    else
        cp "$source" "$run/edit/workspace.json"
        target="$run/edit/workspace.json"
    fi
    port=$(free_port)
    start edit pnpm render edit "$target" --port "$port" "$@"
    wait_for_log edit "Open http://127\.0\.0\.1:[0-9]+/\?token="
    grep -oE "http://127\.0\.0\.1:[0-9]+/\?token=[A-Za-z0-9]+" "$run/edit.log" | head -1 | tee "$run/edit.url"
    echo "$target" >"$run/edit.target"
    ;;
*)
    echo "launch: unknown mode $mode (build, serve, dev or edit)" >&2
    exit 2
    ;;
esac
