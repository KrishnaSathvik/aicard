/**
 * parsers/codex.js
 * OpenAI Codex usage via @ccusage/codex
 * Data: sessions, tokens, cost (proportional), model breakdown, daily heatmap
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Normalize date strings to YYYY-MM-DD.
 * @ccusage/codex returns "Feb 02, 2026" while the heatmap expects "2026-02-02".
 */
function normalizeDate(dateStr) {
  if (!dateStr) return dateStr;
  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  // Parse human-readable formats like "Feb 02, 2026" or "February 2, 2026"
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return dateStr; // return as-is if unparseable
}

function run(args) {
  try {
    const cmd = `npx @ccusage/codex@latest ${args.join(' ')}`;
    return JSON.parse(execSync(cmd, { timeout: 30_000, stdio: ['ignore', 'pipe', 'ignore'] }).toString());
  } catch { return null; }
}

function friendlyModel(name = '') {
  const map = {
    'gpt-5':           'GPT-5',
    'gpt-5-codex':     'GPT-5 Codex',
    'gpt-4o':          'GPT-4o',
    'gpt-4o-mini':     'GPT-4o Mini',
    'o1':              'o1',
    'o1-mini':         'o1 Mini',
    'o1-pro':          'o1 Pro',
    'o3':              'o3',
    'o3-mini':         'o3 Mini',
    'o4-mini':         'o4 Mini',
    'codex-mini':      'Codex Mini',
    'codex-mini-latest': 'Codex Mini',
  };
  return map[name] || name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function detect() {
  return [
    join(homedir(), '.codex'),
    join(homedir(), '.config', 'codex'),
  ].some(existsSync);
}

export async function parse(opts = {}) {
  const args = ['daily', '--json'];
  if (opts.since) args.push('--since', opts.since);
  if (opts.until) args.push('--until', opts.until);

  const data = run(args);
  if (!data?.totals) return null;

  const { totals, daily: days = [] } = data;

  // Codex uses `models` object per day, not modelBreakdowns array
  const modelMap = {};
  for (const day of days) {
    const totalDayTokens = day.totalTokens || 1;
    for (const [model, info] of Object.entries(day.models || {})) {
      const t = (info.inputTokens || 0) + (info.outputTokens || 0)
              + (info.cachedInputTokens || 0) + (info.reasoningOutputTokens || 0);
      if (!modelMap[model]) modelMap[model] = { tokens: 0, cost: 0 };
      modelMap[model].tokens += t;
      // Cost distributed proportionally since codex gives total cost per day
      const proportion = totalDayTokens > 0 ? t / totalDayTokens : 0;
      modelMap[model].cost += (day.costUSD || day.totalCost || 0) * proportion;
    }
  }

  const modelBreakdown = Object.entries(modelMap)
    .sort((a, b) => b[1].tokens - a[1].tokens)
    .map(([model, d]) => ({
      model,
      displayName: friendlyModel(model),
      tokens_used: Math.round(d.tokens / 1000),
      cost_usd:    d.cost,
    }));

  // Session count from session command
  const sessionData = run(['session', '--json']);
  const sessionCount = sessionData?.sessions?.length ?? days.length;

  return {
    tool:           'codex',
    sessions:       sessionCount,
    tokens_used:    Math.round((totals.totalTokens || 0) / 1000),
    cost_usd:       totals.costUSD || totals.totalCost || 0,
    models:         modelBreakdown.map(m => m.displayName),
    modelBreakdown,
    daily:          days.map(d => ({
      date:        normalizeDate(d.date),
      toolKey:     'codex',
      totalTokens: d.totalTokens,
      totalCost:   d.costUSD || d.totalCost || 0,
    })),
  };
}
