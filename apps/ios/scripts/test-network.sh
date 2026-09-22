#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/ytb-network-tests.XXXXXX")
trap 'rm -rf "$test_dir"' EXIT
xcrun swiftc -parse-as-library -strict-concurrency=complete \
  Ytb/Models.swift Ytb/YtbAPI.swift Ytb/YtbStore.swift \
  Tests/NetworkTests.swift -o "$test_dir/test-runner"
"$test_dir/test-runner"
