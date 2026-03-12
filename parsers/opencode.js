/**
 * parsers/opencode.js
 * OpenCode usage via @ccusage/opencode
 * Data: sessions, tokens, cost, model breakdown, daily heatmap
 * Storage: ~/.local/share/opencode/storage/
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/** Normalize date strings to YYYY-MM-DD. */
function normalizeDate(d) {
  if (!d || /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const p = new Date(d);
  return isNaN(p.getTime()) ? d : p.toISOString().slice(0, 10);
}

function run(args) {
  try {
    const cmd = `npx @ccusage/opencode@latest ${args.join(' ')}`;
    const raw = execSync(cmd, { timeout: 30_000, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    // @ccusage/opencode has a known bug where logger messages contaminate JSON output.
    // Strip any non-JSON prefix lines before the opening { or [
    const jsonStart = raw.search(/[\[{]/);
    if (jsonStart < 0) return null;
    return JSON.parse(raw.slice(jsonStart));
  } catch { return null; }
}

export function detect() {
  return [
    join(homedir(), '.local', 'share', 'opencode'),
    join(homedir(), '.config', 'opencode'),
    process.env.OPENCODE_DATA_DIR,
  ].filter(Boolean).some(existsSync);
}

export async function parse(opts = {}) {
  const args = ['daily', '--json'];
  if (opts.since) args.push('--since', opts.since);
  if (opts.until) args.push('--until', opts.until);

  const data = run(args);
  if (!data?.totals) return null;

  const { totals, daily: days = [] } = data;

  // OpenCode stores cost: 0 in files; ccusage calculates from LiteLLM pricing
  const modelMap = {};
  for (const day of days) {
    for (const m of day.modelBreakdowns || []) {
      const key = m.modelName || m.model;
      if (!key) continue;
      if (!modelMap[key]) modelMap[key] = { tokens: 0, cost: 0 };
      const t = (m.inputTokens || 0) + (m.outputTokens || 0)
              + (m.cacheCreationTokens || 0) + (m.cacheReadTokens || 0);
      modelMap[key].tokens += t;
      modelMap[key].cost   += m.cost || 0;
    }
  }

  const modelBreakdown = Object.entries(modelMap)
    .sort((a, b) => b[1].tokens - a[1].tokens)
    .map(([model, d]) => ({
      model,
      displayName: model.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      tokens_used: Math.round(d.tokens / 1000),
      cost_usd:    d.cost,
    }));

  const sessionData = run(['session', '--json']);
  const sessionCount = sessionData?.sessions?.length ?? days.length;

  return {
    tool:           'opencode',
    sessions:       sessionCount,
    tokens_used:    Math.round((totals.totalTokens || 0) / 1000),
    cost_usd:       totals.totalCost || totals.costUSD || 0,
    models:         modelBreakdown.map(m => m.displayName),
    modelBreakdown,
    daily:          days.map(d => ({
      date:        normalizeDate(d.date),
      toolKey:     'opencode',
      totalTokens: d.totalTokens,
      totalCost:   d.totalCost || 0,
    })),
  };
}
