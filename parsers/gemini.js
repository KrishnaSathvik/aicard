/**
 * parsers/gemini.js
 * Gemini CLI usage via direct JSONL parsing
 * Storage: ~/.gemini/tmp/{projectHash}/chats/*.json
 * Data: sessions, tokens (input+output), daily heatmap. No cost (free quota).
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export function detect() {
  return existsSync(join(homedir(), '.gemini'));
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

    for (const msg of messages) {
      const u = msg.usageMetadata;
      if (u) {
        inputTokens  += u.promptTokenCount     || u.inputTokenCount     || 0;
        outputTokens += u.candidatesTokenCount || u.outputTokenCount    || 0;
      }
      // token_count event format
      if (msg.type === 'event_msg' && msg.payload?.type === 'token_count') {
        const info = msg.payload.info?.last_token_usage || {};
        inputTokens  += info.input_tokens  || 0;
        outputTokens += info.output_tokens || 0;
      }
    }

    return { inputTokens, outputTokens, messageCount: messages.length };
  } catch { return null; }
}

function getDateFromFile(filePath) {
  try {
    const name = filePath.split('/').pop();
    const m = name.match(/(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    // Fall back to file mtime
    const mtime = statSync(filePath).mtime;
    return mtime.toISOString().slice(0, 10);
  } catch { return new Date().toISOString().slice(0, 10); }
}

export async function parse(opts = {}) {
  const base = join(homedir(), '.gemini', 'tmp');
  if (!existsSync(base)) return null;

  let totalInput = 0, totalOutput = 0, fileCount = 0;
  const dailyMap = {};

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

        const date = getDateFromFile(fullPath);
        if (!dailyMap[date]) dailyMap[date] = { totalTokens: 0, totalCost: 0 };
        dailyMap[date].totalTokens += result.inputTokens + result.outputTokens;
      }
    }
  } catch { return null; }

  if (fileCount === 0) return null;

  const daily = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({ date, totalTokens: d.totalTokens, totalCost: 0 }));

  return {
    tool:        'gemini',
    sessions:    fileCount,
    tokens_used: Math.round((totalInput + totalOutput) / 1000),
    cost_usd:    0,   // Free quota — not stored
    models:      ['Gemini'],
    modelBreakdown: [],
    daily,
  };
}
