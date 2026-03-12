#!/usr/bin/env node
/**
 * TEST: Anthropic Admin API usage pull
 * 
 * How to get your admin key:
 *   1. Go to console.anthropic.com
 *   2. Settings → API Keys → Create Key
 *   3. Select "Administrator" role
 *   4. Copy the key (starts with sk-ant-admin-)
 * 
 * Run:
 *   ANTHROPIC_ADMIN_KEY=sk-ant-admin-xxx node test-anthropic.mjs
 *   node test-anthropic.mjs --key sk-ant-admin-xxx
 */

import https from 'https';

// ── Get key from env or --key flag ────────────────────────────────────────────
const keyFlag = process.argv.indexOf('--key');
const API_KEY = keyFlag !== -1
  ? process.argv[keyFlag + 1]
  : process.env.ANTHROPIC_ADMIN_KEY;

if (!API_KEY) {
  console.error('\n  ❌  No API key found.\n');
  console.error('  Usage:');
  console.error('    ANTHROPIC_ADMIN_KEY=sk-ant-admin-xxx node test-anthropic.mjs');
  console.error('    node test-anthropic.mjs --key sk-ant-admin-xxx\n');
  process.exit(1);
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function toISO(date) {
  return date.toISOString().split('T')[0];
}

const today     = new Date();
const thirtyAgo = new Date(today);
thirtyAgo.setDate(today.getDate() - 30);
const yearAgo   = new Date(today);
yearAgo.setFullYear(today.getFullYear() - 1);

// ── Generic fetch ─────────────────────────────────────────────────────────────
function apiFetch(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.anthropic.com',
      path,
      method:   'GET',
      headers:  {
        'x-api-key':         API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type':      'application/json',
      },
    };

    const req = https.request(options, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  🔬  Anthropic Admin API — Usage Test');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`  Key:       ${API_KEY.slice(0, 20)}...`);
  console.log(`  Range:     ${toISO(yearAgo)}  →  ${toISO(today)}\n`);

  // ── 1. Try token usage endpoint ────────────────────────────────────────────
  console.log('  📡  Hitting /v1/organizations/usage/tokens ...');
  const tokenPath = `/v1/organizations/usage/tokens?start_time=${toISO(yearAgo)}&end_time=${toISO(today)}&granularity=day&limit=365`;
  const tokens = await apiFetch(tokenPath);

  console.log(`  Status: ${tokens.status}\n`);

  if (tokens.status === 200 && tokens.data?.data) {
    const rows = tokens.data.data;
    console.log(`  ✅  Got ${rows.length} daily rows\n`);

    // Summarize
    let totalInput = 0, totalOutput = 0, totalCache = 0;
    const modelCounts = {};
    const dailyTotals = {};

    for (const row of rows) {
      const date = row.timestamp?.split('T')[0] || row.date || '?';
      const inp  = row.input_tokens  || 0;
      const out  = row.output_tokens || 0;
      const cach = row.cache_read_input_tokens || 0;
      const model = row.model || 'unknown';

      totalInput  += inp;
      totalOutput += out;
      totalCache  += cach;

      modelCounts[model] = (modelCounts[model] || 0) + inp + out;
      dailyTotals[date]  = (dailyTotals[date]  || 0) + inp + out;
    }

    console.log('  ── Summary (last 365 days) ──────────────────');
    console.log(`  Input tokens:   ${totalInput.toLocaleString()}`);
    console.log(`  Output tokens:  ${totalOutput.toLocaleString()}`);
    console.log(`  Cache tokens:   ${totalCache.toLocaleString()}`);
    console.log(`  Total:          ${(totalInput + totalOutput).toLocaleString()}`);

    console.log('\n  ── Models used ──────────────────────────────');
    for (const [model, count] of Object.entries(modelCounts).sort((a,b) => b[1]-a[1])) {
      console.log(`  ${model.padEnd(40)} ${count.toLocaleString()} tokens`);
    }

    console.log('\n  ── Last 7 days ──────────────────────────────');
    const recent = Object.entries(dailyTotals)
      .sort((a,b) => b[0].localeCompare(a[0]))
      .slice(0, 7);
    for (const [date, total] of recent) {
      const bar = '█'.repeat(Math.min(30, Math.floor(total / 1000)));
      console.log(`  ${date}  ${bar} ${total.toLocaleString()}`);
    }

    console.log('\n  ── Raw first row (schema reference) ─────────');
    console.log(JSON.stringify(rows[0], null, 2));

  } else {
    console.log('  ❌  Token endpoint response:');
    console.log(JSON.stringify(tokens.data, null, 2));
  }

  // ── 2. Try cost/spend endpoint ─────────────────────────────────────────────
  console.log('\n\n  📡  Hitting /v1/organizations/usage/costs ...');
  const costPath = `/v1/organizations/usage/costs?start_time=${toISO(yearAgo)}&end_time=${toISO(today)}&granularity=day&limit=365`;
  const costs = await apiFetch(costPath);

  console.log(`  Status: ${costs.status}\n`);

  if (costs.status === 200 && costs.data?.data) {
    const rows = costs.data.data;
    let totalCost = 0;
    for (const row of rows) totalCost += row.cost || 0;

    console.log(`  ✅  Got ${rows.length} daily cost rows`);
    console.log(`  Total spend:  $${totalCost.toFixed(4)}`);
    console.log('\n  ── Raw first row ─────────────────────────────');
    console.log(JSON.stringify(rows[0], null, 2));
  } else {
    console.log('  ❌  Cost endpoint response:');
    console.log(JSON.stringify(costs.data, null, 2));
  }

  // ── 3. Try models list (verify key works) ─────────────────────────────────
  console.log('\n\n  📡  Hitting /v1/models (key verification) ...');
  const models = await apiFetch('/v1/models');
  console.log(`  Status: ${models.status}`);
  if (models.status === 200) {
    console.log(`  ✅  Key is valid — ${models.data?.data?.length || '?'} models available`);
  } else {
    console.log('  ❌  Key check failed:', models.data?.error?.message || models.data);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch(console.error);
