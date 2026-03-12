/**
 * parsers/aider.js
 * Aider usage via .aider.chat.history.md files + git log
 * Data: sessions (history file count), commits, lines written.
 * No tokens/cost stored by aider.
 *
 * Hardened: reduced scan depth, timeout caps, limited repo count
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

// Only scan common dev directories — NOT home root (too slow on large machines)
const SCAN_DIRS = [
  'Code', 'code', 'Projects', 'projects',
  'Dev', 'dev', 'Development', 'Work', 'work',
  'src', 'repos', 'git',
];

function getSearchRoots() {
  const home = homedir();
  return SCAN_DIRS
    .map(d => join(home, d))
    .filter(d => { try { return statSync(d).isDirectory(); } catch { return false; } });
}

function findAiderFiles(roots, maxDepth = 2) {
  const found = [];
  const startTime = Date.now();
  const TIMEOUT_MS = 5000; // 5 second cap for file discovery

  function scan(dir, depth) {
    if (depth > maxDepth || found.length >= 50 || Date.now() - startTime > TIMEOUT_MS) return;
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.git' ||
            entry.name === '.venv' || entry.name === '__pycache__') continue;
        const full = join(dir, entry.name);
        try {
          if (entry.isDirectory()) {
            scan(full, depth + 1);
          } else if (entry.name === '.aider.chat.history.md' || entry.name === 'aider.chat.history.md') {
            found.push(full);
          }
        } catch {}
        if (Date.now() - startTime > TIMEOUT_MS) return;
      }
    } catch {}
  }
  for (const root of roots) {
    scan(root, 0);
    if (Date.now() - startTime > TIMEOUT_MS) break;
  }
  return found;
}

function parseHistoryFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const sessions = (content.match(/^#### /mg) || []).length;
    const userMessages = (content.match(/^> /mg) || []).length;
    return { sessions: Math.max(sessions, 1), messages: userMessages };
  } catch { return { sessions: 1, messages: 0 }; }
}

function countGitCommits(roots) {
  let totalCommits = 0, totalLines = 0;
  const MAX_REPOS = 10;
  let repoCount = 0;

  for (const root of roots) {
    if (repoCount >= MAX_REPOS) break;
    try {
      const gitDirs = execSync(
        `find "${root}" -maxdepth 2 -name ".git" -type d 2>/dev/null | head -${MAX_REPOS - repoCount}`,
        { encoding: 'utf-8', timeout: 5000 }
      ).trim().split('\n').filter(Boolean);

      for (const gitDir of gitDirs) {
        if (repoCount >= MAX_REPOS) break;
        repoCount++;
        const repo = join(gitDir, '..');
        try {
          const count = parseInt(execSync(
            `git -C "${repo}" log --oneline --grep="aider" -i 2>/dev/null | wc -l`,
            { encoding: 'utf-8', timeout: 3000 }
          ).trim()) || 0;
          totalCommits += count;

          if (count > 0) {
            const lines = parseInt(execSync(
              `git -C "${repo}" log --grep="aider" -i --shortstat 2>/dev/null | awk '/insertion/{sum+=$4} END {print sum}'`,
              { encoding: 'utf-8', timeout: 3000 }
            ).trim()) || 0;
            totalLines += lines;
          }
        } catch {}
      }
    } catch {}
  }
  return { commits: totalCommits, linesAdded: totalLines };
}

export function detect() {
  const roots = getSearchRoots();
  if (roots.length === 0) {
    // Fallback: check if aider command exists
    try { execSync('which aider', { stdio: 'ignore', timeout: 2000 }); return true; } catch { return false; }
  }
  const historyFiles = findAiderFiles(roots, 1); // shallow scan for detect
  if (historyFiles.length > 0) return true;
  try { execSync('which aider', { stdio: 'ignore', timeout: 2000 }); return true; } catch { return false; }
}

export async function parse(opts = {}) {
  const roots = getSearchRoots();
  const historyFiles = findAiderFiles(roots);
  const gitData = countGitCommits(roots);

  if (historyFiles.length === 0 && gitData.commits === 0) return null;

  let totalSessions = 0, totalMessages = 0;
  const dailyMap = {};

  for (const file of historyFiles) {
    try {
      const { sessions, messages } = parseHistoryFile(file);
      totalSessions += sessions;
      totalMessages += messages;

      // Use file mtime as proxy date
      const date = statSync(file).mtime.toISOString().slice(0, 10);
      if (!dailyMap[date]) dailyMap[date] = { totalTokens: 0, totalCost: 0 };
      dailyMap[date].totalTokens += messages * 500; // rough proxy: 500 tokens/message
    } catch {}
  }

  const daily = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({ date, toolKey: 'aider', totalTokens: d.totalTokens, totalCost: 0 }));

  return {
    tool:          'aider',
    sessions:      totalSessions || historyFiles.length,
    commits:       gitData.commits,
    lines_written: gitData.linesAdded,
    tokens_used:   0,
    cost_usd:      0,
    models:        [],
    modelBreakdown: [],
    daily,
    _meta: {
      historyFiles:  historyFiles.length,
      totalMessages: totalMessages,
      gitCommits:    gitData.commits,
    },
  };
}
