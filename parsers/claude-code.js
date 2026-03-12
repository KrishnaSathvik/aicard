/**
 * parsers/claude-code.js
 * Claude Code usage via ccusage (npx ccusage@latest)
 * Data: sessions (true count), tokens, cost, model breakdown, daily heatmap
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

function run(pkg, args) {
  try {
    const cmd = `npx ${pkg}@latest ${args.join(' ')}`;
    return JSON.parse(execSync(cmd, { timeout: 30_000, stdio: ['ignore', 'pipe', 'ignore'] }).toString());
  } catch { return null; }
}

function friendlyModel(name = '') {
  const n = name.replace(/-\d{8}(\d+)?$/, ''); // strip date suffix
  const map = {
    'claude-opus-4-6':    'Opus 4.6',
    'claude-opus-4-5':    'Opus 4.5',
    'claude-sonnet-4-6':  'Sonnet 4.6',
    'claude-sonnet-4-5':  'Sonnet 4.5',
    'claude-haiku-4-5':   'Haiku 4.5',
    'claude-opus-4':      'Opus 4',
    'claude-sonnet-4':    'Sonnet 4',
    'claude-haiku-4':     'Haiku 4',
    'claude-opus-3-7':    'Opus 3.7',
    'claude-sonnet-3-7':  'Sonnet 3.7',
    'claude-haiku-3-5':   'Haiku 3.5',
  };
  if (map[n]) return map[n];
  return n.replace('claude-', '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function detect() {
  const home = homedir();
  return [
    join(home, '.claude', 'projects'),
    join(home, '.config', 'claude', 'projects'),
  ].some(existsSync);
}

export async function parse(opts = {}) {
  const args = ['daily', '--json', '--breakdown', '--offline'];
  if (opts.since) args.push('--since', opts.since);
  if (opts.until) args.push('--until', opts.until);

  const daily = run('ccusage', args);
  const sessions = run('ccusage', ['session', '--json', '--offline']);

  if (!daily?.totals) return null;

  const { totals, daily: days = [] } = daily;

  // True session count from session command
  const sessionCount = sessions?.sessions?.length ?? days.length;

  // Model breakdown aggregated across all days
  const modelMap = {};
  for (const day of days) {
    for (const m of day.modelBreakdowns || []) {
      const key = m.modelName;
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
      displayName: friendlyModel(model),
      tokens_used: Math.round(d.tokens / 1000),  // stored in K
      cost_usd:    d.cost,
    }));

  return {
    tool:           'claude_code',
    sessions:       sessionCount,
    tokens_used:    Math.round((totals.totalTokens || 0) / 1000), // K units
    cost_usd:       totals.totalCost || 0,
    models:         modelBreakdown.map(m => m.displayName),
    modelBreakdown,
    daily:          days.map(d => ({
      date:        d.date,
      totalTokens: d.totalTokens,
      totalCost:   d.totalCost,
    })),
  };
}
