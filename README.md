# MCPDiff

MCPDiff tells you whether a tool-manifest change is harmless noise or a rollout-breaking compatibility drift.

Git diff is great at showing lines. It is much worse at answering the question agent teams actually care about before they redeploy an MCP server or tool bundle:

**Did this manifest change remove a tool, silently tighten a schema, or rename something in a way that will break downstream callers?**

MCPDiff is a zero-dependency CLI for that preflight check.

## Why this should exist

The MCP ecosystem is moving fast. Teams are publishing more tool manifests, more generated JSON, and more server-to-server contracts. Existing platforms such as Langfuse or LangSmith help once traces exist. Generic Git diff helps once a human sits down and reads the patch.

What is still missing is a tiny, local compatibility lens that answers whether a manifest is safe to roll out before the first failed run happens.

## What it does

- normalizes noisy JSON manifest drift so key-order and whitespace churn do not trigger false alarms
- detects removed tools
- detects required-argument additions and optional-to-required flips
- detects likely renames when the contract stayed the same but the tool name changed
- enforces compatibility budgets in CI with a policy command
- records benchmark and ablation results for review

## Positioning and baseline

Baseline workflows today:
- raw Git diff over JSON manifests
- manual review of server export snapshots
- tracing and observability platforms after deployment

Adjacent community projects:
- Langfuse and LangSmith show tool usage after runs happen
- MCP server frameworks help expose tools, but do not classify compatibility drift between manifest versions
- generic JSON diff libraries show structure changes, but not rollout semantics

MCPDiff sits one step earlier. It is a manifest compatibility preflight CLI.

## Quick start

```bash
cd ~/Documents/vibe_coding/mcpdiff
node cli.js snapshot fixtures/v1.tools.json
node cli.js diff fixtures/v1.tools.json fixtures/v2-noisy.tools.json
node cli.js diff fixtures/v1.tools.json fixtures/v2-renamed.tools.json
node cli.js policy fixtures/v1.tools.json fixtures/v2-tightened.tools.json --max-required-arg-additions 0
node cli.js policy fixtures/v1.tools.json fixtures/v2-removed.tools.json --max-removed-tools 0
node cli.js policy fixtures/v1.tools.json fixtures/v2-renamed.tools.json --no-silent-renames
node cli.js benchmark fixtures/v1.tools.json fixtures/v2-noisy.tools.json fixtures/v2-renamed.tools.json fixtures/v2-tightened.tools.json fixtures/v2-removed.tools.json
node cli.js ablate fixtures/v1.tools.json fixtures/v2-renamed.tools.json
```

## How to verify

```bash
bash ~/.openclaw/workspace/scripts/coding_harness.sh gates/mcpdiff-mvp.sh 3
bash ~/.openclaw/workspace/scripts/coding_harness.sh gates/feature-rename-detect.sh 3
bash ~/.openclaw/workspace/scripts/coding_harness.sh gates/feature-noisy-no-op.sh 3
```

## Experiments and comparison

### Baseline comparison

Against raw JSON diffs, MCPDiff collapses four common review cases into explicit counters:
- `v2-noisy.tools.json`: noise-only formatting churn, should not block rollout
- `v2-renamed.tools.json`: semantic rename of `send_slack` to `post_slack`
- `v2-tightened.tools.json`: one new required argument added to `open_ticket`
- `v2-removed.tools.json`: `write_repo` removed entirely

### Bundled benchmark results

- noise-only: removed=0, renamed=0, required-arg-additions=0, noise-only=yes
- rename: removed=0, renamed=1, required-arg-additions=0, noise-only=no
- tightened-schema: removed=0, renamed=0, required-arg-additions=1, noise-only=no
- removed-tool: removed=1, renamed=0, required-arg-additions=0, noise-only=no

### Ablation

Rename detection matters. Without rename-aware matching, the rename fixture looks like one removal plus one addition. With rename-aware matching, it becomes the correct story: one rename and no removals.

See `docs/experiments.md` for the full setup, commands, results, and limits.

## Architecture

- `cli.js`: snapshot, diff, policy, benchmark, and ablation commands
- `fixtures/`: baseline and changed tool-manifest snapshots
- `docs/experiments.md`: benchmark and ablation record
- `gates/`: formal harness verification

## Open-source angle

The story is simple and easy to share:

**We have good tooling for traces after failure, but we still lack a clean compatibility diff for MCP tool manifests before rollout.**

That makes MCPDiff useful for agent teams, MCP server authors, and platform engineers reviewing manifest changes in pull requests.

## Limitations

- current input format is a simple JSON snapshot with `tools[]`
- rename detection is heuristic, based on identical schema plus near-match tool names
- no live adapters for MCP registry exports or OpenAPI-derived tool bundles yet
- no PR comment formatter yet

## Roadmap

- adapters for popular MCP server export shapes
- PR summary output for GitHub Actions
- alias maps for intentional renames
- richer schema-change severity grading
