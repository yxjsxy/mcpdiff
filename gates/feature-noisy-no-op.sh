#!/usr/bin/env bash
set -euo pipefail
# GATE_LEVEL: P1
# GATE_VERIFY: MCPDiff treats formatting-only manifest churn as noise instead of compatibility drift.

cd /Users/karlkarl/Documents/vibe_coding/mcpdiff

node cli.js diff fixtures/v1.tools.json fixtures/v2-noisy.tools.json > .harness-noisy-only.md
node cli.js policy fixtures/v1.tools.json fixtures/v2-noisy.tools.json --max-removed-tools 0 --max-required-arg-additions 0 --no-silent-renames > .harness-noisy-policy.stdout

grep -q 'noise only: yes' .harness-noisy-only.md
grep -q 'removed tools: 0 (budget 0)' .harness-noisy-policy.stdout
grep -q 'required arg additions: 0 (budget 0)' .harness-noisy-policy.stdout
grep -q 'verdict: PASS' .harness-noisy-policy.stdout
