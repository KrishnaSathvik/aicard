/**
 * parsers/antigravity.js
 * Google Antigravity IDE usage via SQLite state.vscdb
 *
 * Antigravity is a VS Code fork with an agent-first architecture.
 * Since Google hasn't documented the SQLite key names, we use
 * dynamic key discovery — scan all keys and match patterns.
 *
 * Storage:
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
    // macOS
    join(home, 'Library', 'Application Support', 'Antigravity', 'User'),
    join(home, 'Library', 'Application Support', 'Google', 'Antigravity', 'User'),
    // Linux
    join(home, '.config', 'Antigravity', 'User'),
    join(home, '.config', 'google-antigravity', 'User'),
    // Windows
    join(home, 'AppData', 'Roaming', 'Antigravity', 'User'),
  ];
  return candidates.find(existsSync) || null;
}

function findDbs(baseDir) {
  const dbs = [];
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

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

/**
 * Dynamic key discovery — scan all keys and count sessions from anything
 * that looks like task/mission/agent/composer/chat data.
 * This is necessary because Antigravity's key names aren't documented.
 */
function readDb(dbPath) {
  let sessions = 0;

  // Detect table
  const tablesOut = sqlExec(dbPath, '.tables');
  const tables = [];
  if (tablesOut.includes('cursorDiskKV')) tables.push('cursorDiskKV');
  if (tablesOut.includes('ItemTable'))    tables.push('ItemTable');
  if (tables.length === 0) return { sessions };

  for (const table of tables) {
    // Get all keys from this table
    const allKeys = sqlExec(dbPath, `SELECT key FROM ${table}`)
      .split('\n').filter(Boolean);

    // Pattern 1: Individual session rows (like Cursor's composerData:<id>)
    const sessionRowPatterns = [
      /^composerData:/i,
      /^missionData:/i,
      /^agentSession:/i,
      /^taskData:/i,
    ];
    for (const key of allKeys) {
      for (const pat of sessionRowPatterns) {
        if (pat.test(key)) { sessions++; break; }
      }
    }

    // Pattern 2: Blob keys containing arrays of sessions/tasks/missions
    const blobPatterns = [
      'mission', 'agent', 'task', 'composer', 'chat',
    ];
    const matchedKeys = allKeys.filter(k => {
      const lower = k.toLowerCase();
      return blobPatterns.some(p => lower.includes(p)) &&
        (lower.includes('history') || lower.includes('data') ||
         lower.includes('sessions') || lower.includes('tasks') ||
         lower.includes('list') || lower.includes('all'));
    });

    for (const key of matchedKeys) {
      const val = sqlExec(dbPath, `SELECT value FROM ${table} WHERE key='${key}' LIMIT 1`);
      const parsed = safeJsonParse(val);
      if (!parsed) continue;

      // Try to extract count from various shapes
      if (Array.isArray(parsed)) {
        sessions += parsed.length;
      } else if (typeof parsed === 'object') {
        for (const prop of ['missions', 'tasks', 'sessions', 'allMissions',
                            'allComposers', 'allTasks', 'history', 'tabs', 'items']) {
          if (Array.isArray(parsed[prop])) {
            sessions += parsed[prop].length;
            break;
          }
        }
      }
    }
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
