export function generateHTML({ title, timeframe, username, theme, tools, metrics, heatmapData }) {

  const themes = {
    dark:    { bg:'#0A0A0B', surface:'#111113', surfaceAlt:'#18181B', border:'#27272A', borderAccent:'#3F3F46', text:'#FAFAFA', textMuted:'#A1A1AA', textDim:'#52525B', font:"'JetBrains Mono', monospace", displayFont:"'Space Grotesk', sans-serif", glow:'radial-gradient(ellipse 80% 60% at 70% 0%, rgba(251,191,36,0.06) 0%, transparent 60%)', accent:'#F59E0B' },
    light:   { bg:'#F4F4F0', surface:'#FFFFFF', surfaceAlt:'#F9F9F7', border:'#E4E4E0', borderAccent:'#D4D4CE', text:'#111111', textMuted:'#6B7280', textDim:'#D1D5DB', font:"'JetBrains Mono', monospace", displayFont:"'Space Grotesk', sans-serif", glow:'none', accent:'#2563EB' },
    cosmic:  { bg:'#030B1A', surface:'#080F1E', surfaceAlt:'#0D1628', border:'#162236', borderAccent:'#1E3252', text:'#D9ECFF', textMuted:'#6B9DC0', textDim:'#1E3252', font:"'JetBrains Mono', monospace", displayFont:"'Space Grotesk', sans-serif", glow:'radial-gradient(ellipse 70% 50% at 80% 20%, rgba(56,110,200,0.15) 0%, transparent 60%)', accent:'#60A5FA' },
    forge:   { bg:'#0D0800', surface:'#160E03', surfaceAlt:'#1E1407', border:'#2E1E08', borderAccent:'#4A3010', text:'#FEF3C7', textMuted:'#B07840', textDim:'#3D2810', font:"'JetBrains Mono', monospace", displayFont:"'Space Grotesk', sans-serif", glow:'radial-gradient(ellipse 60% 40% at 90% 10%, rgba(245,130,0,0.12) 0%, transparent 60%)', accent:'#F97316' },
    arctic:  { bg:'#EEF5FF', surface:'#FFFFFF', surfaceAlt:'#E4EFFF', border:'#BDD5F5', borderAccent:'#9AC0EE', text:'#0A1F38', textMuted:'#3E6E9E', textDim:'#BDD5F5', font:"'JetBrains Mono', monospace", displayFont:"'Space Grotesk', sans-serif", glow:'radial-gradient(ellipse 60% 50% at 20% 80%, rgba(0,100,220,0.07) 0%, transparent 60%)', accent:'#2563EB' },
    verdant: { bg:'#040D07', surface:'#081209', surfaceAlt:'#0C1A0E', border:'#152B18', borderAccent:'#204025', text:'#DCFCE7', textMuted:'#5A9A68', textDim:'#204025', font:"'JetBrains Mono', monospace", displayFont:"'Space Grotesk', sans-serif", glow:'radial-gradient(ellipse 65% 45% at 75% 25%, rgba(30,180,60,0.10) 0%, transparent 60%)', accent:'#22C55E' },
    neon:    { bg:'#0D0118', surface:'#130120', surfaceAlt:'#18022A', border:'#2D0550', borderAccent:'#4A0880', text:'#FFE0FF', textMuted:'#C080D0', textDim:'#3A0660', font:"'JetBrains Mono', monospace", displayFont:"'Space Grotesk', sans-serif", glow:'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(220,60,255,0.15) 0%, transparent 60%)', accent:'#E879F9' },
  };

  const t = themes[theme] || themes.dark;

  // ── Format helpers (JS, not inside HTML string) ───────────────────────────
  function fmtVal(val, metric) {
    if (val == null || val === 0) return '\u2014';
    if (!metric) return String(val);
    if (metric.key === 'cost_usd') {
      if (val >= 10000) return '$' + (val / 1000).toFixed(1) + 'k';
      if (val >= 1000)  return '$' + Math.round(val).toLocaleString();
      return '$' + Number(val).toFixed(2);
    }
    if (metric.key === 'tokens_used') {
      if (val >= 1000) return (val / 1000).toFixed(1) + 'M';
      return val + 'K';
    }
    // Sessions, commits, lines, etc. — show exact numbers with commas
    if (metric.key === 'sessions' || metric.key === 'commits' || metric.key === 'bugs_fixed' || metric.key === 'files_edited') {
      if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
      return Number(val).toLocaleString();
    }
    if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
    if (val >= 100000)  return (val / 1000).toFixed(0) + 'k';
    if (val >= 10000)   return (val / 1000).toFixed(1) + 'k';
    return Number(val).toLocaleString();
  }

  function fmtStatStrip(val, metric) {
    if (!val || val === 0) return '\u2014';
    return fmtVal(val, metric);
  }

  // ── Totals — parent headers + plain rows, NOT model sub-rows ──────────────
  const topLevel = tools.filter(t2 => !t2.isModelRow);
  const totals   = {};
  const maxVals  = {};
  metrics.forEach(m => {
    totals[m.key]  = topLevel.reduce((s, tool) => s + (tool.metrics[m.key] || 0), 0);
    maxVals[m.key] = Math.max(...tools.map(tool => tool.metrics[m.key] || 0), 1);
  });

  // ── Header summary ─────────────────────────────────────────────────────────
  const hdrParts = [];
  if (totals['sessions'])    hdrParts.push(totals['sessions'].toLocaleString() + ' sessions');
  if (totals['tokens_used']) hdrParts.push(totals['tokens_used'] >= 1000 ? (totals['tokens_used']/1000).toFixed(1)+'M tokens' : totals['tokens_used']+'K tokens');
  if (totals['cost_usd'])    hdrParts.push('$' + totals['cost_usd'].toFixed(2));
  const hdrSub = hdrParts.length
    ? hdrParts.join(' \u00b7 ')
    : topLevel.length + ' tool' + (topLevel.length !== 1 ? 's' : '') + ' \u00b7 ' + metrics.length + ' metric' + (metrics.length !== 1 ? 's' : '');

  // ── Table rows ─────────────────────────────────────────────────────────────
  let toolRows = '';
  let rowIdx = 0;
  for (const tool of tools) {
    if (tool.isParentHeader) {
      const parentCells = metrics.map(metric => {
        const val = tool.metrics[metric.key] || 0;
        if (metric.key === 'sessions' && val > 0) {
          return '<td class="metric-cell"><span class="ph-sessions">' + val + ' sessions</span></td>';
        }
        if ((metric.key === 'tokens_used' || metric.key === 'cost_usd') && val > 0) {
          return '<td class="metric-cell"><span class="ph-agg" style="color:' + tool.color + '88">' + fmtVal(val, metric) + ' total</span></td>';
        }
        return '<td class="metric-cell"></td>';
      }).join('');
      toolRows += '<tr class="parent-hdr-row">'
        + '<td class="parent-hdr-cell">'
        + '<span class="ph-icon" style="color:' + tool.color + '">' + tool.icon + '</span>'
        + '<span class="ph-name" style="color:' + tool.color + '">' + tool.name + '</span>'
        + '</td>' + parentCells + '</tr>';

    } else if (tool.isModelRow) {
      const branch = tool.isLast ? '\u2570' : '\u251c';
      const cells = metrics.map(metric => {
        const val = tool.metrics[metric.key] || 0;
        const pct = Math.min((val / maxVals[metric.key]) * 100, 100);
        return '<td class="metric-cell"><div class="bar-wrap">'
          + '<div class="bar-fill" style="width:' + (val > 0 ? Math.max(pct,2) : 0) + '%;background:' + tool.color + ';opacity:' + (val > 0 ? 0.65 : 0) + '"></div>'
          + '<span class="bar-val" style="color:' + (val > 0 ? tool.color : t.textDim) + '">' + fmtVal(val, metric) + '</span>'
          + '</div></td>';
      }).join('');
      toolRows += '<tr class="tool-row model-row" style="animation-delay:' + (rowIdx*40) + 'ms">'
        + '<td class="name-cell model-name-cell">'
        + '<span class="model-branch" style="color:' + tool.color + '44">' + branch + '\u2500</span>'
        + '<span class="model-name">' + tool.name + '</span>'
        + '</td>' + cells + '</tr>';
      rowIdx++;

    } else {
      const cells = metrics.map(metric => {
        const val = tool.metrics[metric.key] || 0;
        const pct = Math.min((val / maxVals[metric.key]) * 100, 100);
        return '<td class="metric-cell"><div class="bar-wrap">'
          + '<div class="bar-fill" style="width:' + (val > 0 ? Math.max(pct,2) : 0) + '%;background:' + tool.color + ';opacity:' + (val > 0 ? 0.75 : 0) + '"></div>'
          + '<span class="bar-val" style="color:' + (val > 0 ? tool.color : t.textDim) + '">' + fmtVal(val, metric) + '</span>'
          + '</div></td>';
      }).join('');
      toolRows += '<tr class="tool-row" style="animation-delay:' + (rowIdx*55) + 'ms">'
        + '<td class="name-cell">'
        + '<span class="t-icon" style="color:' + tool.color + '">' + tool.icon + '</span>'
        + '<span class="t-name">' + tool.name + '</span>'
        + '</td>' + cells + '</tr>';
      rowIdx++;
    }
  }

  // ── Heatmap — per-tool rows ────────────────────────────────────────────────
  let heatmapHtml = '';
  if (heatmapData && heatmapData.length > 0) {
    // Strategy: build toolDailyMap from heatmapData entries.
    // Entries may have toolKey (ideal) or may be missing it (common bug).
    // If toolKey is missing on most entries, fall back to extracting daily
    // arrays directly from each tool's _daily property if available.
    const toolDailyMap = new Map(); // toolKey -> Map<date, sessions>

    // Pass 1: group entries that DO have toolKey
    let withKey = 0;
    for (const entry of heatmapData) {
      if (!entry.date) continue;
      if (entry.toolKey) {
        withKey++;
        if (!toolDailyMap.has(entry.toolKey)) toolDailyMap.set(entry.toolKey, new Map());
        const dm = toolDailyMap.get(entry.toolKey);
        const s = entry.sessions || (entry.tokens > 0 ? 1 : 0) || (entry.totalTokens > 0 ? 1 : 0) || (entry.cost > 0 ? 1 : 0) || (entry.totalCost > 0 ? 1 : 0);
        dm.set(entry.date, (dm.get(entry.date) || 0) + (s || 1));
      }
    }

    // Pass 2: if few/no entries had toolKey, build from entries without it.
    // These are typically flat arrays where each entry has date + totalTokens/sessions
    // but the toolKey was never injected by the main CLI.
    if (withKey < heatmapData.length * 0.5) {
      // Group entries without toolKey by scanning all entries and using
      // any available toolKey, or fall into a merged bucket
      for (const entry of heatmapData) {
        if (!entry.date || entry.toolKey) continue; // skip already-processed
        const key = '_unkeyed';
        if (!toolDailyMap.has(key)) toolDailyMap.set(key, new Map());
        const dm = toolDailyMap.get(key);
        const s = entry.sessions || (entry.tokens > 0 ? 1 : 0) || (entry.totalTokens > 0 ? 1 : 0) || (entry.cost > 0 ? 1 : 0) || (entry.totalCost > 0 ? 1 : 0);
        dm.set(entry.date, (dm.get(entry.date) || 0) + (s || 1));
      }
    }

    // Only show tools that actually have daily data
    const hmTools = [];
    for (const tool of tools) {
      if (tool.isModelRow) continue;
      const dm = toolDailyMap.get(tool.key);
      if (dm && dm.size > 0) hmTools.push({ key: tool.key, name: tool.name, icon: tool.icon, color: tool.color, dm });
    }

    // If no per-tool matches found, use _unkeyed merged data as a single row
    if (hmTools.length === 0) {
      const merged = toolDailyMap.get('_unkeyed') || new Map();
      // Also try merging ALL entries as last resort
      if (merged.size === 0) {
        for (const entry of heatmapData) {
          if (!entry.date) continue;
          const s = entry.sessions || (entry.tokens > 0 ? 1 : 0) || (entry.totalTokens > 0 ? 1 : 0) || (entry.cost > 0 ? 1 : 0) || (entry.totalCost > 0 ? 1 : 0);
          merged.set(entry.date, (merged.get(entry.date) || 0) + (s || 1));
        }
      }
      if (merged.size > 0) {
        hmTools.push({ key: '_merged', name: 'Activity', icon: '◈', color: t.accent, dm: merged });
      }
    }

    if (hmTools.length > 0) {
      // Date range: last 53 weeks
      const today = new Date();
      today.setHours(0,0,0,0);
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - today.getDay() - (52 * 7));

      // Month labels (shared across all rows)
      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const monthLabels = [];
      let prevMonth = -1;
      for (let col = 0; col < 53; col++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + col * 7);
        if (d.getMonth() !== prevMonth) {
          monthLabels.push({ col, month: monthNames[d.getMonth()] });
          prevMonth = d.getMonth();
        }
      }
      let monthRow = '';
      for (const { col, month } of monthLabels) {
        monthRow += '<span class="hm-month" style="grid-column-start:' + (col+1) + '">' + month + '</span>';
      }

      // Build one row of cells per tool
      let toolRowsHtml = '';
      let totalActiveDays = 0;
      let totalSessions = 0;

      for (const ht of hmTools) {
        let maxVal = 0;
        for (const v of ht.dm.values()) { if (v > maxVal) maxVal = v; }
        if (maxVal === 0) maxVal = 1;

        let activeDays = 0;
        let toolSessions = 0;
        let cells = '';
        for (let col = 0; col < 53; col++) {
          for (let row = 0; row < 7; row++) {
            const d = new Date(startDate);
            d.setDate(startDate.getDate() + col * 7 + row);
            if (d > today) { cells += '<div class="hm-cell hm-empty"></div>'; continue; }
            const dateStr = d.toISOString().slice(0,10);
            const val = ht.dm.get(dateStr) || 0;
            if (val > 0) { activeDays++; toolSessions += val; }
            const intensity = val === 0 ? 0 : Math.min(Math.ceil((val / maxVal) * 4), 4);
            const opacity = [0, 0.25, 0.45, 0.7, 1][intensity];
            const bg = val === 0 ? t.border : ht.color;
            cells += '<div class="hm-cell" style="background:' + bg + ';opacity:' + (val === 0 ? 1 : opacity) + '" title="' + dateStr + ': ' + val + ' sessions"></div>';
          }
        }
        totalActiveDays += activeDays;
        totalSessions += toolSessions;

        toolRowsHtml += ''
          + '<div class="hm-tool-row">'
          + '  <div class="hm-tool-label">'
          + '    <span class="hm-tool-icon" style="color:' + ht.color + '">' + ht.icon + '</span>'
          + '    <span class="hm-tool-name" style="color:' + ht.color + '">' + ht.name + '</span>'
          + '  </div>'
          + '  <div class="hm-grid">' + cells + '</div>'
          + '</div>';
      }

      heatmapHtml = ''
        + '<div class="heatmap-section">'
        + '  <div class="hm-header">'
        + '    <span class="hm-title">Activity</span>'
        + '    <span class="hm-summary">' + totalActiveDays + ' active days &middot; ' + totalSessions + ' sessions</span>'
        + '  </div>'
        + '  <div class="hm-wrap">'
        + '    <div class="hm-months-row"><div class="hm-tool-label-spacer"></div><div class="hm-months">' + monthRow + '</div></div>'
        + toolRowsHtml
        + '  </div>'
        + '  <div class="hm-legend">'
        + '    <span class="hm-leg-lbl">Less</span>'
        + '    <div class="hm-cell" style="background:' + t.border + '"></div>'
        + '    <div class="hm-cell" style="background:' + t.textDim + ';opacity:.5"></div>'
        + '    <div class="hm-cell" style="background:' + t.textDim + ';opacity:.8"></div>'
        + '    <span class="hm-leg-lbl">More</span>'
        + '    <span class="hm-leg-sep"></span>'
        + hmTools.map(ht =>
            '<span class="hm-leg-tool">'
            + '<div class="hm-cell" style="background:' + ht.color + '"></div>'
            + '<span class="hm-leg-lbl">' + ht.name + '</span>'
            + '</span>'
          ).join('')
        + '  </div>'
        + '</div>';
    }
  }

  // ── Stat strip ─────────────────────────────────────────────────────────────
  const statCards = metrics.map(m =>
    '<div class="stat">'
    + '<div class="s-icon">' + m.icon + '</div>'
    + '<div class="s-val">' + fmtStatStrip(totals[m.key] || 0, m) + '</div>'
    + '<div class="s-lbl">' + m.label + '</div>'
    + '</div>'
  ).join('');

  // ── Donut — auto-pick the most visually useful metric ───────────────────
  // Pick the metric where no single tool dominates >85%, preferring tokens > cost > sessions
  function pickDonutMetric() {
    const candidates = metrics.filter(m => {
      const total = topLevel.reduce((s, t2) => s + (t2.metrics[m.key] || 0), 0);
      return total > 0;
    });
    if (candidates.length === 0) return metrics[0];
    // Score each: lower max-share = more balanced = better donut
    let best = candidates[0];
    let bestMaxShare = 1;
    for (const m of candidates) {
      const total = topLevel.reduce((s, t2) => s + (t2.metrics[m.key] || 0), 0) || 1;
      const maxShare = Math.max(...topLevel.map(t2 => (t2.metrics[m.key] || 0) / total));
      if (maxShare < bestMaxShare) { bestMaxShare = maxShare; best = m; }
    }
    return best;
  }
  const primary  = pickDonutMetric();
  const dTotal   = topLevel.reduce((s, t2) => s + (t2.metrics[primary ? primary.key : ''] || 0), 0) || 1;
  let cumAngle   = 0;
  let donutSegs  = '';
  let donutLegend = '';
  const legendRows = topLevel.filter(tool => (tool.metrics[primary ? primary.key : ''] || 0) > 0).slice(0, 8);

  for (const tool of topLevel) {
    const val = tool.metrics[primary ? primary.key : ''] || 0;
    if (val === 0) continue;
    const angle = (val / dTotal) * 360;
    const cx = 70, cy = 70, ro = 56, ri = 38;
    const a1 = (cumAngle - 90) * Math.PI / 180;
    const a2 = (cumAngle + angle - 90) * Math.PI / 180;
    const lg = angle > 180 ? 1 : 0;
    const d = 'M ' + (cx+ro*Math.cos(a1)) + ' ' + (cy+ro*Math.sin(a1))
      + ' A ' + ro + ' ' + ro + ' 0 ' + lg + ' 1 ' + (cx+ro*Math.cos(a2)) + ' ' + (cy+ro*Math.sin(a2))
      + ' L ' + (cx+ri*Math.cos(a2)) + ' ' + (cy+ri*Math.sin(a2))
      + ' A ' + ri + ' ' + ri + ' 0 ' + lg + ' 0 ' + (cx+ri*Math.cos(a1)) + ' ' + (cy+ri*Math.sin(a1))
      + ' Z';
    donutSegs += '<path d="' + d + '" fill="' + tool.color + '" opacity="0.9"/>';
    cumAngle += angle;
  }

  for (const tool of legendRows) {
    const pct = Math.round((tool.metrics[primary ? primary.key : ''] || 0) / dTotal * 100);
    donutLegend += '<div class="leg-item">'
      + '<span class="leg-dot" style="background:' + tool.color + '"></span>'
      + '<span class="leg-name">' + tool.name + '</span>'
      + '<span class="leg-pct" style="color:' + tool.color + '">' + pct + '%</span>'
      + '</div>';
  }

  // ── Share URL ──────────────────────────────────────────────────────────────
  const shareToolLines = topLevel.slice(0, 5).map(tool => {
    const parts = [];
    if (tool.metrics.sessions)    parts.push(Number(tool.metrics.sessions).toLocaleString() + ' sessions');
    if (tool.metrics.tokens_used) parts.push(fmtVal(tool.metrics.tokens_used, metrics.find(m => m.key === 'tokens_used')) + ' tokens');
    if (tool.metrics.cost_usd)    parts.push(fmtVal(tool.metrics.cost_usd, metrics.find(m => m.key === 'cost_usd')));
    return tool.icon + ' ' + tool.name + (parts.length ? ': ' + parts.join(' \u00b7 ') : '');
  }).join('\n');
  const shareLines = [
    title,
    '',
    shareToolLines,
    '',
    hdrSub,
    '',
    'Generated with aicard',
    'github.com/KrishnaSathvik/aicard',
  ].join('\n');
  const shareUrl  = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(shareLines);
  const safeTitle = title.replace(/[^a-z0-9]/gi, '-').toLowerCase();

  // ── Column headers ─────────────────────────────────────────────────────────
  const colHeaders = metrics.map(m => '<th>' + m.icon + ' ' + m.label + '</th>').join('');

  // ── HTML output (plain string concat — NO nested template literals) ────────
  return '<!DOCTYPE html>\n'
  + '<html lang="en">\n'
  + '<head>\n'
  + '<meta charset="UTF-8"/>\n'
  + '<meta name="viewport" content="width=device-width,initial-scale=1"/>\n'
  + '<title>' + title + '</title>\n'
  + '<meta property="og:title" content="' + title + '"/>\n'
  + '<meta property="og:description" content="' + hdrSub + ' \u00b7 Generated with aicard"/>\n'
  + '<meta name="twitter:card" content="summary_large_image"/>\n'
  + '<meta name="twitter:title" content="' + title + '"/>\n'
  + '<meta name="twitter:description" content="' + hdrSub + '"/>\n'
  + '<link rel="preconnect" href="https://fonts.googleapis.com"/>\n'
  + '<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet"/>\n'
  + '<style>\n'
  + '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}\n'
  + 'body{background:' + t.bg + ';color:' + t.text + ';font-family:' + t.font + ';min-height:100vh;display:flex;align-items:center;justify-content:center;padding:48px 20px}\n'
  + '.card{width:900px;max-width:100%;background:' + t.surface + ';border:1px solid ' + t.border + ';border-radius:20px;overflow:hidden;box-shadow:0 32px 80px rgba(0,0,0,.55);position:relative}\n'
  + '.card::before{content:"";position:absolute;inset:0;background:' + t.glow + ';pointer-events:none;z-index:0}\n'
  + '.card>*{position:relative;z-index:1}\n'
  + '.hdr{padding:28px 36px 24px;border-bottom:1px solid ' + t.border + ';background:' + t.surfaceAlt + ';display:flex;align-items:flex-start;justify-content:space-between;gap:20px}\n'
  + '.hdr-title{font-family:' + t.displayFont + ';font-size:26px;font-weight:700;letter-spacing:-.5px;color:' + t.text + ';line-height:1.2}\n'
  + '.hdr-sub{font-size:11px;color:' + t.textMuted + ';margin-top:7px;letter-spacing:.04em}\n'
  + '.hdr-right{text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0}\n'
  + '.badge{display:inline-block;font-size:11px;color:' + t.textMuted + ';border:1px solid ' + t.border + ';border-radius:6px;padding:4px 12px;letter-spacing:.04em;white-space:nowrap}\n'
  + '.handle{font-size:11px;color:' + t.textMuted + '}\n'
  + '.stats{display:flex;border-bottom:1px solid ' + t.border + '}\n'
  + '.stat{flex:1;padding:18px 20px;border-right:1px solid ' + t.border + '}\n'
  + '.stat:last-child{border-right:none}\n'
  + '.s-icon{font-size:13px;color:' + t.textMuted + ';margin-bottom:5px}\n'
  + '.s-val{font-family:' + t.displayFont + ';font-size:22px;font-weight:700;color:' + t.text + ';letter-spacing:-.5px;line-height:1}\n'
  + '.s-lbl{font-size:9.5px;color:' + t.textMuted + ';text-transform:uppercase;letter-spacing:.1em;margin-top:4px}\n'
  + '.body{display:flex;min-height:200px}\n'
  + '.donut-panel{width:196px;flex-shrink:0;border-right:1px solid ' + t.border + ';padding:22px 18px;display:flex;flex-direction:column;gap:14px}\n'
  + '.dp-title{font-size:9.5px;color:' + t.textMuted + ';text-transform:uppercase;letter-spacing:.12em;padding-bottom:10px;border-bottom:1px solid ' + t.border + '}\n'
  + '.dp-chart{display:flex;justify-content:center}\n'
  + '.dp-legend{display:flex;flex-direction:column;gap:7px}\n'
  + '.leg-item{display:flex;align-items:center;gap:7px}\n'
  + '.leg-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}\n'
  + '.leg-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;color:' + t.textMuted + '}\n'
  + '.leg-pct{font-weight:600;font-size:10.5px;flex-shrink:0}\n'
  + '.tbl-panel{flex:1;overflow:hidden;min-width:0}\n'
  + 'table{width:100%;border-collapse:collapse}\n'
  + 'thead tr{border-bottom:2px solid ' + t.border + ';background:' + t.surfaceAlt + '}\n'
  + 'th{padding:10px 12px;font-size:9px;color:' + t.textMuted + ';text-transform:uppercase;letter-spacing:.12em;font-weight:600;text-align:left;white-space:nowrap}\n'
  + 'th:first-child{padding-left:18px;width:150px}\n'
  + '.parent-hdr-row{background:' + t.surfaceAlt + '}\n'
  + '.parent-hdr-cell{padding:8px 18px 5px;display:flex;align-items:center;gap:8px}\n'
  + '.ph-sessions{font-size:10.5px;font-weight:600;color:' + t.textMuted + ';letter-spacing:.02em}\n'
  + '.ph-agg{font-size:10px;letter-spacing:.02em}\n'
  + '.ph-icon{font-size:12px;flex-shrink:0}\n'
  + '.ph-name{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.12em}\n'
  + '.tool-row{border-bottom:1px solid ' + t.border + ';opacity:0;animation:fadeIn .35s ease forwards}\n'
  + '.tool-row:last-child{border-bottom:none}\n'
  + '.tool-row:hover{background:' + t.surfaceAlt + '}\n'
  + '@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}\n'
  + '.model-row td:first-child{padding-left:0}\n'
  + '.model-name-cell{display:flex;align-items:center;padding-left:12px !important}\n'
  + '.model-branch{font-family:monospace;font-size:11px;flex-shrink:0;letter-spacing:-1px;margin-right:4px}\n'
  + '.model-name{font-size:10.5px;font-weight:400;color:' + t.textMuted + '}\n'
  + 'td{padding:8px 12px;vertical-align:middle}\n'
  + 'td:first-child{padding-left:18px}\n'
  + '.name-cell{display:flex;align-items:center;gap:8px;white-space:nowrap}\n'
  + '.t-icon{font-size:13px;width:16px;text-align:center;flex-shrink:0}\n'
  + '.t-name{font-size:12px;font-weight:500;color:' + t.text + '}\n'
  + '.metric-cell{min-width:80px}\n'
  + '.bar-wrap{position:relative;height:22px;display:flex;align-items:center}\n'
  + '.bar-fill{position:absolute;left:0;top:4px;bottom:4px;border-radius:3px;transition:width .5s cubic-bezier(.16,1,.3,1)}\n'
  + '.bar-val{position:relative;z-index:1;font-size:11px;font-weight:500;padding-left:6px;white-space:nowrap}\n'
  + '.heatmap-section{padding:16px 20px 14px;border-top:1px solid ' + t.border + '}\n'
  + '.hm-header{display:flex;align-items:baseline;gap:10px;margin-bottom:10px}\n'
  + '.hm-title{font-size:9.5px;text-transform:uppercase;letter-spacing:.12em;color:' + t.textMuted + ';font-weight:600}\n'
  + '.hm-summary{font-size:9.5px;color:' + t.textDim + '}\n'
  + '.hm-wrap{display:flex;flex-direction:column;gap:6px}\n'
  + '.hm-months-row{display:flex;align-items:flex-end;gap:8px;margin-bottom:2px}\n'
  + '.hm-tool-label-spacer{width:90px;flex-shrink:0}\n'
  + '.hm-months{display:grid;grid-template-columns:repeat(53,11px);gap:2px}\n'
  + '.hm-month{font-size:8px;color:' + t.textDim + ';white-space:nowrap;grid-row:1}\n'
  + '.hm-tool-row{display:flex;align-items:center;gap:8px}\n'
  + '.hm-tool-label{width:90px;flex-shrink:0;display:flex;align-items:center;gap:5px;justify-content:flex-end}\n'
  + '.hm-tool-icon{font-size:10px}\n'
  + '.hm-tool-name{font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n'
  + '.hm-grid{display:grid;grid-template-rows:repeat(7,10px);grid-auto-flow:column;grid-auto-columns:11px;gap:2px}\n'
  + '.hm-cell{width:11px;height:10px;border-radius:2px;flex-shrink:0}\n'
  + '.hm-cell:hover{outline:1px solid ' + t.accent + ';outline-offset:1px;cursor:default;z-index:1;position:relative}\n'
  + '.hm-empty{background:transparent !important;opacity:0 !important}\n'
  + '.hm-legend{display:flex;align-items:center;gap:3px;margin-top:6px;justify-content:flex-end;flex-wrap:wrap}\n'
  + '.hm-leg-lbl{font-size:8.5px;color:' + t.textDim + ';margin:0 2px}\n'
  + '.hm-leg-sep{width:1px;height:10px;background:' + t.border + ';margin:0 6px}\n'
  + '.hm-leg-tool{display:inline-flex;align-items:center;gap:3px;margin:0 2px}\n'
  + '.hm-leg-tool .hm-leg-lbl{color:' + t.textMuted + ';font-weight:500}\n'
  + '.footer{padding:12px 36px;border-top:1px solid ' + t.border + ';background:' + t.surfaceAlt + ';display:flex;align-items:center;justify-content:space-between}\n'
  + '.ft-l{font-size:9.5px;color:' + t.textDim + ';letter-spacing:.05em}\n'
  + '.ft-actions{display:flex;align-items:center;gap:8px}\n'
  + '.ft-btn{display:inline-flex;align-items:center;gap:5px;padding:6px 14px;border-radius:7px;font-size:10px;font-weight:600;letter-spacing:.04em;cursor:pointer;text-decoration:none;border:1px solid ' + t.borderAccent + ';background:' + t.surfaceAlt + ';color:' + t.textMuted + ';font-family:' + t.font + ';transition:all .15s ease;outline:none}\n'
  + '.ft-btn:hover{border-color:' + t.accent + ';color:' + t.accent + '}\n'
  + '@media print{body{background:' + t.bg + ' !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}.ft-actions{display:none !important}.card{box-shadow:none !important;width:100% !important;max-width:none !important}@page{margin:0;size:auto}}\n'
  + '</style>\n'
  + '</head>\n'
  + '<body>\n'
  + '<div class="card">\n'
  + '  <div class="hdr">\n'
  + '    <div>\n'
  + '      <div class="hdr-title">' + title + '</div>\n'
  + '      <div class="hdr-sub">' + hdrSub + '</div>\n'
  + '    </div>\n'
  + '    <div class="hdr-right">\n'
  + '      <div class="badge">' + timeframe + '</div>\n'
  + (username ? '      <div class="handle">@' + username.replace(/^@/,'') + '</div>\n' : '')
  + '    </div>\n'
  + '  </div>\n'
  + '  <div class="stats">' + statCards + '</div>\n'
  + '  <div class="body">\n'
  + '    <div class="donut-panel">\n'
  + '      <div class="dp-title">' + (primary ? primary.label : 'Breakdown') + '</div>\n'
  + '      <div class="dp-chart">\n'
  + '        <svg width="140" height="140" viewBox="0 0 140 140">\n'
  + (donutSegs || '<circle cx="70" cy="70" r="56" fill="none" stroke="' + t.border + '" stroke-width="18"/>')
  + '\n          <circle cx="70" cy="70" r="30" fill="' + t.surface + '"/>\n'
  + '          <text x="70" y="63" text-anchor="middle" font-family="Space Grotesk,sans-serif" font-size="9" fill="' + t.textMuted + '" font-weight="600" letter-spacing="1">TOTAL</text>\n'
  + '          <text x="70" y="80" text-anchor="middle" font-family="Space Grotesk,sans-serif" font-size="14" fill="' + t.text + '" font-weight="700">' + fmtVal(totals[primary ? primary.key : ''] || 0, primary) + '</text>\n'
  + '        </svg>\n'
  + '      </div>\n'
  + '      <div class="dp-legend">' + donutLegend + '</div>\n'
  + '    </div>\n'
  + '    <div class="tbl-panel">\n'
  + '      <table>\n'
  + '        <thead><tr><th>Tool</th>' + colHeaders + '</tr></thead>\n'
  + '        <tbody>' + toolRows + '</tbody>\n'
  + '      </table>\n'
  + '    </div>\n'
  + '  </div>\n'
  + (heatmapHtml ? heatmapHtml + '\n' : '')
  + '  <div class="footer">\n'
  + '    <span class="ft-l">aicard \u00b7 github.com/KrishnaSathvik/aicard</span>\n'
  + '    <div class="ft-actions">\n'
  + '      <button class="ft-btn" onclick="savePng()">\u2913 Save as PNG</button>\n'
  + '      <button class="ft-btn" onclick="printCard()">\u2391 Save as PDF</button>\n'
  + '      <a class="ft-btn ft-share" href="' + shareUrl + '" target="_blank" rel="noopener">\u2717 Share on X</a>\n'
  + '    </div>\n'
  + '  </div>\n'
  + '</div>\n'
  + '<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>\n'
  + '<script>\n'
  + 'function printCard(){document.querySelector(".ft-actions").style.display="none";window.print();setTimeout(()=>{document.querySelector(".ft-actions").style.display="";},800);}\n'
  + 'async function savePng(){\n'
  + '  const btn=event.target;btn.textContent="Rendering\u2026";btn.disabled=true;\n'
  + '  try{\n'
  + '    const card=document.querySelector(".card");\n'
  + '    // Clone card into off-screen wrapper with NO overflow constraints\n'
  + '    const clone=card.cloneNode(true);\n'
  + '    // Remove footer actions from clone\n'
  + '    const cloneActions=clone.querySelector(".ft-actions");\n'
  + '    if(cloneActions)cloneActions.remove();\n'
  + '    // Create off-screen container\n'
  + '    const wrap=document.createElement("div");\n'
  + '    wrap.style.cssText="position:fixed;left:-9999px;top:0;z-index:-1;background:' + t.bg + ';";\n'
  + '    // Strip overflow from clone and all children\n'
  + '    clone.style.overflow="visible";\n'
  + '    clone.style.borderRadius="20px";\n'
  + '    clone.style.width=card.offsetWidth+"px";\n'
  + '    clone.querySelectorAll("*").forEach(el=>{\n'
  + '      const cs=getComputedStyle(el);\n'
  + '      if(cs.overflow==="hidden")el.style.overflow="visible";\n'
  + '    });\n'
  + '    wrap.appendChild(clone);\n'
  + '    document.body.appendChild(wrap);\n'
  + '    // Wait for layout\n'
  + '    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));\n'
  + '    const canvas=await html2canvas(clone,{\n'
  + '      backgroundColor:"' + t.bg + '",\n'
  + '      scale:2,\n'
  + '      useCORS:true,\n'
  + '      logging:false,\n'
  + '      width:clone.scrollWidth,\n'
  + '      height:clone.scrollHeight,\n'
  + '    });\n'
  + '    document.body.removeChild(wrap);\n'
  + '    const link=document.createElement("a");\n'
  + '    link.download="' + safeTitle + '.png";\n'
  + '    link.href=canvas.toDataURL("image/png");\n'
  + '    link.click();\n'
  + '  }catch(e){alert("PNG export failed: "+e.message);console.error(e);}\n'
  + '  btn.textContent="\\u2913 Save as PNG";btn.disabled=false;\n'
  + '}\n'
  + '</script>\n'
  + '</body>\n'
  + '</html>\n';
}
