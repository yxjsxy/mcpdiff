# MCPDiff Experiments

## Question

Can a local CLI classify MCP tool-manifest changes into compatibility-relevant buckets faster and more clearly than raw JSON diff review?

## Baseline and adjacent approaches

Baseline workflow in most repos:
1. export a manifest or tool snapshot
2. review raw JSON diff in GitHub
3. hope nobody misses a removed tool or a required-field tightening

Adjacent work:
- Langfuse and LangSmith surface failed tool calls after deployment
- MCP server frameworks help author and expose tools
- generic JSON diff shows structure churn but not compatibility semantics

MCPDiff adds the missing compatibility lens before rollout.

## Experiment setup

### Fixture A: `v1.tools.json`
- 6 baseline tools
- one representative server snapshot

### Fixture B: `v2-noisy.tools.json`
- same manifest semantics
- key order shuffled, whitespace changed, args re-ordered
- expected conclusion: noise only

### Fixture C: `v2-renamed.tools.json`
- `send_slack` renamed to `post_slack`
- same description and args
- expected conclusion: rename, not removal

### Fixture D: `v2-tightened.tools.json`
- `open_ticket` adds a required `customer_id`
- expected conclusion: schema tightened

### Fixture E: `v2-removed.tools.json`
- `write_repo` removed entirely
- expected conclusion: compatibility-breaking removal

## Benchmark commands

```bash
node cli.js benchmark fixtures/v1.tools.json fixtures/v2-noisy.tools.json fixtures/v2-renamed.tools.json fixtures/v2-tightened.tools.json fixtures/v2-removed.tools.json
node cli.js diff fixtures/v1.tools.json fixtures/v2-noisy.tools.json
node cli.js diff fixtures/v1.tools.json fixtures/v2-renamed.tools.json
node cli.js diff fixtures/v1.tools.json fixtures/v2-tightened.tools.json
node cli.js diff fixtures/v1.tools.json fixtures/v2-removed.tools.json
```

## Results

- noise-only: removed=0, renamed=0, required-arg-additions=0, noise-only=yes
- rename: removed=0, renamed=1, required-arg-additions=0, noise-only=no
- tightened-schema: removed=0, renamed=0, required-arg-additions=1, noise-only=no
- removed-tool: removed=1, renamed=0, required-arg-additions=0, noise-only=no

## Policy comparison

Commands:

```bash
node cli.js policy fixtures/v1.tools.json fixtures/v2-tightened.tools.json --max-required-arg-additions 0
node cli.js policy fixtures/v1.tools.json fixtures/v2-removed.tools.json --max-removed-tools 0
node cli.js policy fixtures/v1.tools.json fixtures/v2-renamed.tools.json --no-silent-renames
```

Observed result:
- tightened-schema fails because one required argument was added
- removed-tool fails because one tool was removed
- rename fixture fails under `--no-silent-renames`, which is useful when teams require explicit alias migration notes

Interpretation:
- MCPDiff turns compatibility review from free-form manifest scanning into explicit policy budgets that CI can enforce

## Ablation

Command:

```bash
node cli.js ablate fixtures/v1.tools.json fixtures/v2-renamed.tools.json
```

Observed result:
- strict matching: removed=1, added=1, renamed=0
- rename-aware matching: removed=0, added=0, renamed=1

Interpretation:
- rename-aware matching removes the most annoying false-positive pattern in manifest review

## Takeaways

1. Raw JSON diff is too noisy for rollout compatibility review.
2. Tool removals and schema tightening should be first-class counters, not buried in line-level patches.
3. Rename-aware matching materially improves the review signal.
4. Agent infrastructure teams need a preflight manifest-diff tool before they need a larger governance system.

## Limits

- fixtures are representative snapshots, not live registry exports
- rename detection is heuristic rather than alias-backed
- severity scoring is still coarse
