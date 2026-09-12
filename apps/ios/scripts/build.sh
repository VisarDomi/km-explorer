#!/bin/bash
set -euo pipefail
exec /usr/bin/python3 "$(dirname "$0")/build-native.py" "$@"
