/**
 * parsers/qwen.js
 * Qwen Code CLI usage via direct JSONL parsing
 * Qwen Code is a fork of Gemini CLI — same file format, different path.
 * Storage: ~/.qwen/tmp/{projectHash}/chats/*.json
 *          also checks ~/.config/qwen/ for settings
 * Data: sessions, tokens (input+output), daily heatmap. Cost calculated from model pricing.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Qwen model pricing (per 1M tokens, USD) — approximate as of 2026
const QWEN_PRICING = {
  'qwen3-coder-plus':  { input: 4.50, output: 9.00 },
  'qwen3-coder-next':  { input: 3.50, output: 7.00 },
  'qwen3.5-plus':      { input: 4.50, output: 9.00 },
  'qwen3-coder-480b':  { input: 4.50, output: 9.00 },
  'qwen3-coder-30b':   { input: 0.50, output: 2.00 },
  'default':           { input: 2.00, output: 6.00 },
};

function getPrice(model = '') {
  for (const [key, price] of Object.entries(QWEN_PRICING)) {
    if (model.toLowerCase().includes(key)) return price;
  }
  return QWEN_PRICING.default;
}

export function detect() {
  return [
    join(homedir(), '.qwen'),
    join(homedir(), '.config', 'qwen'),
  ].some(existsSync);
}

function parseFile(filePath) {
  try {
    const raw = readFileSync(filePath, 'utf-8').trim();
    if (!raw) return null;

    const data = JSON.parse(raw);
    const messages = Array.isArray(data)
      ? data
      : (data.messages || data.history || data.conversation || []);

    let inputTokens = 0, outputTokens = 0;
    let detectedModel = '';

    for (const msg of messages) {
      // Model detection from message metadata
      if (msg.model && !detectedModel) detectedModel = msg.model;
      if (msg.metadata?.model && !detectedModel) detectedModel = msg.metadata.model;

      const u = msg.usageMetadata;
      if (u) {
        inputTokens  += u.promptTokenCount     || u.inputTokenCount     || 0;
        outputTokens += u.candidatesTokenCount || u.outputTokenCount    || 0;
      }
      // token_count event (Gemini CLI format)
      if (msg.type === 'event_msg' && msg.payload?.type === 'token_count') {
        const info = msg.payload.info?.last_token_usage || {};
        inputTokens  += info.input_tokens  || 0;
        outputTokens += info.output_tokens || 0;
      }
    }

    return { inputTokens, outputTokens, messageCount: messages.length, model: detectedModel };
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

export async function parse(opts = {}) {
  const base = join(homedir(), '.qwen', 'tmp');
  if (!existsSync(base)) return null;

  let totalInput = 0, totalOutput = 0, fileCount = 0, totalCost = 0;
  const dailyMap = {};
  const modelSet = new Set();

  try {
    const projectDirs = readdirSync(base, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => join(base, e.name, 'chats'));

    for (const chatDir of projectDirs) {
      if (!existsSync(chatDir)) continue;
      const files = readdirSync(chatDir).filter(f => f.endsWith('.json'));

      for (const file of files) {
        const fullPath = join(chatDir, file);
        const result = parseFile(fullPath);
        if (!result) continue;

        fileCount++;
        totalInput  += result.inputTokens;
        totalOutput += result.outputTokens;
        if (result.model) modelSet.add(result.model);

        // Estimate cost from pricing table
        const price = getPrice(result.model);
        const cost = (result.inputTokens / 1_000_000) * price.input
                   + (result.outputTokens / 1_000_000) * price.output;
        totalCost += cost;

        const date = getDateFromFile(fullPath);
        if (!dailyMap[date]) dailyMap[date] = { totalTokens: 0, totalCost: 0 };
        dailyMap[date].totalTokens += result.inputTokens + result.outputTokens;
        dailyMap[date].totalCost   += cost;
      }
    }
  } catch { return null; }

  if (fileCount === 0) return null;

  const daily = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({ date, totalTokens: d.totalTokens, totalCost: d.totalCost }));

  return {
    tool:        'qwen',
    sessions:    fileCount,
    tokens_used: Math.round((totalInput + totalOutput) / 1000),
    cost_usd:    totalCost,
    models:      modelSet.size > 0 ? [...modelSet] : ['Qwen Code'],
    modelBreakdown: [],
    daily,
  };
}
