#!/bin/bash
# Time cold-JVM JSON exports of a workspace with the Structurizr CLI.
#
#   time-export.sh <workspace.dsl|workspace.json> <runs> [JAVA_HOME]
#
# Runs `export -f json` <runs> times, each in a fresh JVM, into a temporary
# folder, and prints the wall-clock time of each run. STRUCTURIZR_CLI overrides
# the CLI (default: structurizr-cli on the PATH).
set -euo pipefail

workspace="$1"
runs="$2"
if [ "$#" -ge 3 ]; then
  export JAVA_HOME="$3"
fi
cli="${STRUCTURIZR_CLI:-structurizr-cli}"

out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT
for i in $(seq 1 "$runs"); do
  start=$(perl -MTime::HiRes=time -e 'printf "%.3f", time')
  "$cli" export -w "$workspace" -f json -o "$out" > /dev/null 2>&1
  end=$(perl -MTime::HiRes=time -e 'printf "%.3f", time')
  perl -e "printf \"run $i: %.2f s\n\", $end - $start"
done
