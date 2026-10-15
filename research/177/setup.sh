#!/bin/sh
# Installs the harness and checks out mermaid's source at the tag the measurements used.
set -eu
cd "$(dirname "$0")"
npm install --no-audit --no-fund
npm install --prefix third --ignore-scripts --no-audit --no-fund
if [ ! -d mermaid-src/repo ]; then
	mkdir -p mermaid-src
	git clone --depth 1 --branch mermaid@12.2.0 --filter=blob:none --sparse https://github.com/mermaid-js/mermaid.git mermaid-src/repo
	git -C mermaid-src/repo sparse-checkout set packages/mermaid/src
fi
