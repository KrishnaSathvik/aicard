#!/usr/bin/env node
/**
 * TEST: Codex local JSONL parser
 * 
 * Codex stores sessions at:
 *   ~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<uuid>.jsonl
 * 
 * Each JSONL file = one session
 * Each line = one event (message, tool_call, response, etc.)
 * 
 * Run:
 *   node test-codex.mjs
 *   node test-codex.mjs --dir /custom/path/to/sessions
 */

import fs   from 'fs';
import path from 'path';
import os   from 'os';
import readline from 'readline';

// ── Config ────────────────────────────────────────────────────────────────────
const dirFlag = process.argv.indexOf('--dir');
const SESSIONS_DIR = dirFlag !== -1
  ? process.argv[dirFlag + 1]
  : path.join(os.homedir(), '.codex', 'sessions');

// ── Helpers ───────────────────────────────────────────────────────────────────
function exists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function* walkJsonl(dir) {
  if (!exists(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkJsonl(full);
    else if (entry.name.endsWith('.jsonl')) yield full;
  }
}

async function parseJsonlFile(filePath) {
  const result = {
    file:         filePath,
    date:         null,
    inputTokens:  0,
    outputTokens: 0,
    cacheTokens:  0,
    model:        null,
    messageCount: 0,
    eventTypes:   {},
  };

  // Extract date from path: sessions/2026/03/11/rollout-...jsonl
  const dateMatch = filePath.match(/sessions[/\\](\d{4})[/\\](\d{2})[/\\](\d{2})[/\\]/);
  if (dateMatch) {
    result.date = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
  }

  try {
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        const type = obj.type || obj.role || 'unknown';

        result.eventTypes[type] = (result.eventTypes[type] || 0) + 1;
        result.messageCount++;

        // Token extraction — try multiple known shapes
        // Shape 1: obj.usage.input_tokens (Claude Code style)
        if (obj.usage?.input_tokens)  result.inputTokens  += obj.usage.input_tokens;
        if (obj.usage?.output_tokens) result.outputTokens += obj.usage.output_tokens;
        if (obj.usage?.cache_read_input_tokens) result.cacheTokens += obj.usage.cache_read_input_tokens;

        // Shape 2: obj.message.usage (nested)
        if (obj.message?.usage?.input_tokens)  result.inputTokens  += obj.message.usage.input_tokens;
        if (obj.message?.usage?.output_tokens) result.outputTokens += obj.message.usage.output_tokens;

        // Shape 3: obj.response.usage
        if (obj.response?.usage?.input_tokens)  result.inputTokens  += obj.response.usage.input_tokens;
        if (obj.response?.usage?.output_tokens) result.outputTokens += obj.response.usage.output_tokens;

        // Model detection
        if (obj.model && !result.model) result.model = obj.model;
        if (obj.message?.model && !result.model) result.model = obj.message.model;
        if (obj.response?.model && !result.model) result.model = obj.response.model;

      } catch { /* skip malformed lines */ }
    }
  } catch (err) {
    result.error = err.message;
  }

  return result;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  🔬  Codex JSONL Parser — Local Data Test');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`  Looking in: ${SESSIONS_DIR}\n`);

  if (!exists(SESSIONS_DIR)) {
    console.log('  ❌  Sessions directory not found.');
    console.log('  → Codex not installed, or uses a custom CODEX_HOME path.\n');
    console.log('  Try: node test-codex.mjs --dir ~/.codex/sessions\n');
    process.exit(0);
  }

  // Collect all JSONL files
  const files = [...walkJsonl(SESSIONS_DIR)];
  console.log(`  ✅  Found ${files.length} session files\n`);

  if (files.length === 0) {
    console.log('  No .jsonl files found — Codex may not have been used yet.\n');
    process.exit(0);
  }

  // Parse all files
  console.log('  Parsing sessions...\n');
  const sessions = [];
  for (const f of files) {
    const result = await parseJsonlFile(f);
    sessions.push(result);
  }

  // ── Aggregate stats ────────────────────────────────────────────────────────
  let totalInput  = 0;
  let totalOutput = 0;
  let totalCache  = 0;
  const modelCounts  = {};
  const dailyTotals  = {};
  const allEventTypes = {};

  for (const s of sessions) {
    totalInput  += s.inputTokens;
    totalOutput += s.outputTokens;
    totalCache  += s.cacheTokens;

    if (s.model) modelCounts[s.model] = (modelCounts[s.model] || 0) + 1;
    if (s.date) {
      dailyTotals[s.date] = (dailyTotals[s.date] || 0) + s.inputTokens + s.outputTokens;
    }
    for (const [k, v] of Object.entries(s.eventTypes)) {
      allEventTypes[k] = (allEventTypes[k] || 0) + v;
    }
  }

  console.log('  ── Summary ──────────────────────────────────');
  console.log(`  Sessions:       ${sessions.length}`);
  console.log(`  Input tokens:   ${totalInput.toLocaleString()}`);
  console.log(`  Output tokens:  ${totalOutput.toLocaleString()}`);
  console.log(`  Cache tokens:   ${totalCache.toLocaleString()}`);
  console.log(`  Total tokens:   ${(totalInput + totalOutput).toLocaleString()}`);

  console.log('\n  ── Models found ─────────────────────────────');
  if (Object.keys(modelCounts).length === 0) {
    console.log('  (no model field found in JSONL — tokens may be 0)');
  }
  for (const [model, count] of Object.entries(modelCounts).sort((a,b) => b[1]-a[1])) {
    console.log(`  ${model.padEnd(40)} ${count} sessions`);
  }

  console.log('\n  ── Event types in JSONL ─────────────────────');
  for (const [type, count] of Object.entries(allEventTypes).sort((a,b) => b[1]-a[1]).slice(0, 15)) {
    console.log(`  ${String(type).padEnd(30)} ${count}`);
  }

  console.log('\n  ── Daily activity (last 14 days) ────────────');
  const recent = Object.entries(dailyTotals)
    .sort((a,b) => b[0].localeCompare(a[0]))
    .slice(0, 14);
  if (recent.length === 0) {
    console.log('  (no date info found — check folder structure)');
  }
  for (const [date, total] of recent) {
    const bar = '█'.repeat(Math.min(20, Math.floor(total / 500))) || '░';
    console.log(`  ${date}  ${bar} ${total.toLocaleString()} tokens`);
  }

  console.log('\n  ── Raw sample: first session ─────────────────');
  const sample = sessions[0];
  console.log(`  File:     ${path.basename(sample.file)}`);
  console.log(`  Date:     ${sample.date || '(not parsed from path)'}`);
  console.log(`  Events:   ${sample.messageCount}`);
  console.log(`  Types:    ${JSON.stringify(sample.eventTypes)}`);
  console.log(`  Tokens:   in=${sample.inputTokens} out=${sample.outputTokens}`);
  console.log(`  Model:    ${sample.model || '(not found)'}`);

  if (sessions.length > 0 && totalInput === 0) {
    console.log('\n  ⚠️   Tokens came back as 0.');
    console.log('  → Codex JSONL may use a different schema than Claude Code.');
    console.log('  → Let\'s print the raw first few lines of a session file:\n');

    const raw = fs.readFileSync(sample.file, 'utf-8').split('\n').slice(0, 5);
    for (const line of raw) {
      if (line.trim()) {
        try {
          console.log(JSON.stringify(JSON.parse(line), null, 2));
          console.log('  ---');
        } catch {
          console.log('  (unparseable line)');
        }
      }
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch(console.error);
