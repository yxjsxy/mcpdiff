# MCPDiff Roadmap

## 当前状态：🚧 活跃开发中
- 项目定位：MCP tool manifest compatibility preflight CLI，帮 agent / platform 团队在 rollout 前先看懂 manifest 变更到底是噪音还是 breakage
- 完成度：55%
- 当前状态：MVP 已可运行，包含 snapshot、diff、policy、benchmark、rename ablation、README、实验日志和 harness gate

## 项目介绍
MCPDiff 面向已经开始维护 MCP server tool manifest、但还缺少一层兼容性 preflight 的开发团队。它不替代 tracing 或 observability，而是解决更前面的那一步：先在 rollout 前看清 manifest 变更有没有移除 tool、偷偷收紧 schema、或者把 rename 误判成 breakage。

## 已实现功能
- tool snapshot 读取
- normalized diff
- removed tool detection
- required arg addition detection
- optional -> required flip detection
- rename-aware matching
- CI policy budgets
- benchmark 命令
- ablation 命令
- README + docs/experiments.md
- harness gate

## 未实现功能

### P0
- [ ] live MCP export adapters
- [ ] alias map for intentional renames

### P1
- PR summary markdown output
- severity tiers for schema changes
- JSON output formatting presets

### P2
- GitHub Action wrapper
- registry-wide manifest catalog
- web UI

## 技术栈
- Node.js
- 零依赖 CLI

## 运行方式
- `node cli.js snapshot fixtures/v1.tools.json`
- `node cli.js diff fixtures/v1.tools.json fixtures/v2-noisy.tools.json`
- `node cli.js diff fixtures/v1.tools.json fixtures/v2-renamed.tools.json`
- `node cli.js policy fixtures/v1.tools.json fixtures/v2-tightened.tools.json --max-required-arg-additions 0`
- `node cli.js policy fixtures/v1.tools.json fixtures/v2-removed.tools.json --max-removed-tools 0`
- `node cli.js benchmark fixtures/v1.tools.json fixtures/v2-noisy.tools.json fixtures/v2-renamed.tools.json fixtures/v2-tightened.tools.json fixtures/v2-removed.tools.json`
- `node cli.js ablate fixtures/v1.tools.json fixtures/v2-renamed.tools.json`

## 验收
- `bash ~/.openclaw/workspace/scripts/coding_harness.sh gates/mcpdiff-mvp.sh 3`
- `bash ~/.openclaw/workspace/scripts/coding_harness.sh gates/feature-rename-detect.sh 3`
- `bash ~/.openclaw/workspace/scripts/coding_harness.sh gates/feature-noisy-no-op.sh 3`
