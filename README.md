<p align="center">
  <img src="https://raw.githubusercontent.com/KrishnaSathvik/aiusage/main/assets/banner.png" alt="aiusage" width="600"/>
</p>

<h1 align="center">aiusage</h1>

<p align="center">
  <strong>Generate beautiful, shareable cards for your AI coding tool usage</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/aiusage"><img src="https://img.shields.io/npm/v/aicard?color=10A37F&label=npm" alt="npm version"/></a>
  <a href="https://github.com/KrishnaSathvik/aiusage/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/aicard?color=D97706" alt="license"/></a>
  <img src="https://img.shields.io/badge/tools-13%20supported-6E56CF" alt="tools"/>
  <img src="https://img.shields.io/badge/node-%3E%3D18-333" alt="node"/>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#supported-tools">Supported Tools</a> •
  <a href="#themes">Themes</a> •
  <a href="#config-file">Config File</a> •
  <a href="#how-it-works">How It Works</a>
</p>

---

## What is aiusage?

**aiusage** scans your machine for AI coding tools, reads their local usage data (sessions, tokens, cost), and generates a shareable HTML card with:

- Per-tool usage breakdown with model details
- Donut chart with smart metric selection
- GitHub-style activity heatmap (per-tool rows)
- Save as PNG, PDF, or share on X — all from the card itself

One command. No API keys. No data leaves your machine.

```bash
npx aiusage
```

<p align="center">
  <img src="https://raw.githubusercontent.com/KrishnaSathvik/aiusage/main/assets/card-dark.png" alt="aiusage dark theme" width="700"/>
</p>

---

## Quick Start

```bash
# Run directly (no install needed)
npx aiusage

# Or install globally
npm install -g aiusage
aicard
```

The interactive wizard walks you through 3 steps:

1. **Select tools** — auto-detected from your machine + manual entry
2. **Choose metrics** — sessions, tokens, cost, commits, lines written
3. **Customize** — title, handle, theme, output filename

Output: `aiusage.html` (open in browser, click "Save as PNG")

---

## Supported Tools

aiusage supports **13 AI coding tools** across 4 data source types:

### Full data (sessions + tokens + cost + heatmap)

| Tool | Data Source | What's Read |
|---|---|---|
| **Claude Code** | `ccusage` | Sessions, tokens, cost, model breakdown, daily activity |
| **OpenAI Codex** | `@ccusage/codex` | Sessions, tokens, cost, model breakdown, daily activity |
| **OpenCode** | `@ccusage/opencode` | Sessions, tokens, cost, daily activity |
| **Amp** (Sourcegraph) | `@ccusage/amp` | Sessions, tokens, cost, credits, daily activity |
| **Pi Agent** | `@ccusage/pi` | Sessions, tokens, cost, daily activity |

### Token data (sessions + tokens + heatmap)

| Tool | Data Source | What's Read |
|---|---|---|
| **Gemini CLI** | Local JSONL files | Sessions, tokens, daily activity |
| **Qwen Code** | Local JSONL files | Sessions, tokens, estimated cost, daily activity |
| **Kimi Code** | Local session files | Sessions, tokens, estimated cost, daily activity |

### Session data (sessions only)

| Tool | Data Source | What's Read |
|---|---|---|
| **Cursor** | SQLite `state.vscdb` | Composer sessions, daily activity from timestamps |
| **Antigravity** | SQLite `state.vscdb` | Missions + agent sessions |
| **Roo Code** | VS Code SQLite | Task history count |
| **Kilo Code** | VS Code SQLite | Task history count |

### Git-based

| Tool | Data Source | What's Read |
|---|---|---|
| **Aider** | `.aider.chat.history.md` + git | Sessions, commits, lines written |

Tools not installed on your machine can still be added manually during the wizard.

---

## Themes

7 built-in themes, selectable in the wizard or via `--theme`:

| Theme | Vibe |
|---|---|
| `dark` | Terminal noir (default) |
| `light` | Clean minimal |
| `cosmic` | Deep space blues |
| `forge` | Amber heat |
| `arctic` | Ice blue on white |
| `verdant` | Forest green |
| `neon` | Pink synthwave |

