/**
 * parsers/cursor.js
 * Parses Cursor's local SQLite databases to extract chat session counts,
 * prompt counts, and daily activity for heatmap.
 *
 * Storage locations:
 *   macOS:   ~/Library/Application Support/Cursor/User/
 *   Linux:   ~/.config/Cursor/User/
 *   Windows: %APPDATA%\Cursor\User\
 *
 * Two storage formats (both in state.vscdb):
 *   NEW (cursorDiskKV table):
 *     - Sessions stored as individual rows: composerData:<composerId>
 *     - Messages stored as: bubbleId:<composerId>:<bubbleId>
 *     - Each composerData value is JSON with _v, composerId, createdAt, status, etc.
 *
 *   LEGACY (ItemTable):
 *     - composer.composerData → { allComposers: [...] }
 *     - workbench.panel.aichat.view.aichat.chatdata → { tabs: [...] }
 *     - aiService.prompts / aiService.generations → arrays
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

// ── Cursor data directory detection ──────────────────────────────────────────

function getCursorDataDir() {
  const home = os.homedir();
  const candidates = [
    path.join(home, 'Library', 'Application Support', 'Cursor', 'User'),   // macOS
    path.join(home, '.config', 'Cursor', 'User'),                           // Linux
    path.join(home, 'AppData', 'Roaming', 'Cursor', 'User'),               // Windows
  ];
  return candidates.find(fs.existsSync) || null;
}

// ── Find all state.vscdb files ───────────────────────────────────────────────

function findVscdbFiles(baseDir) {
  const files = [];

  // Global state db (primary location for new format)
  const globalDb = path.join(baseDir, 'globalStorage', 'state.vscdb');
  if (fs.existsSync(globalDb)) files.push({ path: globalDb, type: 'global' });

  // Workspace storage dbs
  const wsDir = path.join(baseDir, 'workspaceStorage');
  if (fs.existsSync(wsDir)) {
    try {
      for (const hash of fs.readdirSync(wsDir)) {
        const dbPath = path.join(wsDir, hash, 'state.vscdb');
        if (fs.existsSync(dbPath)) {
          files.push({ path: dbPath, type: 'workspace', hash });
        }
      }
    } catch {}
  }

  return files;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function sqlExec(dbPath, query) {
  try {
    return execSync(
      `sqlite3 "${dbPath}" "${query}"`,
      { timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] }
    ).toString().trim();
  } catch { return ''; }
}

// ── Read a single state.vscdb ────────────────────────────────────────────────

function readVscdb(dbPath) {
  const result = {
    composerSessions: 0,
    promptCount: 0,
    generationCount: 0,
    dates: [],              // createdAt dates for heatmap
  };

  try {
    // Detect which table(s) exist
    const tablesOut = sqlExec(dbPath, '.tables');
    const hasCursorDiskKV = tablesOut.includes('cursorDiskKV');
    const hasItemTable    = tablesOut.includes('ItemTable');

    if (!hasCursorDiskKV && !hasItemTable) return result;

    // ────────────────────────────────────────────────────────────────────────
    // NEW FORMAT: cursorDiskKV — each session is composerData:<uuid>
    // ────────────────────────────────────────────────────────────────────────
    if (hasCursorDiskKV) {
      // Count all composer sessions (one row per session)
      const countOut = sqlExec(dbPath,
        "SELECT COUNT(*) FROM cursorDiskKV WHERE key LIKE 'composerData:%'"
      );
      const sessionCount = parseInt(countOut) || 0;
      result.composerSessions += sessionCount;

      // Extract createdAt dates from session metadata for heatmap.
      // Each composerData row can be very large (full conversation), so we
      // use substr to only pull the first 500 chars where createdAt lives.
      if (sessionCount > 0) {
        try {
          const rows = execSync(
            `sqlite3 "${dbPath}" "SELECT substr(value, 1, 500) FROM cursorDiskKV WHERE key LIKE 'composerData:%';"`,
            { timeout: 15000, maxBuffer: 20 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }
          ).toString();

          for (const line of rows.split('\n')) {
            if (!line.trim()) continue;
            // Fast extract: "createdAt":"2025-06-15T..." (ISO string)
            const m = line.match(/"createdAt"\s*:\s*"([^"]+)"/);
            if (m) {
              const date = m[1].slice(0, 10);
              if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                result.dates.push(date);
                continue;
              }
            }
            // Numeric timestamp format: "createdAt":1718467200000
            const m2 = line.match(/"createdAt"\s*:\s*(\d{13})/);
            if (m2) {
              const date = new Date(Number(m2[1])).toISOString().slice(0, 10);
              result.dates.push(date);
            }
          }
        } catch {
          // If bulk extraction fails (too large), we still have the session count
        }
      }

      // Count bubbleId pairs as interaction count
      const bubbleCount = sqlExec(dbPath,
        "SELECT COUNT(*) FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'"
      );
      if (bubbleCount) result.promptCount += Math.floor((parseInt(bubbleCount) || 0) / 2);
    }

    // ────────────────────────────────────────────────────────────────────────
    // LEGACY FORMAT: ItemTable — single blob keys
    // ────────────────────────────────────────────────────────────────────────
    if (hasItemTable) {
      const getVal = (key) => {
        const out = sqlExec(dbPath,
          `SELECT value FROM ItemTable WHERE key='${key}' LIMIT 1;`
        );
        return out ? safeJsonParse(out) : null;
      };

      // Composer sessions (legacy single-blob format)
      const composerData = getVal('composer.composerData');
      if (composerData?.allComposers) {
        result.composerSessions += composerData.allComposers.length;

        // Extract dates from legacy format too
        for (const c of composerData.allComposers) {
          if (c.createdAt) {
            const d = typeof c.createdAt === 'number'
              ? new Date(c.createdAt).toISOString().slice(0, 10)
              : String(c.createdAt).slice(0, 10);
            if (/^\d{4}-\d{2}-\d{2}$/.test(d)) result.dates.push(d);
          }
        }
      }

      // Legacy chat tabs
      const chatData = getVal('workbench.panel.aichat.view.aichat.chatdata');
      if (chatData?.tabs) result.composerSessions += chatData.tabs.length;

      // Prompt history (older builds)
      const prompts = getVal('aiService.prompts');
      if (Array.isArray(prompts)) result.promptCount += prompts.length;

      // Generation count (older builds)
      const generations = getVal('aiService.generations');
      if (Array.isArray(generations)) result.generationCount += generations.length;

      // BubbleId pairs in ItemTable (message-level, only if cursorDiskKV wasn't found)
      if (!hasCursorDiskKV) {
        const cnt = sqlExec(dbPath,
          "SELECT COUNT(*) FROM ItemTable WHERE key LIKE 'bubbleId:%';"
        );
        if (cnt) result.promptCount += Math.floor((parseInt(cnt) || 0) / 2);
      }
    }

  } catch { /* sqlite3 not available or db unreadable */ }

  return result;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function detect() {
  return getCursorDataDir() !== null;
}

