/**
 * parsers/index.js
 * Unified registry for all 14 tool parsers.
 * Each parser exports: detect() → boolean, parse(opts) → data | null
 */

export { detect as detectClaudeCode, parse as parseClaudeCode } from './claude-code.js';
export { detect as detectCodex,      parse as parseCodex      } from './codex.js';
export { detect as detectOpenCode,   parse as parseOpenCode   } from './opencode.js';
export { detect as detectAmp,        parse as parseAmp        } from './amp.js';
export { detect as detectPi,         parse as parsePi         } from './pi.js';
export { detect as detectGemini,     parse as parseGemini     } from './gemini.js';
export { detect as detectQwen,       parse as parseQwen       } from './qwen.js';
export { detect as detectKimi,       parse as parseKimi       } from './kimi.js';
export { detect as detectCursor,     parse as parseCursor     } from './cursor.js';
export { detect as detectAntigravity,parse as parseAntigravity} from './antigravity.js';
export { detect as detectRooCode,    parse as parseRooCode    } from './roocode.js';
export { detect as detectKiloCode,   parse as parseKiloCode   } from './kilocode.js';
export { detect as detectAider,      parse as parseAider      } from './aider.js';

/**
 * Tool registry — metadata for all supported tools.
 * Used by wizard, generator, and card renderer.
 */
export const AI_TOOLS = [
  // ── ccusage-backed (full data) ──────────────────────────────────────────
  {
    key:     'claude_code',
    name:    'Claude Code',
    icon:    '◆',
    color:   '#D97706',
    source:  'ccusage',
    hasTokens: true,
    hasCost:   true,
  },
  {
    key:     'codex',
    name:    'Codex',
    icon:    '⬡',
    color:   '#10A37F',
    source:  'ccusage/codex',
    hasTokens: true,
    hasCost:   true,
  },
  {
    key:     'opencode',
    name:    'OpenCode',
    icon:    '◎',
    color:   '#6366F1',
    source:  'ccusage/opencode',
    hasTokens: true,
    hasCost:   true,
  },
  {
    key:     'amp',
    name:    'Amp',
    icon:    '◈',
    color:   '#EC4899',
    source:  'ccusage/amp',
    hasTokens: true,
    hasCost:   true,
  },
  {
    key:     'pi',
    name:    'Pi Agent',
    icon:    '◉',
    color:   '#8B5CF6',
    source:  'ccusage/pi',
    hasTokens: true,
    hasCost:   true,
  },
  // ── Direct JSONL parsers ────────────────────────────────────────────────
  {
    key:     'gemini',
    name:    'Gemini CLI',
    icon:    '◑',
    color:   '#4285F4',
    source:  'jsonl',
    hasTokens: true,
    hasCost:   false,
  },
  {
    key:     'qwen',
    name:    'Qwen Code',
    icon:    '◐',
    color:   '#7C3AED',
    source:  'jsonl',
    hasTokens: true,
    hasCost:   true,   // estimated from pricing table
  },
  {
    key:     'kimi',
    name:    'Kimi CLI',
    icon:    '◒',
    color:   '#0EA5E9',
    source:  'jsonl',
    hasTokens: true,
    hasCost:   true,   // estimated from pricing table
  },
  // ── SQLite parsers (sessions only) ──────────────────────────────────────
  {
    key:     'cursor',
    name:    'Cursor',
    icon:    '⬢',
    color:   '#6E56CF',
    source:  'sqlite',
    hasTokens: false,
    hasCost:   false,
  },
  {
    key:     'antigravity',
    name:    'Antigravity',
    icon:    '◇',
    color:   '#1A73E8',
    source:  'sqlite',
    hasTokens: false,
    hasCost:   false,
  },
  {
    key:     'roocode',
    name:    'Roo Code',
    icon:    '◁',
    color:   '#00BCD4',
    source:  'sqlite',
    hasTokens: false,
    hasCost:   false,
  },
  {
    key:     'kilocode',
    name:    'Kilo Code',
    icon:    '▷',
    color:   '#FF6B35',
    source:  'sqlite',
    hasTokens: false,
    hasCost:   false,
  },
  // ── Git + file parsers ──────────────────────────────────────────────────
  {
    key:     'aider',
    name:    'Aider',
    icon:    '◁',
    color:   '#16A34A',
    source:  'git',
    hasTokens: false,
    hasCost:   false,
  },
];

/**
 * Run all parsers in parallel, return array of results keyed by tool.
 * @param {string[]} keys - tool keys to parse (defaults to all)
 * @param {object}   opts - passed to each parser
 */
export async function parseAll(keys = AI_TOOLS.map(t => t.key), opts = {}) {
  const parsers = {
    claude_code:  () => import('./claude-code.js').then(m => m.parse(opts)),
    codex:        () => import('./codex.js').then(m => m.parse(opts)),
    opencode:     () => import('./opencode.js').then(m => m.parse(opts)),
    amp:          () => import('./amp.js').then(m => m.parse(opts)),
    pi:           () => import('./pi.js').then(m => m.parse(opts)),
    gemini:       () => import('./gemini.js').then(m => m.parse(opts)),
    qwen:         () => import('./qwen.js').then(m => m.parse(opts)),
    kimi:         () => import('./kimi.js').then(m => m.parse(opts)),
    cursor:       () => import('./cursor.js').then(m => m.parse(opts)),
    antigravity:  () => import('./antigravity.js').then(m => m.parse(opts)),
    roocode:      () => import('./roocode.js').then(m => m.parse(opts)),
    kilocode:     () => import('./kilocode.js').then(m => m.parse(opts)),
    aider:        () => import('./aider.js').then(m => m.parse(opts)),
  };

  const results = await Promise.allSettled(
    keys.filter(k => parsers[k]).map(async (key) => {
      const data = await parsers[key]();
      return data ? { key, ...data } : null;
    })
  );

  return results
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);
}

/**
 * Detect which tools are installed on this machine.
 * Returns array of tool keys that are detected.
 */
export async function detectAll() {
  const detectors = {
    claude_code:  () => import('./claude-code.js').then(m => m.detect()),
    codex:        () => import('./codex.js').then(m => m.detect()),
    opencode:     () => import('./opencode.js').then(m => m.detect()),
    amp:          () => import('./amp.js').then(m => m.detect()),
    pi:           () => import('./pi.js').then(m => m.detect()),
    gemini:       () => import('./gemini.js').then(m => m.detect()),
    qwen:         () => import('./qwen.js').then(m => m.detect()),
    kimi:         () => import('./kimi.js').then(m => m.detect()),
    cursor:       () => import('./cursor.js').then(m => m.detect()),
    antigravity:  () => import('./antigravity.js').then(m => m.detect()),
    roocode:      () => import('./roocode.js').then(m => m.detect()),
    kilocode:     () => import('./kilocode.js').then(m => m.detect()),
    aider:        () => import('./aider.js').then(m => m.detect()),
  };

  const results = await Promise.allSettled(
    Object.entries(detectors).map(async ([key, fn]) => ({ key, detected: await fn() }))
  );

  return results
    .filter(r => r.status === 'fulfilled' && r.value.detected)
    .map(r => r.value.key);
}
