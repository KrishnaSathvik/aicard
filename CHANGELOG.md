# Changelog

## 3.2.0 (2026-03-12)

### Features
- Renamed project to **aicard** (`npx aicard`)
- Smart donut chart — auto-picks the most balanced metric instead of always using sessions
- Precise session counts — shows exact numbers with commas (1,971 not 2.0k)
- Better Share on X — lists each tool with individual stats
- Per-tool heatmap legend with actual tool colors
- Save as PNG button in HTML card (via html2canvas)
- Auto-detect PNG CLI tool — skips prompt if wkhtmltoimage not installed
- 7 color-coded themes visible in wizard without scrolling

### Fixes
- **Cursor parser rewrite** — reads `cursorDiskKV` table (modern format) instead of only legacy `ItemTable`
- **Codex heatmap fix** — `@ccusage/codex` returns dates as "Feb 02, 2026" not ISO; added `normalizeDate()` to all ccusage parsers
- **Heatmap data preservation** — fixed `allData` shallow merge that wiped `daily[]` arrays; added `scannedSnapshot` fallback
- **Generator heatmap resilience** — handles missing `toolKey` field with multi-pass fallback

### Hardened Parsers
- **Kimi CLI** — corrected storage path to `~/.kimi/sessions/`, reads `kimi.json` index for session count
- **Antigravity** — dynamic key discovery instead of hardcoded guesses
- **Aider** — reduced scan depth, 5s timeout cap, max 10 repos, skip home root
- **OpenCode** — JSON sanitizer for logger contamination bug in `@ccusage/opencode`
- **Roo Code / Kilo Code** — added fragility warnings for key pattern matching

## 3.0.0 (2026-03-11)

### Initial Release
- 13 AI tool parsers (Claude Code, Codex, Cursor, Gemini CLI, Aider, and 8 more)
- Interactive 3-step wizard (tools → metrics → card details)
- 7 visual themes (dark, light, cosmic, forge, arctic, verdant, neon)
- GitHub-style activity heatmap
- Donut chart + bar table with model breakdown
- YAML/JSON config file support
- Share on X integration
- PNG export via wkhtmltoimage