export async function parse(options = {}) {
  const baseDir = options.baseDir || getCursorDataDir();
  if (!baseDir) return null;

  const dbs = findVscdbFiles(baseDir);
  if (dbs.length === 0) return null;

  const totals = { composerSessions: 0, promptCount: 0, generationCount: 0 };
  const allDates = [];

  for (const db of dbs) {
    try {
      const data = readVscdb(db.path);
      totals.composerSessions += data.composerSessions;
      totals.promptCount      += data.promptCount;
      totals.generationCount  += data.generationCount;
      allDates.push(...data.dates);
    } catch {}
  }

  const sessions = totals.composerSessions;
  const interactions = totals.promptCount || totals.generationCount;

  // Build daily heatmap from extracted session createdAt dates
  const dateMap = new Map();
  for (const date of allDates) {
    dateMap.set(date, (dateMap.get(date) || 0) + 1);
  }

  const daily = Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, toolKey: 'cursor', sessions: count }));

  // Return null only if nothing was found at all
  if (sessions === 0 && interactions === 0) return null;

  return {
    tool: 'cursor',
    sessions: sessions || interactions,
    tokens_used:   0,
    cost_usd:      0,
    lines_written: 0,
    daily,
    _raw: {
      composerSessions: totals.composerSessions,
      promptCount:      totals.promptCount,
      generationCount:  totals.generationCount,
      dbCount:          dbs.length,
      heatmapDays:      daily.length,
      sessionSource:    sessions > 0 ? 'sqlite' : 'prompts',
    },
  };
}
