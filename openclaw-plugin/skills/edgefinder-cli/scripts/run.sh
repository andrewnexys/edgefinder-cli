#!/bin/sh
set -eu

if command -v edgefinder >/dev/null 2>&1; then
  exec edgefinder "$@"
fi

echo "Error: the native 'edgefinder' binary is not available on PATH." >&2
echo "Install it with: cargo install --git https://github.com/andrewnexys/edgefinder-cli edgefinder-cli" >&2
exit 1
