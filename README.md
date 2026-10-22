# MCPDiff

Compare two tool-manifest snapshots before rolling out a change. MCPDiff separates formatting noise from removed tools, likely renames, and newly required arguments.

## What it does

- normalizes noisy JSON manifest drift so key-order and whitespace churn do not trigger false alarms
- detects removed tools
- detects required-argument additions and optional-to-required flips
- detects likely renames when the contract stayed the same but the tool name changed
- enforces compatibility budgets in CI with a policy command
- records benchmark and ablation results for review

## Requirements

Node.js 18 or newer and Git. These commands use Node built-ins; no hosted service or API key is needed.

## Quick start

```bash
git clone https://github.com/yxjsxy/mcpdiff.git
cd mcpdiff
node cli.js snapshot fixtures/v1.tools.json
node cli.js diff fixtures/v1.tools.json fixtures/v2-noisy.tools.json
node cli.js diff fixtures/v1.tools.json fixtures/v2-renamed.tools.json
node cli.js policy fixtures/v1.tools.json fixtures/v2-tightened.tools.json --max-required-arg-additions 0
node cli.js policy fixtures/v1.tools.json fixtures/v2-removed.tools.json --max-removed-tools 0
node cli.js policy fixtures/v1.tools.json fixtures/v2-renamed.tools.json --no-silent-renames
node cli.js benchmark fixtures/v1.tools.json fixtures/v2-noisy.tools.json fixtures/v2-renamed.tools.json fixtures/v2-tightened.tools.json fixtures/v2-removed.tools.json
node cli.js ablate fixtures/v1.tools.json fixtures/v2-renamed.tools.json
```

## Use your own data

Inputs are JSON objects with a `tools` array. Each tool uses `name`, `description`, and an `args` array with `name`, `type`, and `required` fields. This is the repository’s simplified snapshot format, not an arbitrary live MCP server response. See `fixtures/v1.tools.json` before converting your manifest.

## Read the results

`snapshot` lists normalized tools; `diff` explains contract changes; `policy` enforces the chosen compatibility budgets. Policy failure exits with code **2**, allowing CI to stop a rollout. Rename detection is heuristic: review a suggested rename rather than treating it as proof of compatibility.

## Limitations

- current input format is a simple JSON snapshot with `tools[]`
- rename detection is heuristic, based on identical schema plus near-match tool names
- no live adapters for MCP registry exports or OpenAPI-derived tool bundles yet
- no PR comment formatter yet

## Examples and evaluation

The bundled `fixtures/` provide reproducible examples. See [experiment notes](docs/experiments.md) for the historical benchmark setup and its limits; those fixture results are not guarantees for other inputs.
