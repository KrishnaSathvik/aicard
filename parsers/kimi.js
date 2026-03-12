/**
 * parsers/kimi.js
 * Kimi Code CLI (Moonshot AI) usage via local session files
 *
 * Verified storage layout (from Kimi forum + docs):
 *   ~/.kimi/kimi.json          — maps working dirs → session IDs
 *   ~/.kimi/sessions/<id>/     — conversation data per session
 *   ~/.kimi/config.json        — user config
 *
 * Token format: OpenAI-compatible (prompt_tokens / completion_tokens)
 *   plus Gemini-compatible (promptTokenCount / candidatesTokenCount)
 *   plus Anthropic-compatible (input_tokens / output_tokens)
 *
 * Data: sessions, tokens, cost estimate, daily heatmap
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Kimi K2.5 pricing (per 1M tokens, USD) — as of Jan 2026
const KIMI_PRICING = {
  'kimi-k2':     { input: 0.60, output: 2.50 },
  'kimi-k2-5':   { input: 0.60, output: 2.50 },
  'kimi-k2.5':   { input: 0.60, output: 2.50 },
  'moonshot-v1': { input: 0.12, output: 0.50 },
  'default':     { input: 0.60, output: 2.50 },
};

function getPrice(model = '') {
  const lower = model.toLowerCase();
  for (const [key, price] of Object.entries(KIMI_PRICING)) {
    if (key !== 'default' && lower.includes(key)) return price;
  }
  return KIMI_PRICING.default;
}

// Primary: ~/.kimi  (confirmed by Kimi forum)
// Fallback: ~/.config/kimi, ~/.local/share/kimi (Linux XDG convention)
const KIMI_DIRS = [
  join(homedir(), '.kimi'),
  join(homedir(), '.config', 'kimi'),
  join(homedir(), '.local', 'share', 'kimi'),
];

export function detect() {
  return KIMI_DIRS.some(existsSync);
}

/**
 * Get session count from kimi.json (maps working dirs → session IDs)
 */
function getSessionCountFromIndex(baseDir) {
  try {
    const indexPath = join(baseDir, 'kimi.json');
    if (!existsSync(indexPath)) return 0;
    const data = JSON.parse(readFileSync(indexPath, 'utf-8'));
    // kimi.json maps directory paths to session IDs
    if (typeof data === 'object' && !Array.isArray(data)) {
      return Object.keys(data).length;
    }
    return 0;
  } catch { return 0; }
}

/**
 * Extract tokens from a parsed JSON object — handles multiple API formats
 */
function extractTokens(obj) {
  let input = 0, output = 0;

  // OpenAI format (most likely for Kimi)
  const usage = obj.usage || obj.token_usage || obj.usageMetadata;
  if (usage) {
    input  += usage.prompt_tokens       || usage.input_tokens  || usage.promptTokenCount     || 0;
    output += usage.completion_tokens   || usage.output_tokens || usage.candidatesTokenCount || 0;
  }

  // Message-level usage (Anthropic style)
  if (obj.type === 'message' && obj.usage) {
    input  += obj.usage.input_tokens  || 0;
    output += obj.usage.output_tokens || 0;
  }

  // Gemini CLI event format
  if (obj.type === 'event_msg' && obj.payload?.type === 'token_count') {
    const info = obj.payload.info?.last_token_usage || {};
    input  += info.input_tokens  || 0;
    output += info.output_tokens || 0;
  }

  return { input, output };
}

function parseJsonlFile(filePath) {
  try {
    const lines = readFileSync(filePath, 'utf-8').trim().split('\n');
    let inputTokens = 0, outputTokens = 0, model = '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.model && !model) model = obj.model;
        const { input, output } = extractTokens(obj);
        inputTokens += input;
        outputTokens += output;
      } catch { /* skip malformed lines */ }
    }

    return { inputTokens, outputTokens, lineCount: lines.length, model };
  } catch { return null; }
}

function parseJsonFile(filePath) {
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8').trim());
    let inputTokens = 0, outputTokens = 0, model = '';

    const messages = data.messages || data.history || data.conversation || (Array.isArray(data) ? data : []);
    for (const msg of messages) {
      if (msg.model && !model) model = msg.model;
      const { input, output } = extractTokens(msg);
      inputTokens += input;
      outputTokens += output;
    }

    // Top-level usage
    if (data.usage) {
      const { input, output } = extractTokens(data);
      inputTokens += input;
      outputTokens += output;
    }
    if (data.model && !model) model = data.model;

    return { inputTokens, outputTokens, lineCount: messages.length, model };
  } catch { return null; }
}

function getDateFromFile(filePath) {
  try {
    const name = filePath.split('/').pop();
    const m = name.match(/(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    return statSync(filePath).mtime.toISOString().slice(0, 10);
  } catch { return new Date().toISOString().slice(0, 10); }
}

function scanDir(dir, depth = 0) {
  const results = [];
  if (depth > 4 || !existsSync(dir)) return results;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...scanDir(full, depth + 1));
      } else if (entry.name.endsWith('.jsonl') || entry.name.endsWith('.json')) {
        // Skip kimi.json and config.json — those aren't conversation files
        if (entry.name === 'kimi.json' || entry.name === 'config.json') continue;
        results.push(full);
      }
    }
  } catch {}
  return results;
}

export async function parse(opts = {}) {
  const baseDir = KIMI_DIRS.find(existsSync);
  if (!baseDir) return null;

  // Prefer sessions/ subdirectory (confirmed storage location)
  const sessionsDir = join(baseDir, 'sessions');
  const scanRoot = existsSync(sessionsDir) ? sessionsDir : baseDir;

  const files = scanDir(scanRoot);

  // Also get session count from kimi.json index (more reliable than file count)
  const indexSessionCount = getSessionCountFromIndex(baseDir);

  if (files.length === 0 && indexSessionCount === 0) return null;

  let totalInput = 0, totalOutput = 0, fileCount = 0, totalCost = 0;
  const dailyMap = {};
  const modelSet = new Set();

  for (const filePath of files) {
    const result = filePath.endsWith('.jsonl')
      ? parseJsonlFile(filePath)
      : parseJsonFile(filePath);

    if (!result) continue;

    fileCount++;
    totalInput  += result.inputTokens;
    totalOutput += result.outputTokens;
    if (result.model) modelSet.add(result.model);

    const price = getPrice(result.model);
    const cost = (result.inputTokens / 1_000_000) * price.input
               + (result.outputTokens / 1_000_000) * price.output;
    totalCost += cost;

    const date = getDateFromFile(filePath);
    if (!dailyMap[date]) dailyMap[date] = { totalTokens: 0, totalCost: 0 };
    dailyMap[date].totalTokens += result.inputTokens + result.outputTokens;
    dailyMap[date].totalCost   += cost;
  }

  // Use whichever session count is higher — index file or parsed files
  const sessions = Math.max(indexSessionCount, fileCount);
  if (sessions === 0) return null;

  const daily = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({ date, toolKey: 'kimi', totalTokens: d.totalTokens, totalCost: d.totalCost }));

  return {
    tool:        'kimi',
    sessions,
    tokens_used: Math.round((totalInput + totalOutput) / 1000),
    cost_usd:    totalCost,
    models:      modelSet.size > 0 ? [...modelSet] : ['Kimi K2.5'],
    modelBreakdown: [],
    daily,
    _meta: {
      indexSessions: indexSessionCount,
      parsedFiles:   fileCount,
      scanRoot,
    },
  };
}
