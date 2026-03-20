/**
 * Tula-Bench v2 (TB) — Atomic Feedback Capture & Smart Insights
 * ───────────────────────────────────────────────────────────────
 * Log AI tool moments as you work. No setup. Pure signal → insight.
 */
(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
     §1  CORE INIT
     ══════════════════════════════════════════════════════════════ */
  var _fw = window.AnkuraCore.init({
    backUrl: '../index.html',
    onReset: function () { resetAll(); }
  });
  var State = _fw.State;

  /* ══════════════════════════════════════════════════════════════
     §2  CONSTANTS — never mutated by user, out-of-the-box defaults
     ══════════════════════════════════════════════════════════════ */
  var SENTIMENTS = [
    { id: 'rock-bottom', emoji: '💀', label: 'Rock Bottom', score: -2 },
    { id: 'friction',    emoji: '😤', label: 'Friction',    score: -1 },
    { id: 'meh',         emoji: '😐', label: 'Meh',         score:  0 },
    { id: 'nice',        emoji: '👍', label: 'Nice',        score:  1 },
    { id: 'brilliant',   emoji: '🚀', label: 'Brilliant',   score:  2 }
  ];

  var DEFAULT_TOOLS = [
    { id: 'claude-code',    name: 'Claude Code',    label: 'CC', chipClass: 'tb-chip--tool-a' },
    { id: 'github-copilot', name: 'GitHub Copilot', label: 'GC', chipClass: 'tb-chip--tool-b' }
  ];

  var CRITERIA = [
    { id: 'c-accuracy',   name: 'Accuracy',   full: 'Accuracy & Correctness'       },
    { id: 'c-context',    name: 'Context',     full: 'Contextual Understanding'     },
    { id: 'c-completion', name: 'Completion',  full: 'Completion Quality & Speed'   },
    { id: 'c-bugfix',     name: 'Bug Fix',     full: 'Bug Detection & Fixing'       },
    { id: 'c-refactor',   name: 'Refactor',    full: 'Refactoring Capabilities'     },
    { id: 'c-agentic',    name: 'Agentic',     full: 'Agentic Capabilities'         }
  ];

  var DECISIONS = [
    { id: 'accept',  emoji: '✅', label: 'Accepted as-is' },
    { id: 'tweak',   emoji: '✏️', label: 'Tweaked it' },
    { id: 'rewrite', emoji: '🔄', label: 'Rewrote it' },
    { id: 'reject',  emoji: '🚫', label: 'Rejected entirely' }
  ];

  var SKILL_REASONS = [
    { id: 'sk-arch',     short: 'Architecture',  name: 'Architectural Reasoning' },
    { id: 'sk-debug',    short: 'Debugging',     name: 'Distributed Debugging' },
    { id: 'sk-legacy',   short: 'Legacy',        name: 'Legacy Code Understanding' },
    { id: 'sk-business', short: 'Business',      name: 'Business Translation' },
    { id: 'sk-strategy', short: 'Strategy',      name: 'Strategic Systems Thinking' },
    { id: 'sk-legal',    short: 'Legal/Ethics',  name: 'Legal/Ethical Accountability' },
    { id: 'sk-human',    short: 'Human',         name: 'Human Connection' },
    { id: 'sk-nocode',   short: 'No-Code',       name: 'Knowing When NOT to Code' }
  ];

  /* ══════════════════════════════════════════════════════════════
     §3  STATE
     ══════════════════════════════════════════════════════════════ */
  var events = State.load('tb_events', []);
  var tools  = State.load('tb_tools',  DEFAULT_TOOLS);

  // Capture UI transient state
  var captureTool      = State.load('tb_last_tool', tools[0] ? tools[0].id : null);
  var captureSentiment = null;
  var captureCriterion = null;
  var captureDecision  = null;
  var captureReason    = null;

  // Log tab filter state
  var logFilter = { tool: null, sentiment: null, decision: null };

  /* ══════════════════════════════════════════════════════════════
     §4  HELPERS
     ══════════════════════════════════════════════════════════════ */
  function escHTML(str) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(String(str == null ? '' : str)));
    return d.innerHTML;
  }

  /** Minimal markdown → HTML renderer (handles the output of generateMarkdown()) */
  function mdToHtml(md) {
    function esc(str) {
      return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function fmt(text) {
      var s = esc(text);
      s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');
      return s;
    }
    var lines = md.split('\n');
    var out = [];
    var inList = false;
    var tableBuf = [];

    function flushList() {
      if (inList) { out.push('</ul>'); inList = false; }
    }
    function flushTable() {
      if (!tableBuf.length) return;
      var rows = tableBuf; tableBuf = [];
      var headerCells = rows[0].split('|').slice(1, -1).map(function (c) { return c.trim(); });
      var thead = '<thead><tr>' + headerCells.map(function (c) { return '<th>' + fmt(c) + '</th>'; }).join('') + '</tr></thead>';
      var dataRows = rows.slice(2); // skip the separator row (| :--- | :---: |)
      var tbody = '<tbody>' + dataRows.map(function (row) {
        var cells = row.split('|').slice(1, -1).map(function (c) { return c.trim(); });
        return '<tr>' + cells.map(function (c) { return '<td>' + fmt(c) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody>';
      out.push('<table class="tb-md-table">' + thead + tbody + '</table>');
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var hm = line.match(/^(#{1,4})\s+(.+)$/);
      if (hm) {
        flushList(); flushTable();
        var lvl = hm[1].length;
        out.push('<h' + lvl + ' class="tb-md-h' + lvl + '">' + fmt(hm[2]) + '</h' + lvl + '>');
        continue;
      }
      if (/^---+$/.test(line)) {
        flushList(); flushTable();
        out.push('<hr class="tb-md-hr">');
        continue;
      }
      if (/^\|/.test(line)) {
        flushList();
        tableBuf.push(line);
        if (i + 1 >= lines.length || !/^\|/.test(lines[i + 1])) flushTable();
        continue;
      }
      if (/^- /.test(line)) {
        flushTable();
        if (!inList) { out.push('<ul class="tb-md-list">'); inList = true; }
        out.push('<li>' + fmt(line.slice(2)) + '</li>');
        continue;
      }
      if (line.trim() === '') { flushList(); flushTable(); continue; }
      flushList(); flushTable();
      out.push('<p class="tb-md-p">' + fmt(line) + '</p>');
    }
    flushList(); flushTable();
    return out.join('');
  }

  function genId() {
    return 'evt-' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
  }

  function persist() {
    State.save('tb_events', events);
    State.save('tb_tools',  tools);
  }

  function persistCaptureTool(toolId) {
    captureTool = toolId;
    State.save('tb_last_tool', toolId);
  }

  function sentimentById(id) {
    for (var i = 0; i < SENTIMENTS.length; i++) {
      if (SENTIMENTS[i].id === id) return SENTIMENTS[i];
    }
    return null;
  }

  function criterionById(id) {
    for (var i = 0; i < CRITERIA.length; i++) {
      if (CRITERIA[i].id === id) return CRITERIA[i];
    }
    return null;
  }

  function toolById(id) {
    for (var i = 0; i < tools.length; i++) {
      if (tools[i].id === id) return tools[i];
    }
    return null;
  }

  function decisionById(id) {
    for (var i = 0; i < DECISIONS.length; i++) {
      if (DECISIONS[i].id === id) return DECISIONS[i];
    }
    return null;
  }

  function reasonById(id) {
    for (var i = 0; i < SKILL_REASONS.length; i++) {
      if (SKILL_REASONS[i].id === id) return SKILL_REASONS[i];
    }
    return null;
  }

  function sentimentScore(sentimentId) {
    var s = sentimentById(sentimentId);
    return s ? s.score : 0;
  }

  /** Relative time: "just now", "5m ago", "2h ago", "3d ago" */
  function relTime(isoStr) {
    var diff = Date.now() - new Date(isoStr).getTime();
    var sec  = Math.floor(diff / 1000);
    if (sec < 60)  return 'just now';
    var min = Math.floor(sec / 60);
    if (min < 60)  return min + 'm ago';
    var hr  = Math.floor(min / 60);
    if (hr  < 24)  return hr + 'h ago';
    var day = Math.floor(hr / 24);
    return day + 'd ago';
  }

  /** Heatmap cell background color based on avg score (-2 to +2) */
  function heatColor(score, count) {
    if (count === 0) return null; // handled as empty
    if (score <= -1.5) return '#6b1f1f';
    if (score <= -0.5) return '#5c2e2e';
    if (score <=  0.5) return null; // use CSS var
    if (score <=  1.5) return '#1e4a30';
    return '#164030';
  }

  /** Format score as "+1.5" or "−1.5" or "0.0" */
  function fmtScore(score) {
    if (score > 0)  return '+' + score.toFixed(1);
    if (score < 0)  return '\u2212' + Math.abs(score).toFixed(1);
    return '0.0';
  }

  /* ══════════════════════════════════════════════════════════════
     §5  CAPTURE TAB
     ══════════════════════════════════════════════════════════════ */

  function renderCaptureTools() {
    var row = document.getElementById('tool-row');
    if (!row) return;
    row.innerHTML = '';
    tools.forEach(function (tool) {
      var btn = document.createElement('button');
      btn.className = 'tb-tool-btn' + (tool.id === captureTool ? ' tb-tool-btn--selected' : '');
      btn.dataset.toolId = tool.id;
      btn.innerHTML =
        '<div class="tb-tool-btn__label-wrap">' +
          '<span class="tb-tool-btn__abbr">' + escHTML(tool.label) + '</span>' +
          '<span class="tb-tool-btn__name">' + escHTML(tool.name) + '</span>' +
        '</div>';
      btn.addEventListener('click', function () {
        persistCaptureTool(tool.id);
        renderCaptureTools();
        updateLogBtn();
      });
      row.appendChild(btn);
    });
  }

  function renderCaptureSentiments() {
    var row = document.getElementById('sentiment-row');
    if (!row) return;
    row.innerHTML = '';
    SENTIMENTS.forEach(function (s) {
      var btn = document.createElement('button');
      btn.className = 'tb-sentiment-btn' + (s.id === captureSentiment ? ' tb-sentiment-btn--selected' : '');
      btn.dataset.sentimentId = s.id;
      btn.innerHTML =
        '<span class="tb-sentiment-btn__emoji">' + s.emoji + '</span>' +
        '<span class="tb-sentiment-btn__label">' + escHTML(s.label) + '</span>';
      btn.addEventListener('click', function () {
        captureSentiment = s.id;
        renderCaptureSentiments();
        showDecisionStep();
        updateLogBtn();
      });
      row.appendChild(btn);
    });
  }

  function renderCaptureCriteria() {
    var wrap = document.getElementById('criterion-pills');
    if (!wrap) return;
    wrap.innerHTML = '';
    CRITERIA.forEach(function (c) {
      var btn = document.createElement('button');
      btn.className = 'tb-pill' + (c.id === captureCriterion ? ' tb-pill--selected' : '');
      btn.dataset.critId = c.id;
      btn.textContent = c.name;
      btn.addEventListener('click', function () {
        captureCriterion = (captureCriterion === c.id) ? null : c.id;
        renderCaptureCriteria();
      });
      wrap.appendChild(btn);
    });
  }

  function renderCaptureDecisions() {
    var row = document.getElementById('decision-row');
    if (!row) return;
    row.innerHTML = '';
    DECISIONS.forEach(function (d) {
      var btn = document.createElement('button');
      btn.className = 'tb-decision-btn' + (d.id === captureDecision ? ' tb-decision-btn--selected' : '');
      btn.innerHTML = '<span class="tb-decision-btn__emoji">' + d.emoji + '</span>' +
                      '<span class="tb-decision-btn__label">' + escHTML(d.label) + '</span>';
      btn.addEventListener('click', function () {
        captureDecision = (captureDecision === d.id) ? null : d.id;
        renderCaptureDecisions();
        showReasonStep();
      });
      row.appendChild(btn);
    });
  }

  function renderCaptureReasons() {
    var wrap = document.getElementById('reason-pills');
    if (!wrap) return;
    wrap.innerHTML = '';
    SKILL_REASONS.forEach(function (r) {
      var btn = document.createElement('button');
      btn.className = 'tb-pill' + (r.id === captureReason ? ' tb-pill--selected' : '');
      btn.textContent = r.short;
      btn.addEventListener('click', function () {
        captureReason = (captureReason === r.id) ? null : r.id;
        renderCaptureReasons();
      });
      wrap.appendChild(btn);
    });
  }

  function showDecisionStep() {
    var el = document.getElementById('decision-step');
    if (el) el.style.display = captureSentiment ? '' : 'none';
    if (captureSentiment) renderCaptureDecisions();
    if (!captureSentiment) { captureDecision = null; captureReason = null; }
    showReasonStep();
  }

  function showReasonStep() {
    var el = document.getElementById('reason-step');
    var show = captureDecision === 'rewrite' || captureDecision === 'reject';
    if (el) el.style.display = show ? '' : 'none';
    if (show) renderCaptureReasons();
    if (!show) captureReason = null;
  }

  function updateLogBtn() {
    var btn = document.getElementById('btn-log-it');
    if (!btn) return;
    var ready = captureTool && captureSentiment;
    btn.disabled = !ready;
    if (ready) {
      btn.classList.remove('tb-log-btn--disabled');
    } else {
      btn.classList.add('tb-log-btn--disabled');
    }
  }

  function submitEvent() {
    if (!captureTool || !captureSentiment) return;
    var noteEl = document.getElementById('capture-note');
    var note   = noteEl ? noteEl.value.trim() : '';

    var ev = {
      id:        genId(),
      ts:        new Date().toISOString(),
      tool:      captureTool,
      sentiment: captureSentiment,
      criterion: captureCriterion || null,
      note:      note,
      decision:  captureDecision || null,
      reason:    captureReason || null
    };
    events.unshift(ev); // newest first
    persist();

    // Reset: sentiment + criterion + decision + reason + note, keep tool sticky
    captureSentiment = null;
    captureCriterion = null;
    captureDecision  = null;
    captureReason    = null;
    if (noteEl) noteEl.value = '';

    renderCaptureSentiments();
    renderCaptureCriteria();
    showDecisionStep();
    updateLogBtn();
    renderRecent();
    flashLogBtn();
  }

  function flashLogBtn() {
    var btn = document.getElementById('btn-log-it');
    if (!btn) return;
    btn.textContent = '✓ Logged!';
    btn.classList.add('tb-log-btn--success');
    setTimeout(function () {
      btn.textContent = '⚡ LOG IT';
      btn.classList.remove('tb-log-btn--success');
      updateLogBtn();
    }, 1200);
  }

  function renderRecent() {
    var feed = document.getElementById('recent-feed');
    if (!feed) return;
    var recent = events.slice(0, 3);
    if (recent.length === 0) {
      feed.innerHTML = '';
      return;
    }
    var html = '<div class="tb-recent-label">Recent</div>';
    recent.forEach(function (ev) {
      var s    = sentimentById(ev.sentiment);
      var tool = toolById(ev.tool);
      var crit = ev.criterion ? criterionById(ev.criterion) : null;
      var dec = ev.decision ? decisionById(ev.decision) : null;
      html += '<div class="tb-recent-item">' +
                '<span class="tb-recent-emoji">' + (s ? s.emoji : '?') + '</span>' +
                '<span class="tb-recent-meta">' +
                  (tool ? '<span class="tb-chip ' + escHTML(tool.chipClass) + '">' + escHTML(tool.label) + '</span>' : '') +
                  (crit ? '<span class="tb-chip tb-chip--crit">' + escHTML(crit.name) + '</span>' : '') +
                  (dec ? '<span class="tb-chip tb-chip--decision">' + dec.emoji + '</span>' : '') +
                  (ev.note ? '<span class="tb-recent-note">"' + escHTML(ev.note) + '"</span>' : '') +
                '</span>' +
                '<span class="tb-recent-time">' + relTime(ev.ts) + '</span>' +
              '</div>';
    });
    feed.innerHTML = html;
  }

  function bindCaptureTab() {
    var btn = document.getElementById('btn-log-it');
    if (btn) {
      btn.addEventListener('click', function () {
        if (!btn.disabled) submitEvent();
      });
    }
    // Allow Enter key on note field to submit
    var noteEl = document.getElementById('capture-note');
    if (noteEl) {
      noteEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && captureTool && captureSentiment) {
          submitEvent();
        }
      });
    }
  }

  function renderCaptureTab() {
    renderCaptureTools();
    renderCaptureSentiments();
    renderCaptureCriteria();
    showDecisionStep();
    updateLogBtn();
    renderRecent();
  }

  /* ══════════════════════════════════════════════════════════════
     §6  LOG TAB
     ══════════════════════════════════════════════════════════════ */

  function buildFilterBar() {
    var bar = document.getElementById('log-filter-bar');
    if (!bar) return;
    bar.innerHTML = '';

    function makeFilter(label, key, val, getActive) {
      var btn = document.createElement('button');
      btn.className = 'tb-pill' + (getActive() ? ' tb-pill--selected' : '');
      btn.textContent = label;
      btn.addEventListener('click', function () {
        logFilter[key] = (logFilter[key] === val) ? null : val;
        buildFilterBar();
        renderLog();
      });
      bar.appendChild(btn);
    }

    // Tool filters
    makeFilter('All', 'tool', null, function () { return logFilter.tool === null; });
    tools.forEach(function (t) {
      makeFilter(t.label + ' ' + t.name, 'tool', t.id, function () { return logFilter.tool === t.id; });
    });

    // Sentiment filters
    SENTIMENTS.forEach(function (s) {
      makeFilter(s.emoji, 'sentiment', s.id, function () { return logFilter.sentiment === s.id; });
    });

    // Decision filters
    var sep = document.createElement('span');
    sep.className = 'tb-filter-sep';
    sep.textContent = '|';
    bar.appendChild(sep);
    DECISIONS.forEach(function (d) {
      makeFilter(d.emoji + ' ' + d.label, 'decision', d.id, function () { return logFilter.decision === d.id; });
    });
  }

  function filteredEvents() {
    return events.filter(function (ev) {
      if (logFilter.tool && ev.tool !== logFilter.tool) return false;
      if (logFilter.sentiment && ev.sentiment !== logFilter.sentiment) return false;
      if (logFilter.decision && ev.decision !== logFilter.decision) return false;
      return true;
    });
  }

  function renderLog() {
    var filtered = filteredEvents();
    var countEl  = document.getElementById('log-count');
    if (countEl) countEl.textContent = filtered.length + ' event' + (filtered.length !== 1 ? 's' : '') + (events.length !== filtered.length ? ' (filtered from ' + events.length + ')' : '');

    var list = document.getElementById('event-list');
    if (!list) return;

    if (filtered.length === 0) {
      list.innerHTML =
        '<div class="tb-empty">' +
          '<span class="tb-empty-icon">' + (events.length === 0 ? '⚡' : '🔍') + '</span>' +
          (events.length === 0
            ? 'No events yet.<br>Switch to Capture tab and log your first moment.'
            : 'No events match the current filter.') +
        '</div>';
      return;
    }

    list.innerHTML = '';
    filtered.forEach(function (ev) {
      var s    = sentimentById(ev.sentiment);
      var tool = toolById(ev.tool);
      var crit = ev.criterion ? criterionById(ev.criterion) : null;

      var card = document.createElement('div');
      card.className = 'tb-event-card';
      var dec = ev.decision ? decisionById(ev.decision) : null;
      var rsn = ev.reason ? reasonById(ev.reason) : null;
      card.innerHTML =
        '<span class="tb-event-sentiment">' + (s ? s.emoji : '?') + '</span>' +
        '<div class="tb-event-body">' +
          '<div class="tb-event-meta">' +
            (tool ? '<span class="tb-chip ' + escHTML(tool.chipClass) + '">' + escHTML(tool.label + ' ' + tool.name) + '</span>' : '') +
            (crit ? '<span class="tb-chip tb-chip--crit">' + escHTML(crit.name) + '</span>' : '') +
            (dec ? '<span class="tb-chip tb-chip--decision">' + dec.emoji + ' ' + escHTML(dec.label) + '</span>' : '') +
            (rsn ? '<span class="tb-chip tb-chip--reason">' + escHTML(rsn.short) + '</span>' : '') +
            '<span class="tb-chip tb-chip--time">' + relTime(ev.ts) + '</span>' +
          '</div>' +
          (ev.note ? '<div class="tb-event-note">"' + escHTML(ev.note) + '"</div>' : '') +
        '</div>' +
        '<button class="tb-event-delete" data-ev-id="' + escHTML(ev.id) + '" title="Delete event">×</button>';
      list.appendChild(card);
    });

    // Event delegation for delete
    list.addEventListener('click', function (e) {
      var btn = e.target.closest('.tb-event-delete');
      if (!btn) return;
      var evId = btn.dataset.evId;
      events = events.filter(function (ev) { return ev.id !== evId; });
      persist();
      renderLog();
      renderRecent();
    }, { once: true });
  }

  /* ══════════════════════════════════════════════════════════════
     §7  INSIGHTS TAB
     ══════════════════════════════════════════════════════════════ */

  /** Compute per-tool and per-(tool,criterion) statistics */
  function computeStats() {
    var toolStats = {};
    tools.forEach(function (t) {
      toolStats[t.id] = { total: 0, positive: 0, rockBottoms: 0, scoreSum: 0, breakdown: {} };
      SENTIMENTS.forEach(function (s) { toolStats[t.id].breakdown[s.id] = 0; });
    });

    var heatmap = {}; // heatmap[toolId][critId] = { sum, count }
    tools.forEach(function (t) {
      heatmap[t.id] = {};
      CRITERIA.forEach(function (c) { heatmap[t.id][c.id] = { sum: 0, count: 0 }; });
    });

    events.forEach(function (ev) {
      var ts = toolStats[ev.tool];
      if (!ts) return;
      ts.total++;
      var score = sentimentScore(ev.sentiment);
      ts.scoreSum += score;
      ts.breakdown[ev.sentiment] = (ts.breakdown[ev.sentiment] || 0) + 1;
      if (score > 0) ts.positive++;
      if (ev.sentiment === 'rock-bottom') ts.rockBottoms++;
      if (ev.criterion && heatmap[ev.tool] && heatmap[ev.tool][ev.criterion]) {
        heatmap[ev.tool][ev.criterion].sum += score;
        heatmap[ev.tool][ev.criterion].count++;
      }
    });

    // Compute averages
    tools.forEach(function (t) {
      var ts = toolStats[t.id];
      ts.avgScore  = ts.total > 0 ? ts.scoreSum / ts.total : null;
      ts.winRate   = ts.total > 0 ? Math.round((ts.positive / ts.total) * 100) : null;
    });

    CRITERIA.forEach(function (c) {
      tools.forEach(function (t) {
        var cell = heatmap[t.id][c.id];
        cell.avg = cell.count > 0 ? cell.sum / cell.count : null;
      });
    });

    // Decision stats per tool
    var decisionStats = {};
    tools.forEach(function (t) {
      decisionStats[t.id] = { accept: 0, tweak: 0, rewrite: 0, reject: 0, total: 0 };
    });
    events.forEach(function (ev) {
      if (!ev.decision || !decisionStats[ev.tool]) return;
      decisionStats[ev.tool][ev.decision]++;
      decisionStats[ev.tool].total++;
    });

    // Skill reason stats (across all events)
    var reasonStats = {};
    SKILL_REASONS.forEach(function (r) { reasonStats[r.id] = 0; });
    events.forEach(function (ev) {
      if (ev.reason && reasonStats[ev.reason] !== undefined) reasonStats[ev.reason]++;
    });

    // Trust per (tool, criterion): trust = (accept+tweak) / decided
    var trustMap = {};
    tools.forEach(function (t) {
      trustMap[t.id] = {};
      CRITERIA.forEach(function (c) { trustMap[t.id][c.id] = { trusted: 0, total: 0 }; });
    });
    events.forEach(function (ev) {
      if (!ev.decision || !ev.criterion) return;
      if (!trustMap[ev.tool] || !trustMap[ev.tool][ev.criterion]) return;
      trustMap[ev.tool][ev.criterion].total++;
      if (ev.decision === 'accept' || ev.decision === 'tweak') trustMap[ev.tool][ev.criterion].trusted++;
    });

    return { toolStats: toolStats, heatmap: heatmap, decisionStats: decisionStats, reasonStats: reasonStats, trustMap: trustMap };
  }

  function renderSmartSummary(toolStats, heatmap, decisionStats, reasonStats) {
    var el = document.getElementById('smart-summary');
    if (!el) return;

    var totalEvents = events.length;
    if (totalEvents === 0) {
      el.innerHTML = '<div class="tb-empty"><span class="tb-empty-icon">📊</span>Log some moments in the Capture tab to unlock insights.</div>';
      return;
    }

    var sentences = [];

    // Compare win rates
    var ranked = tools.filter(function (t) { return toolStats[t.id].total > 0; })
                      .sort(function (a, b) { return (toolStats[b.id].winRate || 0) - (toolStats[a.id].winRate || 0); });
    if (ranked.length >= 2) {
      var best  = ranked[0];
      var worst = ranked[ranked.length - 1];
      var bwr   = toolStats[best.id].winRate;
      var wwr   = toolStats[worst.id].winRate;
      if (bwr !== wwr) {
        sentences.push('<strong>' + escHTML(best.name) + '</strong> leads with <strong>' + bwr + '% win rate</strong> vs ' + escHTML(worst.name) + "'s " + wwr + '%.');
      }
    }

    // Biggest criterion gap
    var biggestGap = null, biggestGapScore = 0;
    CRITERIA.forEach(function (c) {
      if (tools.length < 2) return;
      var scores = tools.map(function (t) { return heatmap[t.id][c.id].avg; }).filter(function (v) { return v !== null; });
      if (scores.length < 2) return;
      var gap = Math.max.apply(null, scores) - Math.min.apply(null, scores);
      if (gap > biggestGapScore) {
        biggestGapScore = gap;
        var maxT = tools.filter(function (t) { return heatmap[t.id][c.id].avg !== null; })
                        .sort(function (a, b) { return heatmap[b.id][c.id].avg - heatmap[a.id][c.id].avg; });
        biggestGap = { crit: c, best: maxT[0], worst: maxT[maxT.length - 1] };
      }
    });
    if (biggestGap && biggestGapScore >= 1) {
      sentences.push('Biggest gap: <strong>' + escHTML(biggestGap.crit.full) + '</strong> — ' +
        escHTML(biggestGap.best.name) + ' ' + fmtScore(heatmap[biggestGap.best.id][biggestGap.crit.id].avg) +
        ' vs ' + escHTML(biggestGap.worst.name) + ' ' + fmtScore(heatmap[biggestGap.worst.id][biggestGap.crit.id].avg) + '.');
    }

    // Rock bottom alerts
    tools.forEach(function (t) {
      var ts = toolStats[t.id];
      if (ts.rockBottoms > 0) {
        sentences.push('⚠️ <strong>' + escHTML(t.name) + '</strong> has <strong style="color:var(--danger)">' +
          ts.rockBottoms + ' rock-bottom moment' + (ts.rockBottoms !== 1 ? 's' : '') + '</strong> — investigate immediately.');
      }
    });

    // Missing coverage
    var missing = CRITERIA.filter(function (c) {
      return tools.every(function (t) { return heatmap[t.id][c.id].count === 0; });
    });
    if (missing.length > 0 && missing.length < CRITERIA.length) {
      sentences.push('No data yet for: <em>' + missing.map(function (c) { return escHTML(c.name); }).join(', ') + '</em>. Log more moments to improve coverage.');
    }

    // Decision-based sentences
    var toolsWithDecisions = tools.filter(function (t) { return decisionStats[t.id].total >= 3; });
    if (toolsWithDecisions.length >= 1) {
      toolsWithDecisions.forEach(function (t) {
        var ds = decisionStats[t.id];
        var acceptRate = Math.round(((ds.accept + ds.tweak) / ds.total) * 100);
        if (acceptRate >= 80) {
          sentences.push('You accept <strong>' + acceptRate + '%</strong> of <strong>' + escHTML(t.name) + '</strong>\'s output — high trust.');
        } else if (acceptRate <= 40) {
          sentences.push('You reject/rewrite <strong>' + (100 - acceptRate) + '%</strong> of <strong>' + escHTML(t.name) + '</strong>\'s output — consider using it differently.');
        }
      });
    }

    // Top rejection reason
    var topReason = null, topReasonCount = 0;
    SKILL_REASONS.forEach(function (r) {
      if (reasonStats[r.id] > topReasonCount) { topReasonCount = reasonStats[r.id]; topReason = r; }
    });
    if (topReason && topReasonCount >= 2) {
      sentences.push('Top rejection reason: <strong>' + escHTML(topReason.name) + '</strong> (' + topReasonCount + ' events).');
    }

    el.innerHTML = '<div class="tb-smart-summary">' +
      sentences.map(function (s) { return '<p>' + s + '</p>'; }).join('') +
      '</div>';
  }

  function renderStatCards(toolStats) {
    var el = document.getElementById('stat-cards');
    if (!el) return;
    var total     = events.length;
    var positive  = events.filter(function (ev) { return sentimentScore(ev.sentiment) > 0; }).length;
    var rockTotal = events.filter(function (ev) { return ev.sentiment === 'rock-bottom'; }).length;
    var posRate   = total > 0 ? Math.round((positive / total) * 100) : 0;

    el.innerHTML =
      '<div class="tb-stat-card">' +
        '<div class="tb-stat-value">' + total + '</div>' +
        '<div class="tb-stat-label">Total Events</div>' +
      '</div>' +
      '<div class="tb-stat-card">' +
        '<div class="tb-stat-value">' + (total > 0 ? posRate + '%' : '—') + '</div>' +
        '<div class="tb-stat-label">Positive Rate</div>' +
      '</div>' +
      '<div class="tb-stat-card">' +
        '<div class="tb-stat-value">' +
          rockTotal +
          (rockTotal > 0 ? '<span class="tb-stat-alert">!</span>' : '') +
        '</div>' +
        '<div class="tb-stat-label">Rock Bottoms</div>' +
      '</div>';
  }

  function renderToolComparison(toolStats) {
    var el = document.getElementById('tool-comparison');
    if (!el) return;

    if (events.length === 0) {
      el.innerHTML = '<div class="tb-empty"><span class="tb-empty-icon">📋</span>No events yet.</div>';
      return;
    }

    var html = '';
    tools.forEach(function (t) {
      var ts = toolStats[t.id];
      if (ts.total === 0) {
        html += '<div class="tb-tool-block"><div class="tb-tool-block-header"><span class="tb-tool-block-name">' + escHTML(t.name) + '</span><span class="tb-tool-block-count">0 events</span></div><p class="tb-hint">No data yet.</p></div>';
        return;
      }
      var wr    = ts.winRate;
      var color = wr >= 70 ? 'var(--success)' : wr >= 50 ? 'var(--accent)' : 'var(--danger)';
      html += '<div class="tb-tool-block">' +
              '<div class="tb-tool-block-header">' +
                '<span class="tb-tool-block-name">' + escHTML(t.name) + '</span>' +
                '<span class="tb-tool-block-count">' + ts.total + ' event' + (ts.total !== 1 ? 's' : '') + '</span>' +
              '</div>' +
              '<div class="tb-bar-wrap">' +
                '<div class="tb-bar-track"><div class="tb-bar-fill" style="width:' + wr + '%;background:' + color + ';"></div></div>' +
                '<span class="tb-bar-pct">' + wr + '% win</span>' +
              '</div>' +
              '<div class="tb-sentiment-breakdown">' +
                SENTIMENTS.map(function (s) {
                  return '<span class="tb-bd-item">' + s.emoji + '×' + (ts.breakdown[s.id] || 0) + '</span>';
                }).join('') +
              '</div>' +
              '<div class="tb-tool-avg">Avg score: <strong>' + (ts.avgScore !== null ? fmtScore(ts.avgScore) : '—') + '</strong></div>' +
              '</div>';
    });
    el.innerHTML = html;
  }

  function renderHeatmap(heatmap) {
    var head = document.getElementById('heatmap-head');
    var body = document.getElementById('heatmap-body');
    if (!head || !body) return;

    if (events.length === 0) {
      head.innerHTML = '';
      body.innerHTML = '<tr><td colspan="' + (tools.length + 1) + '" class="tb-empty">No data yet.</td></tr>';
      return;
    }

    // Header
    var headRow = '<tr><th class="tb-heatmap-crit-col">Criterion</th>';
    tools.forEach(function (t) { headRow += '<th>' + escHTML(t.name) + '</th>'; });
    headRow += '</tr>';
    head.innerHTML = headRow;

    // Body
    var bodyHTML = '';
    CRITERIA.forEach(function (c) {
      bodyHTML += '<tr><td class="tb-heatmap-crit-col">' + escHTML(c.full) + '</td>';
      tools.forEach(function (t) {
        var cell  = heatmap[t.id][c.id];
        var count = cell.count;
        var avg   = cell.avg;
        if (count === 0) {
          bodyHTML += '<td class="tb-heatmap-cell tb-heatmap-empty">—</td>';
        } else {
          var bg = heatColor(avg, count);
          var style = bg ? 'background:' + bg + ';' : '';
          bodyHTML += '<td class="tb-heatmap-cell" style="' + style + '">' +
                        '<span class="tb-heatmap-score">' + fmtScore(avg) + '</span>' +
                        '<span class="tb-heatmap-count">' + count + ' ev.</span>' +
                      '</td>';
        }
      });
      bodyHTML += '</tr>';
    });
    body.innerHTML = bodyHTML;
  }

  function renderPainPoints(heatmap) {
    var el = document.getElementById('pain-points');
    if (!el) return;

    var pairs = [];
    tools.forEach(function (t) {
      CRITERIA.forEach(function (c) {
        var cell = heatmap[t.id][c.id];
        if (cell.count > 0) {
          var rockCount = events.filter(function (ev) {
            return ev.tool === t.id && ev.criterion === c.id && ev.sentiment === 'rock-bottom';
          }).length;
          pairs.push({ tool: t, crit: c, avg: cell.avg, count: cell.count, rockCount: rockCount });
        }
      });
    });

    pairs.sort(function (a, b) { return a.avg - b.avg; });
    var worst = pairs.slice(0, 3).filter(function (p) { return p.avg < 0; });

    if (worst.length === 0) {
      el.innerHTML = '<div class="tb-empty"><span class="tb-empty-icon">✅</span>No pain points detected yet. Keep logging!</div>';
      return;
    }

    var html = '';
    worst.forEach(function (p) {
      var rockInfo = p.rockCount > 0 ? ' · <strong style="color:var(--danger)">' + p.rockCount + ' 💀 rock-bottom' + (p.rockCount !== 1 ? 's' : '') + '</strong>' : '';
      html += '<div class="tb-insight-item">🔴 <strong>' + escHTML(p.tool.name) + '</strong> on <strong>' +
              escHTML(p.crit.full) + '</strong>: avg ' + fmtScore(p.avg) + ' (' + p.count + ' events)' + rockInfo + '</div>';
    });
    el.innerHTML = html;
  }

  function renderHighlights(heatmap) {
    var el = document.getElementById('highlights');
    if (!el) return;

    var pairs = [];
    tools.forEach(function (t) {
      CRITERIA.forEach(function (c) {
        var cell = heatmap[t.id][c.id];
        if (cell.count > 0) {
          var brilliantCount = events.filter(function (ev) {
            return ev.tool === t.id && ev.criterion === c.id && ev.sentiment === 'brilliant';
          }).length;
          pairs.push({ tool: t, crit: c, avg: cell.avg, count: cell.count, brilliantCount: brilliantCount });
        }
      });
    });

    pairs.sort(function (a, b) { return b.avg - a.avg; });
    var best = pairs.slice(0, 3).filter(function (p) { return p.avg > 0; });

    if (best.length === 0) {
      el.innerHTML = '<div class="tb-empty"><span class="tb-empty-icon">⭐</span>No highlights yet. Log some positive moments!</div>';
      return;
    }

    var html = '';
    best.forEach(function (p) {
      var brilliantInfo = p.brilliantCount > 0 ? ' · <strong style="color:var(--success)">' + p.brilliantCount + ' 🚀 brilliant</strong>' : '';
      html += '<div class="tb-insight-item">🌟 <strong>' + escHTML(p.tool.name) + '</strong> on <strong>' +
              escHTML(p.crit.full) + '</strong>: avg ' + fmtScore(p.avg) + ' (' + p.count + ' events)' + brilliantInfo + '</div>';
    });
    el.innerHTML = html;
  }

  function renderDecisionPattern(decisionStats) {
    var el = document.getElementById('decision-pattern');
    if (!el) return;

    var hasData = tools.some(function (t) { return decisionStats[t.id].total > 0; });
    if (!hasData) {
      el.innerHTML = '<div class="tb-empty"><span class="tb-empty-icon">✅</span>No decision data yet. Use the Capture tab and log what you did with the AI output.</div>';
      return;
    }

    var COLORS = { accept: '#2ea44f', tweak: '#d4a03c', rewrite: '#d47a3c', reject: '#e05959' };
    var html = '';
    tools.forEach(function (t) {
      var ds = decisionStats[t.id];
      if (ds.total === 0) return;
      html += '<div class="tb-tool-block"><div class="tb-tool-block-header">' +
              '<span class="tb-tool-block-name">' + escHTML(t.name) + '</span>' +
              '<span class="tb-tool-block-count">' + ds.total + ' decided</span></div>';
      html += '<div class="tb-decision-bar">';
      DECISIONS.forEach(function (d) {
        var pct = Math.round((ds[d.id] / ds.total) * 100);
        if (pct > 0) {
          html += '<div class="tb-decision-bar__seg" style="width:' + pct + '%;background:' + COLORS[d.id] + ';" title="' + escHTML(d.label) + ': ' + pct + '%">' +
                  (pct >= 12 ? d.emoji + ' ' + pct + '%' : '') + '</div>';
        }
      });
      html += '</div>';
      html += '<div class="tb-sentiment-breakdown">' +
              DECISIONS.map(function (d) { return '<span class="tb-bd-item">' + d.emoji + '×' + ds[d.id] + '</span>'; }).join('') +
              '</div></div>';
    });
    el.innerHTML = html;
  }

  function renderTrustScore(trustMap) {
    var el = document.getElementById('trust-score');
    if (!el) return;

    var hasTrust = false;
    tools.forEach(function (t) {
      CRITERIA.forEach(function (c) { if (trustMap[t.id][c.id].total >= 3) hasTrust = true; });
    });

    if (!hasTrust) {
      el.innerHTML = '<div class="tb-empty"><span class="tb-empty-icon">🔒</span>Need ≥3 decided events per (tool, area) pair. Keep logging!</div>';
      return;
    }

    var html = '<div class="tb-heatmap-wrap"><table class="tb-heatmap-table"><thead><tr><th class="tb-heatmap-crit-col">Area</th>';
    tools.forEach(function (t) { html += '<th>' + escHTML(t.name) + '</th>'; });
    html += '</tr></thead><tbody>';
    CRITERIA.forEach(function (c) {
      html += '<tr><td class="tb-heatmap-crit-col">' + escHTML(c.full) + '</td>';
      tools.forEach(function (t) {
        var cell = trustMap[t.id][c.id];
        if (cell.total < 3) {
          html += '<td class="tb-heatmap-cell tb-heatmap-empty">—</td>';
        } else {
          var pct = Math.round((cell.trusted / cell.total) * 100);
          var bg = pct >= 70 ? '#164030' : pct >= 50 ? null : '#5c2e2e';
          var style = bg ? 'background:' + bg + ';' : '';
          html += '<td class="tb-heatmap-cell" style="' + style + '">' +
                  '<span class="tb-heatmap-score">' + pct + '%</span>' +
                  '<span class="tb-heatmap-count">' + cell.total + ' ev.</span></td>';
        }
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    el.innerHTML = html;
  }

  function renderSkillGapAnalysis(reasonStats) {
    var el = document.getElementById('skill-gap');
    if (!el) return;

    var sorted = SKILL_REASONS.map(function (r) { return { reason: r, count: reasonStats[r.id] }; })
                              .filter(function (r) { return r.count > 0; })
                              .sort(function (a, b) { return b.count - a.count; });

    if (sorted.length === 0) {
      el.innerHTML = '<div class="tb-empty"><span class="tb-empty-icon">🧠</span>No skill-based rejections logged yet. When you reject or rewrite AI output, tag the human skill that was needed.</div>';
      return;
    }

    var maxCount = sorted[0].count;
    var totalReasons = sorted.reduce(function (s, r) { return s + r.count; }, 0);
    var html = '';
    sorted.forEach(function (r) {
      var pct = Math.round((r.count / totalReasons) * 100);
      var barW = Math.round((r.count / maxCount) * 100);
      html += '<div class="tb-insight-item">' +
              '<div class="tb-skill-bar-label"><strong>' + escHTML(r.reason.name) + '</strong> — ' + pct + '% of rejections (' + r.count + ')</div>' +
              '<div class="tb-bar-wrap"><div class="tb-bar-track"><div class="tb-bar-fill" style="width:' + barW + '%;background:var(--accent);"></div></div></div>' +
              '</div>';
    });
    el.innerHTML = html;
  }

  function renderInsights() {
    var stats = computeStats();
    renderSmartSummary(stats.toolStats, stats.heatmap, stats.decisionStats, stats.reasonStats);
    renderStatCards(stats.toolStats);
    renderToolComparison(stats.toolStats);
    renderHeatmap(stats.heatmap);
    renderPainPoints(stats.heatmap);
    renderHighlights(stats.heatmap);
    renderDecisionPattern(stats.decisionStats);
    renderTrustScore(stats.trustMap);
    renderSkillGapAnalysis(stats.reasonStats);
    renderTimeSeries(tsBucket);
  }

  /* ── Time-Series Trend View ── */
  var tsBucket = 'week';

  function getISOWeek(d) {
    var date = new Date(d.getTime());
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
    var week1 = new Date(date.getFullYear(), 0, 4);
    return Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7) + 1;
  }

  function getBucketKey(ts, bucket) {
    var d = new Date(ts);
    if (bucket === 'month') return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    return d.getFullYear() + '-W' + String(getISOWeek(d)).padStart(2, '0');
  }

  // Stable color palette per tool index
  var TOOL_COLORS = ['#d4a03c', '#5cb85c', '#5bc0de', '#d9534f', '#9b59b6', '#e67e22'];

  function renderTimeSeries(bucket) {
    var el = document.getElementById('timeseries-chart');
    if (!el) return;

    // Filter events with timestamps
    var timed = events.filter(function (ev) { return ev.ts && ev.tool; });
    if (timed.length < 2) {
      el.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;padding:12px 0">Need more data for trends. Log at least 2 events to see a chart.</div>';
      return;
    }

    // Build buckets: { bucketKey: { toolId: { sum, count } } }
    var buckets = {};
    timed.forEach(function (ev) {
      var key = getBucketKey(ev.ts, bucket);
      if (!buckets[key]) buckets[key] = {};
      if (!buckets[key][ev.tool]) buckets[key][ev.tool] = { sum: 0, count: 0 };
      var score = sentimentScore(ev.sentiment);
      buckets[key][ev.tool].sum += score;
      buckets[key][ev.tool].count++;
    });

    var keys = Object.keys(buckets).sort();
    var toolIds = tools.map(function (t) { return t.id; });

    // Chart dimensions
    var pad = { top: 20, right: 16, bottom: 40, left: 36 };
    var colW = 52;
    var chartW = Math.max(280, keys.length * colW);
    var chartH = 140;
    var totalW = pad.left + chartW + pad.right;
    var totalH = pad.top + chartH + pad.bottom;

    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + totalW + '" height="' + totalH + '" style="display:block;max-width:100%;font-family:var(--font-mono);font-size:10px">';

    // Y-axis: -2 to +2
    var yMin = -2, yMax = 2, yRange = yMax - yMin;
    function yPos(score) { return pad.top + chartH - ((score - yMin) / yRange) * chartH; }
    function xPos(i) { return pad.left + (i + 0.5) * (chartW / keys.length); }

    // Grid lines and labels
    for (var g = yMin; g <= yMax; g++) {
      var gy = yPos(g);
      var opacity = g === 0 ? '0.3' : '0.08';
      var sw = g === 0 ? '1.5' : '1';
      svg += '<line x1="' + pad.left + '" y1="' + gy + '" x2="' + (pad.left + chartW) + '" y2="' + gy + '" stroke="currentColor" stroke-opacity="' + opacity + '" stroke-width="' + sw + '"/>';
      svg += '<text x="' + (pad.left - 4) + '" y="' + (gy + 3) + '" text-anchor="end" fill="currentColor" opacity="0.5">' + (g > 0 ? '+' : '') + g + '</text>';
    }

    // X-axis labels
    keys.forEach(function (k, i) {
      var label = bucket === 'month' ? k : k.replace(/^\d{4}-/, '');
      svg += '<text x="' + xPos(i) + '" y="' + (pad.top + chartH + 16) + '" text-anchor="middle" fill="currentColor" opacity="0.5">' + label + '</text>';
    });

    // Per-tool polylines
    toolIds.forEach(function (toolId, ti) {
      var color = TOOL_COLORS[ti % TOOL_COLORS.length];
      var points = [];
      keys.forEach(function (k, i) {
        if (buckets[k][toolId] && buckets[k][toolId].count > 0) {
          var avg = buckets[k][toolId].sum / buckets[k][toolId].count;
          points.push({ x: xPos(i), y: yPos(avg), valid: true });
        } else {
          points.push({ x: xPos(i), y: 0, valid: false });
        }
      });

      // Draw polyline with gaps for missing data
      var d = '';
      for (var p = 0; p < points.length; p++) {
        if (!points[p].valid) continue;
        if (d === '' || (p > 0 && !points[p - 1].valid)) {
          d += 'M' + points[p].x.toFixed(1) + ',' + points[p].y.toFixed(1);
        } else {
          d += 'L' + points[p].x.toFixed(1) + ',' + points[p].y.toFixed(1);
        }
      }
      if (d) {
        svg += '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
      }
      // Dots at data points
      points.forEach(function (pt) {
        if (pt.valid) svg += '<circle cx="' + pt.x.toFixed(1) + '" cy="' + pt.y.toFixed(1) + '" r="3" fill="' + color + '"/>';
      });
    });

    svg += '</svg>';

    // Legend
    var legend = '<div style="display:flex;gap:12px;margin-top:6px;font-size:0.78rem">';
    tools.forEach(function (t, ti) {
      var color = TOOL_COLORS[ti % TOOL_COLORS.length];
      legend += '<span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + color + '"></span>' + t.name + '</span>';
    });
    legend += '</div>';

    el.innerHTML = svg + legend;
  }

  /* ══════════════════════════════════════════════════════════════
     §8  EXPORT TAB
     ══════════════════════════════════════════════════════════════ */

  function generateMarkdown() {
    var lines = [];
    var now   = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    lines.push('# AI Tool Evaluation Report');
    lines.push('');
    lines.push('**Generated by Tula-Bench v2** · ' + now);
    lines.push('');

    if (events.length === 0) {
      lines.push('*No events logged yet.*');
      return lines.join('\n');
    }

    var stats = computeStats();

    // Smart Summary
    lines.push('## Summary');
    lines.push('');
    var totalEvents = events.length;
    var positive    = events.filter(function (ev) { return sentimentScore(ev.sentiment) > 0; }).length;
    var rockTotal   = events.filter(function (ev) { return ev.sentiment === 'rock-bottom'; }).length;
    lines.push('- **Total events:** ' + totalEvents);
    lines.push('- **Positive rate:** ' + (totalEvents > 0 ? Math.round((positive / totalEvents) * 100) + '%' : '—'));
    lines.push('- **Rock bottoms:** ' + rockTotal + (rockTotal > 0 ? ' ⚠️' : ''));
    lines.push('');

    // Tool Comparison
    lines.push('## Tool Comparison');
    lines.push('');
    lines.push('| Tool | Events | Win Rate | Avg Score | Breakdown |');
    lines.push('| :--- | :---: | :---: | :---: | :--- |');
    tools.forEach(function (t) {
      var ts = stats.toolStats[t.id];
      var bd = SENTIMENTS.map(function (s) { return s.emoji + '×' + (ts.breakdown[s.id] || 0); }).join(' ');
      lines.push('| ' + t.name + ' | ' + ts.total + ' | ' +
        (ts.winRate !== null ? ts.winRate + '%' : '—') + ' | ' +
        (ts.avgScore !== null ? fmtScore(ts.avgScore) : '—') + ' | ' + bd + ' |');
    });
    lines.push('');

    // Criterion Heatmap
    lines.push('## Criterion Heatmap (Avg Sentiment Score)');
    lines.push('');
    var hdr = '| Criterion |' + tools.map(function (t) { return ' ' + t.name + ' |'; }).join('');
    var div = '| :--- |' + tools.map(function () { return ' :---: |'; }).join('');
    lines.push(hdr);
    lines.push(div);
    CRITERIA.forEach(function (c) {
      var row = '| ' + c.full + ' |';
      tools.forEach(function (t) {
        var cell = stats.heatmap[t.id][c.id];
        row += cell.count > 0 ? ' ' + fmtScore(cell.avg) + ' (' + cell.count + 'ev) |' : ' — |';
      });
      lines.push(row);
    });
    lines.push('');

    // Pain points
    var pairs = [];
    tools.forEach(function (t) {
      CRITERIA.forEach(function (c) {
        var cell = stats.heatmap[t.id][c.id];
        if (cell.count > 0 && cell.avg < 0) {
          var rb = events.filter(function (ev) { return ev.tool === t.id && ev.criterion === c.id && ev.sentiment === 'rock-bottom'; }).length;
          pairs.push({ tool: t, crit: c, avg: cell.avg, count: cell.count, rb: rb });
        }
      });
    });
    pairs.sort(function (a, b) { return a.avg - b.avg; });
    if (pairs.length > 0) {
      lines.push('## Pain Points');
      lines.push('');
      pairs.slice(0, 5).forEach(function (p) {
        lines.push('- 🔴 **' + p.tool.name + '** on **' + p.crit.full + '**: avg ' + fmtScore(p.avg) +
          ' (' + p.count + ' events' + (p.rb > 0 ? ', ' + p.rb + ' 💀' : '') + ')');
      });
      lines.push('');
    }

    // Decision patterns
    var hasDecisions = events.some(function (ev) { return !!ev.decision; });
    if (hasDecisions) {
      lines.push('## Decision Patterns');
      lines.push('');
      lines.push('| Tool | Accepted | Tweaked | Rewrote | Rejected | Total |');
      lines.push('| :--- | :---: | :---: | :---: | :---: | :---: |');
      tools.forEach(function (t) {
        var ds = stats.decisionStats[t.id];
        if (ds.total === 0) return;
        lines.push('| ' + t.name + ' | ' + ds.accept + ' | ' + ds.tweak + ' | ' + ds.rewrite + ' | ' + ds.reject + ' | ' + ds.total + ' |');
      });
      lines.push('');
    }

    // Skill gap
    var reasonList = SKILL_REASONS.map(function (r) { return { reason: r, count: stats.reasonStats[r.id] }; })
                                  .filter(function (r) { return r.count > 0; })
                                  .sort(function (a, b) { return b.count - a.count; });
    if (reasonList.length > 0) {
      var totalReasons = reasonList.reduce(function (s, r) { return s + r.count; }, 0);
      lines.push('## Skill Gap Analysis');
      lines.push('');
      lines.push('Why you rejected/rewrote AI output:');
      lines.push('');
      reasonList.forEach(function (r) {
        lines.push('- **' + r.reason.name + '**: ' + r.count + ' (' + Math.round((r.count / totalReasons) * 100) + '%)');
      });
      lines.push('');
    }

    // Full event log
    lines.push('## Full Event Log');
    lines.push('');
    lines.push('| Time | Tool | Signal | Area | Decision | Reason | Note |');
    lines.push('| :--- | :--- | :---: | :--- | :--- | :--- | :--- |');
    events.forEach(function (ev) {
      var s    = sentimentById(ev.sentiment);
      var tool = toolById(ev.tool);
      var crit = ev.criterion ? criterionById(ev.criterion) : null;
      var dec  = ev.decision ? decisionById(ev.decision) : null;
      var rsn  = ev.reason ? reasonById(ev.reason) : null;
      var time = new Date(ev.ts).toLocaleString();
      lines.push('| ' + time + ' | ' + (tool ? tool.name : ev.tool) + ' | ' +
        (s ? s.emoji + ' ' + s.label : ev.sentiment) + ' | ' +
        (crit ? crit.name : '—') + ' | ' +
        (dec ? dec.emoji + ' ' + dec.label : '—') + ' | ' +
        (rsn ? rsn.short : '—') + ' | ' + (ev.note || '—') + ' |');
    });
    lines.push('');
    lines.push('---');
    lines.push('*Tula-Bench v2 · Ankura-Array*');

    return lines.join('\n');
  }

  var _currentMarkdown = '';

  function renderExport() {
    _currentMarkdown = generateMarkdown();
    var el = document.getElementById('export-preview');
    if (el) el.innerHTML = mdToHtml(_currentMarkdown);
  }

  function bindExportTab() {
    var regenBtn = document.getElementById('btn-regen');
    if (regenBtn) regenBtn.addEventListener('click', renderExport);

    var copyBtn = document.getElementById('btn-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        function showCopied() {
          copyBtn.textContent = '✓ Copied!';
          setTimeout(function () { copyBtn.textContent = '📋 Copy'; }, 2000);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(_currentMarkdown).then(showCopied).catch(function () { fallbackCopy(_currentMarkdown, showCopied); });
        } else {
          fallbackCopy(_currentMarkdown, showCopied);
        }
      });
    }
  }

  function fallbackCopy(text, onDone) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    if (onDone) onDone();
  }

  /* ══════════════════════════════════════════════════════════════
     §9  TAB ROUTING
     ══════════════════════════════════════════════════════════════ */

  var TABS = ['capture', 'log', 'insights', 'export'];

  function switchTab(name) {
    document.querySelectorAll('.tb-tab').forEach(function (btn) {
      var active = btn.dataset.tab === name;
      btn.classList.toggle('tb-tab--active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    TABS.forEach(function (t) {
      var pane = document.getElementById('pane-' + t);
      if (pane) pane.hidden = (t !== name);
    });
    if (name === 'log')      { buildFilterBar(); renderLog(); }
    if (name === 'insights') renderInsights();
    if (name === 'export')   renderExport();
  }

  /* ══════════════════════════════════════════════════════════════
     §10  RESET
     ══════════════════════════════════════════════════════════════ */

  function resetAll() {
    events = [];
    State.save('tb_events', events);
    // Keep tools and last_tool (not data)
    captureSentiment = null;
    captureCriterion = null;
    captureDecision  = null;
    captureReason    = null;
    renderCaptureTab();
    switchTab('capture');
  }

  /* ══════════════════════════════════════════════════════════════
     §11  INIT
     ══════════════════════════════════════════════════════════════ */

  function init() {
    // Wire tab nav
    document.querySelectorAll('.tb-tab').forEach(function (btn) {
      btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
    });

    // Initial render
    renderCaptureTab();
    bindCaptureTab();
    bindExportTab();

    // Time-series bucket toggles
    document.querySelectorAll('.tb-ts-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        tsBucket = btn.dataset.bucket || 'week';
        document.querySelectorAll('.tb-ts-btn').forEach(function (b) { b.classList.remove('tb-ts-btn--active'); });
        btn.classList.add('tb-ts-btn--active');
        renderTimeSeries(tsBucket);
      });
    });

    // Show capture tab (hero)
    switchTab('capture');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