```bash
aiusage --theme cosmic
```

---

## Config File

Skip the wizard entirely with a YAML or JSON config:

```bash
# Generate a starter config
aiusage --init ai-usage.yaml

# Run from config
aiusage --config ai-usage.yaml
```

Example `ai-usage.yaml`:

```yaml
title: My AI Coding Stack
timeframe: "2026 — All Time"
username: latentengineer_
theme: dark
metrics:
  - sessions
  - tokens_used
  - cost_usd
tools:
  claude_code:
    sessions: 312
    tokens_used: 23500
    cost_usd: 180
  codex:
    sessions: 88
    tokens_used: 605400
    cost_usd: 240
  cursor:
    sessions: 1971
  gemini:
    sessions: 200
    tokens_used: 8400
```

---

## CLI Options

```
Usage: aiusage [options]

Options:
  -V, --version          output version number
  -c, --config <file>    load from YAML or JSON config file
  -o, --output <name>    output base filename (default: "aicard")
  --no-png               skip PNG export prompt
  --theme <theme>        override theme (dark|light|cosmic|forge|arctic|verdant|neon)
  --title <title>        override card title
  --timeframe <range>    override timeframe text
  --username <handle>    override handle
  --init [file]          scaffold a starter YAML config
  -h, --help             display help
```

---

## How It Works

aiusage reads **only local data** — nothing is sent to any server.

```
┌─────────────────────────────────────────────────────┐
│                    Your Machine                      │
│                                                      │
│  ~/.claude/projects/    ──→  ccusage (sessions,      │
│  ~/.codex/              ──→  tokens, cost, models)   │
│  ~/.gemini/tmp/         ──→  JSONL parser (tokens)   │
│  ~/.kimi/sessions/      ──→  JSON parser (tokens)    │
│  ~/Library/.../Cursor/  ──→  SQLite reader (sessions)│
│  .aider.chat.history.md ──→  File parser (sessions)  │
│                                                      │
│         ↓ all local ↓                                │
│                                                      │
│  ┌─────────────────────────────────────────────┐     │
│  │              aiusage.html                     │     │
│  │  ┌─────┬──────────────────────────────┐     │     │
│  │  │Donut│  Tool table with bars        │     │     │
│  │  │chart│  + model breakdown           │     │     │
│  │  └─────┴──────────────────────────────┘     │     │
│  │  ┌────────────────────────────────────┐     │     │
│  │  │  Per-tool activity heatmap         │     │     │
│  │  └────────────────────────────────────┘     │     │
│  │  [Save PNG] [Save PDF] [Share on X]         │     │
│  └─────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────┘
```

---

## Export Options

The generated HTML card includes built-in export buttons:

- **Save as PNG** — captures the full card at 2x resolution via html2canvas
- **Save as PDF** — uses the browser's native print dialog
- **Share on X** — pre-filled tweet with your tool stats

---

## Requirements

- **Node.js 18+**
- **sqlite3 CLI** (for Cursor/Antigravity/Roo Code/Kilo Code parsing)
- Tools you want to track must be installed and have local usage data

---

## Privacy

aiusage is fully offline. It:

- Reads only local files on your machine
- Never sends data to any server
- Never requires API keys or authentication
- The HTML output is a standalone file with no external dependencies (except Google Fonts)

---

## Contributing

Contributions welcome! Especially:

- **New tool parsers** — if you use an AI coding tool not listed above
- **Themes** — add new visual themes to `generator.js`
- **Bug reports** — especially from tools with untested data formats

```bash
git clone https://github.com/KrishnaSathvik/aiusage.git
cd aicard
npm install
node index.js
```

---

## License

MIT © [Krishna Sathvik Mantripragada](https://github.com/KrishnaSathvik)

---

<p align="center">
  Built by <a href="https://x.com/latentengineer_">@latentengineer_</a> · 
  <a href="https://github.com/KrishnaSathvik/aiusage">GitHub</a> · 
  <a href="https://www.npmjs.com/package/aiusage">npm</a>
</p>
