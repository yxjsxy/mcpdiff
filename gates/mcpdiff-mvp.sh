#!/usr/bin/env bash
set -euo pipefail
# GATE_LEVEL: P0
# GATE_VERIFY: MCPDiff can classify noisy manifest churn, renames, required-arg tightening, and removals with runnable policy checks.

cd /Users/karlkarl/Documents/vibe_coding/mcpdiff

node cli.js diff fixtures/v1.tools.json fixtures/v2-noisy.tools.json > .harness-noisy.md
node cli.js diff fixtures/v1.tools.json fixtures/v2-renamed.tools.json > .harness-renamed.md
node cli.js benchmark fixtures/v1.tools.json fixtures/v2-noisy.tools.json fixtures/v2-renamed.tools.json fixtures/v2-tightened.tools.json fixtures/v2-removed.tools.json > .harness-benchmark.md

set +e
node cli.js policy fixtures/v1.tools.json fixtures/v2-tightened.tools.json --max-required-arg-additions 0 > .harness-tightened.stdout 2> .harness-tightened.stderr
status_tightened=$?
node cli.js policy fixtures/v1.tools.json fixtures/v2-removed.tools.json --max-removed-tools 0 > .harness-removed.stdout 2> .harness-removed.stderr
status_removed=$?
set -e

[ "$status_tightened" -eq 2 ]
[ "$status_removed" -eq 2 ]
grep -q 'noise only: yes' .harness-noisy.md
grep -q 'send_slack -> post_slack' .harness-renamed.md
grep -q 'required-arg-additions=1' .harness-benchmark.md
grep -q 'removed tools 1 exceeds budget 0' .harness-removed.stderr
grep -q 'required arg additions 1 exceeds budget 0' .harness-tightened.stderr
