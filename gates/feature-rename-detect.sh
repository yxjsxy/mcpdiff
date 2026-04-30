#!/usr/bin/env bash
set -euo pipefail
# GATE_LEVEL: P1
# GATE_VERIFY: MCPDiff detects semantic renames and can block them when no-silent-renames is enabled.

cd /Users/karlkarl/Documents/vibe_coding/mcpdiff

node cli.js diff fixtures/v1.tools.json fixtures/v2-renamed.tools.json > .harness-rename.md
node cli.js ablate fixtures/v1.tools.json fixtures/v2-renamed.tools.json > .harness-rename-ablate.md
set +e
node cli.js policy fixtures/v1.tools.json fixtures/v2-renamed.tools.json --no-silent-renames > .harness-rename-policy.stdout 2> .harness-rename-policy.stderr
status_fail=$?
set -e

[ "$status_fail" -eq 2 ]
grep -q 'send_slack -> post_slack' .harness-rename.md
grep -q 'strict matching: removed=1, added=1, renamed=0' .harness-rename-ablate.md
grep -q 'rename-aware matching: removed=0, added=0, renamed=1' .harness-rename-ablate.md
grep -q 'renamed tools 1 detected while --no-silent-renames is enabled' .harness-rename-policy.stderr
