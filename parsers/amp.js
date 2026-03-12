/**
 * parsers/amp.js
 * Amp (Sourcegraph) usage via @ccusage/amp
 * Data: sessions, tokens, cost, credits, model breakdown, daily heatmap
 * Storage: ~/.local/share/amp/ or ~/.config/amp/
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

function run(args) {
  try {
    const cmd = `npx @ccusage/amp@latest ${args.join(' ')}`;
    return JSON.parse(execSync(cmd, { timeout: 30_000, stdio: ['ignore', 'pipe', 'ignore'] }).toString());
  } catch { return null; }
}

export function detect() {
  return [
    join(homedir(), '.local', 'share', 'amp'),
    join(homedir(), '.config', 'amp'),
    join(homedir(), '.amp'),
  ].some(existsSync);
}

export async function parse(opts = {}) {
  const args = ['daily', '--json'];
  if (opts.since) args.push('--since', opts.since);
  if (opts.until) args.push('--until', opts.until);

  const data = run(args);
  if (!data?.totals) return null;

  const { totals, daily: days = [] } = data;

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

  // Amp tracks credits separately
  const credits = totals.credits || totals.creditsUsed || null;

  return {
    tool:           'amp',
    sessions:       sessionCount,
    tokens_used:    Math.round((totals.totalTokens || 0) / 1000),
    cost_usd:       totals.totalCost || totals.costUSD || 0,
    credits,
    models:         modelBreakdown.map(m => m.displayName),
    modelBreakdown,
    daily:          days.map(d => ({
      date:        d.date,
      totalTokens: d.totalTokens,
      totalCost:   d.totalCost || 0,
    })),
  };
}
