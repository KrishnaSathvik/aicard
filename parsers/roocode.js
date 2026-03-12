/**
 * parsers/roocode.js
 * Roo Code VS Code extension usage via SQLite state.vscdb
 * Storage: Same VS Code user data dirs as Cursor
 *   macOS: ~/Library/Application Support/Code/User/
 *   Linux: ~/.config/Code/User/
 *   Windows: %APPDATA%\Code\User\
 * Also checks VS Code Insiders and VS Codium.
 * Data: sessions (task count from roo-cline data). No tokens stored locally.
 */

import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

function getVSCodeDirs() {
  const home = homedir();
  const candidates = [
    // VS Code stable
    join(home, 'Library', 'Application Support', 'Code', 'User'),
    join(home, '.config', 'Code', 'User'),
    join(home, 'AppData', 'Roaming', 'Code', 'User'),
    // VS Code Insiders
    join(home, 'Library', 'Application Support', 'Code - Insiders', 'User'),
    join(home, '.config', 'Code - Insiders', 'User'),
    // VS Codium
    join(home, 'Library', 'Application Support', 'VSCodium', 'User'),
    join(home, '.config', 'VSCodium', 'User'),
  ];
  return candidates.filter(existsSync);
}

function findDbs(dirs) {
  const dbs = [];
  for (const baseDir of dirs) {
    const global = join(baseDir, 'globalStorage', 'state.vscdb');
    if (existsSync(global)) dbs.push(global);

    const wsDir = join(baseDir, 'workspaceStorage');
    if (existsSync(wsDir)) {
      try {
        for (const hash of readdirSync(wsDir)) {
          const db = join(wsDir, hash, 'state.vscdb');
          if (existsSync(db)) dbs.push(db);
        }
      } catch {}
    }
  }
  return dbs;
}

function queryAllKeys(dbPath) {
  try {
    const rows = execSync(
      `sqlite3 "${dbPath}" "SELECT key FROM ItemTable" 2>/dev/null`,
      { timeout: 5000, encoding: 'utf-8' }
    ).trim().split('\n').filter(Boolean);
    return rows;
  } catch { return []; }
}

function queryDb(dbPath, key) {
  try {
    const out = execSync(
      `sqlite3 "${dbPath}" "SELECT value FROM ItemTable WHERE key='${key}'" 2>/dev/null`,
      { timeout: 5000, encoding: 'utf-8' }
    ).trim();
    return out ? JSON.parse(out) : null;
  } catch { return null; }
}

function readDb(dbPath) {
  let sessions = 0;
  const rooKeys = queryAllKeys(dbPath).filter(k =>
    k.includes('roo') || k.includes('cline') || k.includes('roocline')
  );

  // Roo Code stores task history under roo-cline keys
  for (const key of rooKeys) {
    if (key.includes('taskHistory') || key.includes('tasks') || key.includes('sessions')) {
      const val = queryDb(dbPath, key);
      if (Array.isArray(val)) sessions += val.length;
      else if (val?.tasks && Array.isArray(val.tasks)) sessions += val.tasks.length;
      else if (val?.history && Array.isArray(val.history)) sessions += val.history.length;
    }
  }

  return { sessions };
}

export function detect() {
  return getVSCodeDirs().length > 0;
}

export async function parse(opts = {}) {
  const dirs = getVSCodeDirs();
  if (dirs.length === 0) return null;

  const dbs = findDbs(dirs);
  if (dbs.length === 0) return null;

  let totalSessions = 0;

  for (const db of dbs) {
    try {
      const { sessions } = readDb(db);
      totalSessions += sessions;
    } catch {}
  }

  if (totalSessions === 0) return null;

  return {
    tool:        'roocode',
    sessions:    totalSessions,
    tokens_used: 0,  // Not stored in VS Code state
    cost_usd:    0,  // Depends on user's API key
    models:      [],
    modelBreakdown: [],
    daily:       [],
    _meta: { dbCount: dbs.length },
  };
}
