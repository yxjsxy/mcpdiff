#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error('Usage: node cli.js <snapshot|diff|policy|benchmark|ablate> <paths...>');
  process.exit(1);
}

function parseArgs(argv) {
  const positional = [];
  const options = {
    json: false,
    maxRemovedTools: null,
    maxRequiredArgAdditions: null,
    noSilentRenames: false,
    renameThreshold: 0.84,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--max-removed-tools') {
      options.maxRemovedTools = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--max-required-arg-additions') {
      options.maxRequiredArgAdditions = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--no-silent-renames') {
      options.noSilentRenames = true;
      continue;
    }
    if (arg === '--rename-threshold') {
      options.renameThreshold = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    positional.push(arg);
  }
  return { positional, options };
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeTool(tool) {
  const args = Array.isArray(tool.args) ? tool.args : [];
  return {
    name: tool.name,
    description: normalizeText(tool.description),
    args: args
      .map((arg) => ({
        name: arg.name,
        type: arg.type || 'string',
        required: Boolean(arg.required),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function loadTools(file) {
  const resolved = path.resolve(file);
  const payload = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const tools = (payload.tools || []).map(normalizeTool).sort((a, b) => a.name.localeCompare(b.name));
  return {
    file: resolved,
    server: payload.server || path.basename(file),
    tools,
  };
}

function toolSignature(tool, ignoreName = false) {
  return JSON.stringify({
    description: tool.description,
    args: tool.args,
    ...(ignoreName ? {} : { name: tool.name }),
  });
}

function levenshtein(a, b) {
  const left = Array.from(a);
  const right = Array.from(b);
  const matrix = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
  for (let i = 0; i <= left.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[left.length][right.length];
}

function similarity(a, b) {
  const max = Math.max(a.length, b.length, 1);
  return 1 - levenshtein(a, b) / max;
}

function mapByName(tools) {
  return new Map(tools.map((tool) => [tool.name, tool]));
}

function summarizeArgs(leftArgs, rightArgs) {
  const left = new Map(leftArgs.map((arg) => [arg.name, arg]));
  const right = new Map(rightArgs.map((arg) => [arg.name, arg]));
  const addedRequired = [];
  const addedOptional = [];
  const removed = [];
  const requiredFlips = [];

  for (const [name, arg] of right.entries()) {
    if (!left.has(name)) {
      (arg.required ? addedRequired : addedOptional).push(name);
      continue;
    }
    const before = left.get(name);
    if (!before.required && arg.required) requiredFlips.push(name);
  }
  for (const name of left.keys()) {
    if (!right.has(name)) removed.push(name);
  }

  return {
    addedRequired,
    addedOptional,
    removed,
    requiredFlips,
  };
}

function diffFiles(leftFile, rightFile, options = {}) {
  const left = loadTools(leftFile);
  const right = loadTools(rightFile);
  const leftByName = mapByName(left.tools);
  const rightByName = mapByName(right.tools);
  const removedCandidates = [];
  const addedCandidates = [];
  const changed = [];

  for (const tool of left.tools) {
    const peer = rightByName.get(tool.name);
    if (!peer) {
      removedCandidates.push(tool);
      continue;
    }
    const delta = summarizeArgs(tool.args, peer.args);
    if (toolSignature(tool) !== toolSignature(peer) || delta.addedRequired.length || delta.addedOptional.length || delta.removed.length || delta.requiredFlips.length) {
      changed.push({ name: tool.name, args: delta });
    }
  }

  for (const tool of right.tools) {
    if (!leftByName.has(tool.name)) addedCandidates.push(tool);
  }

  const renamed = [];
  const consumedAdded = new Set();
  const consumedRemoved = new Set();
  removedCandidates.forEach((removedTool) => {
    let best = null;
    addedCandidates.forEach((addedTool, index) => {
      if (consumedAdded.has(index)) return;
      if (toolSignature(removedTool, true) !== toolSignature(addedTool, true)) return;
      const score = similarity(removedTool.name, addedTool.name);
      const renameScore = score >= (options.renameThreshold || 0.84)
        ? score
        : (options.disableSchemaRenameFallback ? -1 : 0.9);
      if (renameScore < 0) return;
      if (!best || renameScore > best.score) best = { index, addedTool, score: renameScore };
    });
    if (best) {
      consumedAdded.add(best.index);
      consumedRemoved.add(removedTool.name);
      renamed.push({ from: removedTool.name, to: best.addedTool.name, similarity: Number(best.score.toFixed(2)) });
    }
  });

  const removed = removedCandidates.filter((tool) => !consumedRemoved.has(tool.name)).map((tool) => tool.name);
  const added = addedCandidates.filter((_, index) => !consumedAdded.has(index)).map((tool) => tool.name);
  const addedRequiredArgs = changed.flatMap((item) => item.args.addedRequired.map((arg) => `${item.name}.${arg}`));
  const requiredFlips = changed.flatMap((item) => item.args.requiredFlips.map((arg) => `${item.name}.${arg}`));
  const noiseOnly = added.length === 0 && removed.length === 0 && renamed.length === 0 && addedRequiredArgs.length === 0 && requiredFlips.length === 0 && changed.every((item) => item.args.addedOptional.length === 0 && item.args.removed.length === 0);

  return {
    baseline: path.basename(left.file),
    candidate: path.basename(right.file),
    server: left.server,
    summary: {
      baselineTools: left.tools.length,
      candidateTools: right.tools.length,
      removedTools: removed.length,
      addedTools: added.length,
      renamedTools: renamed.length,
      changedTools: changed.length,
      addedRequiredArgs: addedRequiredArgs.length,
      requiredFlips: requiredFlips.length,
      noiseOnly,
    },
    removed,
    added,
    renamed,
    changed,
    addedRequiredArgs,
    requiredFlips,
  };
}

function renderDiff(result) {
  const lines = [
    '# MCPDiff Report',
    '',
    `- baseline: ${result.baseline}`,
    `- candidate: ${result.candidate}`,
    `- server: ${result.server}`,
    `- removed tools: ${result.summary.removedTools}`,
    `- added tools: ${result.summary.addedTools}`,
    `- renamed tools: ${result.summary.renamedTools}`,
    `- changed tools: ${result.summary.changedTools}`,
    `- added required args: ${result.summary.addedRequiredArgs}`,
    `- required flips: ${result.summary.requiredFlips}`,
    `- noise only: ${result.summary.noiseOnly ? 'yes' : 'no'}`,
    '',
    '## Renames'
  ];
  if (result.renamed.length) result.renamed.forEach((item) => lines.push(`- ${item.from} -> ${item.to} (similarity ${item.similarity})`));
  else lines.push('- none');
  lines.push('', '## Removed tools');
  if (result.removed.length) result.removed.forEach((item) => lines.push(`- ${item}`));
  else lines.push('- none');
  lines.push('', '## Added tools');
  if (result.added.length) result.added.forEach((item) => lines.push(`- ${item}`));
  else lines.push('- none');
  lines.push('', '## Contract-tightening changes');
  if (result.addedRequiredArgs.length || result.requiredFlips.length) {
    result.addedRequiredArgs.forEach((item) => lines.push(`- added required arg: ${item}`));
    result.requiredFlips.forEach((item) => lines.push(`- optional -> required: ${item}`));
  } else {
    lines.push('- none');
  }
  return `${lines.join('\n')}\n`;
}

function policy(leftFile, rightFile, options) {
  const result = diffFiles(leftFile, rightFile, options);
  const maxRemovedTools = Number.isFinite(options.maxRemovedTools) ? options.maxRemovedTools : Infinity;
  const maxRequiredArgAdditions = Number.isFinite(options.maxRequiredArgAdditions) ? options.maxRequiredArgAdditions : Infinity;
  const failures = [];
  if (result.summary.removedTools > maxRemovedTools) failures.push(`removed tools ${result.summary.removedTools} exceeds budget ${maxRemovedTools}`);
  if ((result.summary.addedRequiredArgs + result.summary.requiredFlips) > maxRequiredArgAdditions) failures.push(`required arg additions ${result.summary.addedRequiredArgs + result.summary.requiredFlips} exceeds budget ${maxRequiredArgAdditions}`);
  if (options.noSilentRenames && result.summary.renamedTools > 0) failures.push(`renamed tools ${result.summary.renamedTools} detected while --no-silent-renames is enabled`);
  const verdict = failures.length ? 'FAIL' : 'PASS';
  const lines = [
    '# MCPDiff Policy',
    '',
    `- baseline: ${result.baseline}`,
    `- candidate: ${result.candidate}`,
    `- removed tools: ${result.summary.removedTools} (budget ${Number.isFinite(maxRemovedTools) ? maxRemovedTools : 'inf'})`,
    `- required arg additions: ${result.summary.addedRequiredArgs + result.summary.requiredFlips} (budget ${Number.isFinite(maxRequiredArgAdditions) ? maxRequiredArgAdditions : 'inf'})`,
    `- renamed tools: ${result.summary.renamedTools}`,
    `- verdict: ${verdict}`,
    ''
  ];
  if (failures.length) {
    lines.push('## Failures');
    failures.forEach((item) => lines.push(`- ${item}`));
  } else {
    lines.push('## Takeaway');
    lines.push('- Candidate manifest stays inside the configured compatibility budget.');
  }
  return { verdict, output: `${lines.join('\n')}\n`, failures, diff: result };
}

function benchmark(...files) {
  const [baseline, noisy, renamed, tightened, removed] = files;
  const cases = [
    ['noise-only', diffFiles(baseline, noisy)],
    ['rename', diffFiles(baseline, renamed)],
    ['tightened-schema', diffFiles(baseline, tightened)],
    ['removed-tool', diffFiles(baseline, removed)],
  ];
  const lines = [
    '# MCPDiff Benchmark',
    '',
    '## Setup',
    '- baseline: raw JSON diff or manual review over MCP tool manifests',
    '- adjacent community tools: Langfuse, LangSmith, and generic Git diff show manifest changes, but they do not classify contract compatibility drift for MCP tool surfaces',
    '- objective: separate harmless formatting churn from compatibility-impacting changes before an agent rollout',
    '',
    '## Results',
  ];
  cases.forEach(([name, result]) => {
    lines.push(`- ${name}: removed=${result.summary.removedTools}, renamed=${result.summary.renamedTools}, required-arg-additions=${result.summary.addedRequiredArgs + result.summary.requiredFlips}, noise-only=${result.summary.noiseOnly ? 'yes' : 'no'}`);
  });
  lines.push('', '## Takeaway');
  lines.push('- MCPDiff compresses compatibility review into a few high-signal counters instead of a full raw diff scan.');
  return `${lines.join('\n')}\n`;
}

function ablate(leftFile, rightFile) {
  const strict = diffFiles(leftFile, rightFile, { renameThreshold: 1.1, disableSchemaRenameFallback: true });
  const renameAware = diffFiles(leftFile, rightFile, { renameThreshold: 0.84 });
  return `# MCPDiff Ablation\n\n## Rename detection\n- strict matching: removed=${strict.summary.removedTools}, added=${strict.summary.addedTools}, renamed=${strict.summary.renamedTools}\n- rename-aware matching: removed=${renameAware.summary.removedTools}, added=${renameAware.summary.addedTools}, renamed=${renameAware.summary.renamedTools}\n\n## Takeaway\n- rename-aware comparison removes the false alarm pattern where one semantic rename looks like a removal plus an addition.\n`;
}

const [, , command, ...argv] = process.argv;
if (!command) usage();
const { positional, options } = parseArgs(argv);

if (command === 'snapshot') {
  const [file] = positional;
  if (!file) usage();
  const result = loadTools(file);
  process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : `# MCPDiff Snapshot\n\n- server: ${result.server}\n- tools: ${result.tools.length}\n- names: ${result.tools.map((tool) => tool.name).join(', ')}\n`);
} else if (command === 'diff') {
  const [left, right] = positional;
  if (!left || !right) usage();
  const result = diffFiles(left, right, options);
  process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : renderDiff(result));
} else if (command === 'policy') {
  const [left, right] = positional;
  if (!left || !right) usage();
  const result = policy(left, right, options);
  if (result.verdict === 'FAIL') {
    process.stdout.write(result.output);
    process.stderr.write(result.failures.join('\n') + '\n');
    process.exit(2);
  }
  process.stdout.write(result.output);
} else if (command === 'benchmark') {
  if (positional.length < 5) usage();
  process.stdout.write(benchmark(...positional));
} else if (command === 'ablate') {
  const [left, right] = positional;
  if (!left || !right) usage();
  process.stdout.write(ablate(left, right));
} else {
  usage();
}
