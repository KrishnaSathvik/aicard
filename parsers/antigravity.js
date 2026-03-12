/**
 * parsers/antigravity.js
 * Google Antigravity IDE usage via SQLite state.vscdb
 *
 * Verified storage layout (from real Antigravity install):
 *   Table: ItemTable (not cursorDiskKV)
 *   Session key: chat.ChatSessionStore.index
 *   Format: {"version":1,"entries":{"<sessionId>":...}}
 *   Location: workspaceStorage/<hash>/state.vscdb (per-workspace)
 *
 * Storage paths:
 *   macOS: ~/Library/Application Support/Antigravity/User/
 *   Linux: ~/.config/Antigravity/User/
 *   Windows: %APPDATA%\Antigravity\User\
 */

import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

function getAntigravityDir() {
  const home = homedir();
  const candidates = [
    join(home, 'Library', 'Application Support', 'Antigravity', 'User'),
    join(home, 'Library', 'Application Support', 'Google', 'Antigravity', 'User'),
    join(home, '.config', 'Antigravity', 'User'),
    join(home, '.config', 'google-antigravity', 'User'),
    join(home, 'AppData', 'Roaming', 'Antigravity', 'User'),
  ];
  return candidates.find(existsSync) || null;
}

function findDbs(baseDir) {
  const dbs = [];
  // Global state db
  const global = join(baseDir, 'globalStorage', 'state.vscdb');
  if (existsSync(global)) dbs.push(global);

  // Workspace dbs (this is where sessions actually live)
  const wsDir = join(baseDir, 'workspaceStorage');
  if (existsSync(wsDir)) {
    try {
      for (const hash of readdirSync(wsDir)) {
        const db = join(wsDir, hash, 'state.vscdb');
        if (existsSync(db)) dbs.push(db);
      }
    } catch {}
  }
  return dbs;
}

function sqlExec(dbPath, query) {
  try {
    return execSync(
      `sqlite3 "${dbPath}" "${query}" 2>/dev/null`,
      { timeout: 5000, encoding: 'utf-8' }
    ).trim();
  } catch { return ''; }
}

function readDb(dbPath) {
  let sessions = 0;

  // Verified key: chat.ChatSessionStore.index
  // Format: {"version":1,"entries":{"sessionId1":{...},"sessionId2":{...}}}
  const val = sqlExec(dbPath,
    "SELECT value FROM ItemTable WHERE key='chat.ChatSessionStore.index' LIMIT 1;"
  );

  if (val) {
    try {
      const data = JSON.parse(val);
      if (data.entries && typeof data.entries === 'object') {
        sessions += Object.keys(data.entries).length;
      }
    } catch {}
  }

  return { sessions };
}

export function detect() {
  return getAntigravityDir() !== null;
}

export async function parse(opts = {}) {
  const baseDir = getAntigravityDir();
  if (!baseDir) return null;

  const dbs = findDbs(baseDir);
  if (dbs.length === 0) return null;

  let totalSessions = 0;

  for (const db of dbs) {
    try {
      const { sessions } = readDb(db);
      totalSessions += sessions;
    } catch {}
  }

  // Only return data if there are actual sessions
  if (totalSessions === 0) return null;

  return {
    tool:        'antigravity',
    sessions:    totalSessions,
    tokens_used: 0,
    cost_usd:    0,
    models:      ['Gemini 3 Pro'],
    modelBreakdown: [],
    daily:       [],
    _meta: { dbCount: dbs.length },
  };
}
