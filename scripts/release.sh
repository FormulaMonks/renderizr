#!/usr/bin/env bash
#
# Cut a release without any stored credentials.
#
# `release.yml` does this automatically when the automation GitHub App is
# configured, but creating an App needs organization access not everyone has.
# This is the same tool, run locally against your own `gh` login: nothing is
# stored, nothing is shared, and the pull request is authored by you — which
# also means `ci` runs on it, unlike one opened by GitHub Actions.
#
#   scripts/release.sh pr       open or update the release pull request
#   scripts/release.sh tag      after merging it: create the tag and Release
#   scripts/release.sh --help
#
set -euo pipefail

REPO_URL="https://github.com/FormulaMonks/renderizr"
CONFIG="release-please-config.json"
MANIFEST=".release-please-manifest.json"

usage() {
    sed -n '3,13p' "$0" | sed 's/^# \{0,1\}//'
}

case "${1:-}" in
-h | --help | "")
    usage
    exit 0
    ;;
pr | tag) ;;
*)
    echo "Unknown command: $1" >&2
    usage >&2
    exit 1
    ;;
esac

if ! command -v gh >/dev/null 2>&1; then
    echo "The GitHub CLI is not installed. See https://cli.github.com" >&2
    exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
    echo "Not logged in. Run: gh auth login" >&2
    exit 1
fi

# Releases come from main, never from a branch (MAINTAINERS.md).
branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$branch" != "main" ]; then
    echo "On '$branch'. Releases are cut from main; switch first." >&2
    exit 1
fi

TOKEN=$(gh auth token)

case "$1" in
pr)
    echo "Opening or updating the release pull request..."
    npx --yes release-please@latest release-pr \
        --repo-url="$REPO_URL" \
        --config-file="$CONFIG" \
        --manifest-file="$MANIFEST" \
        --token="$TOKEN" "${@:2}"
    echo
    echo "Review it, let ci finish, then merge it. Afterwards:"
    echo "  scripts/release.sh tag"
    ;;
tag)
    echo "Creating the tag and GitHub Release from the merged release pull request..."
    npx --yes release-please@latest github-release \
        --repo-url="$REPO_URL" \
        --config-file="$CONFIG" \
        --manifest-file="$MANIFEST" \
        --token="$TOKEN" "${@:2}"
    echo
    echo "Now attach the build artifacts to it:"
    echo "  gh workflow run release.yml -f tag=v<version>"
    ;;
esac
