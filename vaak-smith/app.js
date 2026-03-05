/**
 * Vaak-Smith — Application Logic
 * ────────────────────────────────────────
 * Implements:
 *   • Protocol B  — Instance Identity (state isolation per tab)
 *   • Draft Engine — Debounced auto-save to namespaced localStorage
 *   • Framework    — Template injection with system/user split
 *   • Preview      — Live assembled prompt output
 *   • Copy         — Plain text & structured Markdown to clipboard
 */
(function () {
  "use strict";

  /* ═══════════════════════════════════════════════════
     §1  PROTOCOL B — Instance Identity
     ═══════════════════════════════════════════════════ */

  var INSTANCE_ID = initInstanceId();

  /**
   * Resolve the instance ID from URL → sessionStorage → generate new.
   * Self-heals the URL if opened directly without ?instanceId.
   */
  function initInstanceId() {
    var params = new URLSearchParams(window.location.search);
    var id = params.get("instanceId");

    if (id) {
      // Launched from dashboard — persist to sessionStorage (tab-isolated)
      sessionStorage.setItem("ankura_instanceId", id);
      try {
        var now = new Date().toISOString();
        var ex = localStorage.getItem(id + "__meta_created");
        if (!ex) localStorage.setItem(id + "__meta_created", JSON.stringify(now));
        localStorage.setItem(id + "__meta_updated", JSON.stringify(now));
      } catch (e) {}
      return id;
    }

    // Check sessionStorage (e.g. page refresh within the same tab)
    id = sessionStorage.getItem("ankura_instanceId");
    if (id) {
      try {
        var now2 = new Date().toISOString();
        var ex2 = localStorage.getItem(id + "__meta_created");
        if (!ex2) localStorage.setItem(id + "__meta_created", JSON.stringify(now2));
        localStorage.setItem(id + "__meta_updated", JSON.stringify(now2));
      } catch (e) {}
      return id;
    }

    // Self-heal: generate a new UUID and update URL without navigation
    id =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : fallbackUUID();
    sessionStorage.setItem("ankura_instanceId", id);
    // record creation timestamp for this instance (ISO 8601)
    try {
      localStorage.setItem(id + "__meta_created", new Date().toISOString());
      localStorage.setItem(id + "__meta_updated", new Date().toISOString());
    } catch (e) {}
    var newUrl =
      window.location.pathname + "?instanceId=" + id + window.location.hash;
    window.history.replaceState(null, "", newUrl);
    return id;
  }

  /**
   * Fallback UUID v4 for insecure contexts (file://) or older browsers.
   */
  function fallbackUUID() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        var r = (Math.random() * 16) | 0;
        var v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }
    );
  }

  /* ═══════════════════════════════════════════════════
     §2  STATE MANAGER — Namespaced LocalStorage
     ═══════════════════════════════════════════════════ */

  var State = {
    _key: function (name) {
      return INSTANCE_ID + "__" + name;
    },

    save: function (name, value) {
      try {
        localStorage.setItem(this._key(name), value);
        try {
          // update instance-level modified timestamp
          localStorage.setItem(this._key('meta_updated'), new Date().toISOString());
          try { window.dispatchEvent(new CustomEvent('ankura:meta-updated', { detail: { instance: INSTANCE_ID } })); } catch (e) {}
        } catch (e) {}
      } catch (e) {
        // localStorage full or unavailable — fail silently
        console.warn("[AnkuraState] save failed:", name, e);
      }
    },

    load: function (name) {
      try {
        return localStorage.getItem(this._key(name));
      } catch (e) {
        return null;
      }
    },

    clearAll: function () {
      var prefix = INSTANCE_ID + "__";
      var keysToRemove = [];
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.indexOf(prefix) === 0) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(function (k) {
        localStorage.removeItem(k);
      });
    },
  };

  /* ═══════════════════════════════════════════════════
     §3  UTILITIES
     ═══════════════════════════════════════════════════ */

  /**
   * Debounce: delays invocation until `delay` ms after the last call.
   */
  function debounce(fn, delay) {
    var timer = null;
    return function () {
      var ctx = this;
      var args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(ctx, args);
      }, delay);
    };
  }

  /* ═══════════════════════════════════════════════════
     §4  DOM REFERENCES
     ═══════════════════════════════════════════════════ */

  var $provider = document.getElementById("select-provider");
  var $framework = document.getElementById("select-framework");
  var $modelBadge = document.getElementById("model-badge");
  var $system = document.getElementById("system-instructions");
  var $sliderTemp = document.getElementById("slider-temp");
  var $sliderTopP = document.getElementById("slider-topp");
  var $valTemp = document.getElementById("val-temp");
  var $valTopP = document.getElementById("val-topp");
  // Safe fallbacks when provider/tuning UI removed from DOM
  if (!$provider) {
    $provider = { value: "", addEventListener: function () {}, selectedIndex: 0 };
  }
  if (!$modelBadge) {
    $modelBadge = { textContent: "", style: { display: "none" } };
  }
  var $preview = document.getElementById("output-preview");
  var $btnCopyPlain = document.getElementById("btn-copy-plain");
  var $btnCopyMd = document.getElementById("btn-copy-markdown");
  var $btnReset = document.getElementById("btn-reset");
  var $btnBack = document.getElementById("btn-back");
  var $btnDelete = document.getElementById("btn-delete");
  var $metaCreated = document.getElementById("meta-created");
  var $metaUpdated = document.getElementById("meta-updated");
  var CONFIGS = window.LLM_CONFIGS || { PROVIDERS: {}, FRAMEWORKS: {} };
  var NO_FRAMEWORK_KEY = "__NO_FRAMEWORK__";

  /* ═══════════════════════════════════════════════════
     §4b  PRE-FLIGHT — Task Types, Tips & Importance
     ═══════════════════════════════════════════════════ */

  var TASK_TYPES = [
    { id: 'codegen',  emoji: '💻', label: 'Code Gen' },
    { id: 'analysis', emoji: '📊', label: 'Analysis' },
    { id: 'writing',  emoji: '✍️', label: 'Writing' },
    { id: 'debug',    emoji: '🐛', label: 'Debugging' },
    { id: 'review',   emoji: '🔍', label: 'Code Review' },
    { id: 'planning', emoji: '📋', label: 'Planning' }
  ];

  /** Per-section micro-tips keyed by normalised label */
  var SECTION_TIPS = {
    'context':               'Specify what the AI should NOT assume about your environment.',
    'persona':               'The more specific the persona, the more consistent the output.',
    'role':                  'The more specific the persona, the more consistent the output.',
    'task':                  'Include success criteria — what does "done" look like?',
    'goal':                  'Include success criteria — what does "done" look like?',
    'what i\'m trying to figure out': 'Include success criteria — what does "done" look like?',
    'format':                'Show an example of the exact output format you want.',
    'output':                'Describe the file format, structure, or visual layout you need.',
    'what a good answer looks like': 'Describe the file format, structure, or visual layout you need.',
    'source':                'Paste real code/data. AI performs better with concrete input.',
    'what i already know':   'Paste real code/data. AI performs better with concrete input.',
    'expectations':          'List what you do NOT want as explicitly as what you do.',
    'action checklist':      'Number your steps. AI follows numbered lists more reliably.',
    'why this matters':      'Explain the stakes — urgency and impact shape better answers.',
    'where i\'m getting stuck': 'Pinpoint the exact blocker — vague struggles get vague answers.'
  };

  /** Which section labels are important per task type (normalised lowercase) */
  var IMPORTANCE_MAP = {
    'codegen':  ['context', 'task', 'goal', 'source', 'what i already know', 'expectations', 'output', 'what a good answer looks like', 'action checklist'],
    'analysis': ['context', 'source', 'what i already know', 'format', 'output', 'what a good answer looks like', 'expectations'],
    'writing':  ['persona', 'role', 'format', 'output', 'what a good answer looks like', 'expectations', 'context', 'why this matters'],
    'debug':    ['context', 'source', 'what i already know', 'where i\'m getting stuck', 'task', 'goal', 'what i\'m trying to figure out'],
    'review':   ['context', 'source', 'what i already know', 'expectations', 'action checklist', 'where i\'m getting stuck'],
    'planning': ['context', 'task', 'goal', 'what i\'m trying to figure out', 'why this matters', 'action checklist', 'output', 'what a good answer looks like']
  };

  var selectedTaskType = null;

  /* ═══════════════════════════════════════════════════
     §5  INITIALIZATION / HYDRATION
     ═══════════════════════════════════════════════════ */

  function init() {
    populateFrameworks();
    hydrateState();
    // Pre-flight task type selector
    var savedTT = State.load('vs_task_type');
    if (savedTT) selectedTaskType = savedTT;
    renderTaskTypeRow();
    // Render framework-specific fields (including the no-framework sandbox)
    renderFrameworkFields($framework.value);
    // tuning/provider UI removed — slider/model sync omitted
    initTheme();
    renderPreview();
    bindEvents();
    // render meta timestamps
    try { renderMeta(); } catch (e) {}
  }

  // Theme handling: instance-scoped via State (INSTANCE_ID prefix)
  function applyThemeValue(val) {
    var mode = val || 'auto';
    var useDark = false;
    if (mode === 'auto') {
      try {
        useDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      } catch (e) { useDark = false; }
    } else if (mode === 'dark') {
      useDark = true;
    } else {
      useDark = false;
    }
    document.body.classList.toggle('dark-theme', useDark);
    document.body.classList.toggle('light-theme', !useDark);
  }

  function initTheme() {
    var sel = document.getElementById('theme-select');
    if (!sel) return;
    // load from instance-scoped State
    var saved = State.load('theme');
    var cur = (saved !== null) ? saved : 'auto';
    try { sel.value = cur; } catch (e) {}
    applyThemeValue(cur);
    sel.addEventListener('change', function () {
      var v = sel.value || 'auto';
      State.save('theme', v);
      applyThemeValue(v);
    });
  }

  // Timestamp helpers & rendering
  function parseTimestamp(raw) {
    if (!raw) return null;
    try { return new Date(JSON.parse(raw)); } catch (e) {}
    try { return new Date(raw); } catch (e) { return null; }
  }

  function renderMeta() {
    if (!$metaCreated && !$metaUpdated) return;
    var createdRaw = null;
    var updatedRaw = null;
    try { createdRaw = localStorage.getItem(INSTANCE_ID + "__meta_created"); } catch (e) {}
    try { updatedRaw = localStorage.getItem(INSTANCE_ID + "__meta_updated"); } catch (e) {}
    var c = parseTimestamp(createdRaw);
    var u = parseTimestamp(updatedRaw);
    var isoC = null, isoU = null;
    try { isoC = JSON.parse(createdRaw); } catch (e) { isoC = createdRaw; }
    try { isoU = JSON.parse(updatedRaw); } catch (e) { isoU = updatedRaw; }
    if ($metaCreated) {
      $metaCreated.textContent = "Created: " + (c ? c.toLocaleString() : "—");
      $metaCreated.title = isoC ? isoC : (c ? c.toISOString() : "");
    }
    if ($metaUpdated) {
      $metaUpdated.textContent = "Updated: " + (u ? u.toLocaleString() : "—");
      $metaUpdated.title = isoU ? isoU : (u ? u.toISOString() : "");
    }
  }

  window.addEventListener('ankura:meta-updated', function () { try { renderMeta(); } catch (e) {} });

  /**
   * Fill the provider <select> from LLM_CONFIGS.PROVIDERS.
   */
  function populateProviders() {
    var keys = Object.keys(CONFIGS.PROVIDERS);
    keys.forEach(function (key) {
      var opt = document.createElement("option");
      opt.value = key;
      opt.textContent =
        CONFIGS.PROVIDERS[key].name + " — " + CONFIGS.PROVIDERS[key].model;
      $provider.appendChild(opt);
    });
  }

  // Provider list is intentionally no-op when provider UI is absent.

  /**
   * Fill the framework <select> with a "None" option + all frameworks.
   */
  function populateFrameworks() {
    var none = document.createElement("option");
    none.value = "";
    none.textContent = "— No Framework —";
    $framework.appendChild(none);

    var keys = Object.keys(CONFIGS.FRAMEWORKS);
    keys.forEach(function (key) {
      var opt = document.createElement("option");
      opt.value = key;
      var fw = CONFIGS.FRAMEWORKS[key];
      opt.textContent = fw.name + " (" + fw.description + ")";
      $framework.appendChild(opt);
    });
  }

  /**
   * Restore all saved field values from namespaced localStorage.
   */
  function hydrateState() {
    var savedFramework = State.load("framework");
    if (savedFramework !== null) {
      $framework.value = savedFramework;
    }

    // System instructions are intentionally left empty by default.
    $system.value = "";

    // If sliders/vals are not present (tuning removed), provide safe defaults
    if (!$sliderTemp) $sliderTemp = { value: "1", addEventListener: function () {} };
    if (!$sliderTopP) $sliderTopP = { value: "1", addEventListener: function () {} };
    if (!$valTemp) $valTemp = { textContent: "1.00" };
    if (!$valTopP) $valTopP = { textContent: "1.00" };
  }

  /* ── Per-framework sections storage (JSON) & helpers ── */
  function frameworkSectionsKey(frameworkKey) {
    return "VAAK_GLOBAL__FRAMEWORK_SECTIONS_" + (frameworkKey || "");
  }
  // Global key for system-targeted sections (shared across tabs)
  function frameworkSystemKey(frameworkKey) {
    return "VAAK_GLOBAL__FRAMEWORK_SECTIONS_" + (frameworkKey || "");
  }

  // Instance-scoped key for user-targeted sections (namespaced by instance)
  function frameworkInstanceKey(frameworkKey) {
    return "FRAMEWORK_INSTANCE__SECTIONS_" + (frameworkKey || "");
  }

  function loadFrameworkSystemSections(frameworkKey) {
    try {
      var raw = localStorage.getItem(frameworkSystemKey(frameworkKey));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function saveFrameworkSystemSections(frameworkKey, obj) {
    try {
      localStorage.setItem(frameworkSystemKey(frameworkKey), JSON.stringify(obj));
    } catch (e) {
      console.warn("[VaakFramework] save system sections failed", e);
    }
  }

  function loadFrameworkInstanceSections(frameworkKey) {
    try {
      var raw = State.load(frameworkInstanceKey(frameworkKey));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function saveFrameworkInstanceSections(frameworkKey, obj) {
    try {
      State.save(frameworkInstanceKey(frameworkKey), JSON.stringify(obj));
    } catch (e) {
      console.warn("[VaakFramework] save instance sections failed", e);
    }
  }

  function globalSystemKey(frameworkKey) {
    return "VAAK_GLOBAL__SYSTEM_PROMPT_" + (frameworkKey || "");
  }

  function loadGlobalSystem(frameworkKey) {
    try {
      var raw = localStorage.getItem(globalSystemKey(frameworkKey));
      if (!raw || raw === "") return null;
      return raw;
    } catch (e) {
      return null;
    }
  }

  function combineSectionsToText(obj, target) {
    var parts = [];
    if (!obj) return "";
    var fw = CONFIGS.FRAMEWORKS[$framework.value];
    var sectionsList = (fw && fw.sections && fw.sections.length) ? fw.sections : deriveSectionsFromTemplates(fw || {});
    sectionsList.forEach(function (s) {
      if (s.target === target) {
        var v = (obj[s.label] || "").trim();
        if (v) parts.push(v);
      }
    });
    return parts.join("\n\n");
  }

  function getUserText() {
    var fwKey = $framework ? $framework.value : "";
    var sections = loadFrameworkInstanceSections(fwKey);
    if (sections) return combineSectionsToText(sections, 'user');
    var inst = State.load('userPrompt');
    return inst || "";
  }

  function deriveSectionsFromTemplates(fw) {
    var seen = {};
    var out = [];
    function pushLabel(label, target) {
      label = (label || "").trim();
      if (!label) return;
      if (seen[label]) return;
      seen[label] = true;
      out.push({ label: label, placeholder: "", target: target });
    }

    var sys = fw.systemTemplate || "";
    var usr = fw.userTemplate || "";
    var tpl = fw.template || "";

    // match {{Token}} occurrences
    var re = /\{\{\s*([^}]+?)\s*\}\}/g;
    var m;
    while ((m = re.exec(sys))) {
      pushLabel(m[1], "system");
    }
    // user template
    while ((m = re.exec(usr))) {
      pushLabel(m[1], "user");
    }

    // Also inspect generic `template` text for bracketed placeholders like [Insert Role]
    var reBr = /\[([^\]]+?)\]/g;
    while ((m = reBr.exec(tpl))) {
      var label = m[1].replace(/Insert\s*/i, "").trim();
      var target = /role|source/i.test(label) ? "system" : "user";
      pushLabel(label, target);
    }

    return out;
  }

  /* ── Pre-flight task type row ── */
  function renderTaskTypeRow() {
    var container = document.getElementById('preflight-row');
    if (!container) return;
    container.innerHTML = '';

    var saved = State.load('vs_task_type');
    if (saved) selectedTaskType = saved;

    TASK_TYPES.forEach(function (tt) {
      var btn = document.createElement('button');
      btn.className = 'vs-task-chip' + (selectedTaskType === tt.id ? ' vs-task-chip--selected' : '');
      btn.textContent = tt.emoji + ' ' + tt.label;
      btn.type = 'button';
      btn.addEventListener('click', function () {
        if (selectedTaskType === tt.id) {
          selectedTaskType = null;
          State.save('vs_task_type', '');
        } else {
          selectedTaskType = tt.id;
          State.save('vs_task_type', tt.id);
        }
        renderTaskTypeRow();
        applyPreflightHighlights();
      });
      container.appendChild(btn);
    });
  }

  /** Normalise section label for lookup */
  function normLabel(label) {
    return (label || '').trim().toLowerCase();
  }

  /** Check if a section is important for the current task type */
  function isSectionImportant(label) {
    if (!selectedTaskType) return false;
    var list = IMPORTANCE_MAP[selectedTaskType] || [];
    var n = normLabel(label);
    for (var i = 0; i < list.length; i++) {
      if (list[i] === n) return true;
    }
    return false;
  }

  /** Get micro-tip for a section label */
  function getSectionTip(label) {
    return SECTION_TIPS[normLabel(label)] || '';
  }

  /** Compute quality level from char count */
  function qualityLevel(charCount) {
    if (charCount === 0) return 'empty';
    if (charCount < 20) return 'thin';
    if (charCount <= 100) return 'good';
    return 'rich';
  }

  /** Apply importance highlights and tip visibility to all rendered sections */
  function applyPreflightHighlights() {
    var container = document.getElementById('framework-fields');
    if (!container) return;
    var wraps = container.querySelectorAll('.editor-section');
    for (var i = 0; i < wraps.length; i++) {
      var wrap = wraps[i];
      var ta = wrap.querySelector('textarea');
      if (!ta) continue;
      var label = ta.dataset.sectionLabel || '';
      var important = isSectionImportant(label);

      wrap.classList.toggle('editor-section--important', important);

      // Show/hide tip
      var tip = wrap.querySelector('.vs-section-tip');
      if (tip) {
        tip.style.display = (important && selectedTaskType) ? '' : 'none';
      }
    }
  }

  /** Update quality dot for a single textarea */
  function updateQualityDot(ta) {
    if (!ta) return;
    var wrap = ta.closest('.editor-section');
    if (!wrap) return;
    var dot = wrap.querySelector('.vs-quality-dot');
    if (!dot) return;
    var level = qualityLevel((ta.value || '').length);
    dot.className = 'vs-quality-dot vs-quality-dot--' + level;
  }

  function renderFrameworkFields(frameworkKey) {
    // ensure container exists
    var container = document.getElementById("framework-fields");
    if (!container) return;
    container.innerHTML = "";

    // If no framework selected, show a generic user prompt editor
    if (!frameworkKey) {
      // Load global system prompt for no-framework, or set a sensible default
      var g = loadGlobalSystem(NO_FRAMEWORK_KEY);
      if (g !== null) {
        $system.value = g;
      } else if (!$system.value.trim()) {
        $system.value = "You are a helpful, concise AI assistant. Follow the user's instructions precisely and provide clear, structured output when appropriate.";
      }

      var wrap = document.createElement('div');
      wrap.className = 'editor-section float-field';

      var ta = document.createElement('textarea');
      ta.className = 'textarea textarea--user float-field__textarea';
      ta.rows = 12;
      ta.placeholder = ' ';
      ta.setAttribute('aria-label', 'User Instructions Sandbox');
      var saved = State.load('userPrompt');
      if (saved) ta.value = saved;

      var deb = debounce(function () {
        State.save('userPrompt', ta.value);
        renderPreview();
      }, 300);

      ta.addEventListener('input', deb);
      // focus the sandbox for quick entry
      setTimeout(function () { try { ta.focus(); } catch (e) {} }, 20);
      wrap.appendChild(ta);

      var floatLabel = document.createElement('label');
      floatLabel.className = 'float-field__label';
      floatLabel.textContent = 'Freeform user instructions — full sandbox. The composed prompt will appear in the preview.';
      wrap.appendChild(floatLabel);

      container.appendChild(wrap);
      return;
    }

    var fw = CONFIGS.FRAMEWORKS[frameworkKey];
    if (!fw) return;

    var sectionsDef = (fw.sections && fw.sections.length) ? fw.sections : deriveSectionsFromTemplates(fw);
    if (!sectionsDef || !sectionsDef.length) return;

    var instanceStored = loadFrameworkInstanceSections(frameworkKey) || {};
    var legacy = loadGlobalSystem(frameworkKey);

    // RESTORE SYSTEM PROMPT: if we have a loaded system prompt for this framework,
    // apply it to the textarea (it was cleared in hydrateState())
    if (legacy && legacy.trim()) {
      $system.value = legacy;
    }

    sectionsDef.forEach(function (section) {
      var wrap = document.createElement('div');
      var important = isSectionImportant(section.label);
      wrap.className = 'editor-section float-field' + (important ? ' editor-section--important' : '');

      var ta = document.createElement('textarea');
      ta.className = 'textarea float-field__textarea';
      ta.rows = section.target === 'system' ? 4 : 3;
      ta.placeholder = ' ';
      ta.dataset.sectionLabel = section.label;
      ta.dataset.sectionTarget = section.target;
      ta.setAttribute('aria-label', section.label + (section.target === 'system' ? ' (system)' : ' (user)'));

      // Load initial value from instance-scoped storage for all section fields.
      if (instanceStored && instanceStored[section.label]) ta.value = instanceStored[section.label];

      var deb = debounce(function () {
        var nodes = container.querySelectorAll('textarea[data-section-label]');
        var obj = {};
        nodes.forEach(function (n) { obj[n.dataset.sectionLabel] = n.value; });
        saveFrameworkInstanceSections(frameworkKey, obj);
        var combinedUser = combineSectionsToText(obj, 'user');
        State.save('userPrompt', combinedUser);
        renderPreview();
      }, 400);

      // Quality dot update on input
      var debQuality = debounce(function () { updateQualityDot(ta); }, 150);
      ta.addEventListener('input', deb);
      ta.addEventListener('input', debQuality);
      wrap.appendChild(ta);

      // Float label with quality dot
      var floatLabel = document.createElement('label');
      floatLabel.className = 'float-field__label';
      floatLabel.textContent = section.placeholder || (section.label + (section.target === 'system' ? ' (system)' : ' (user)'));

      var dot = document.createElement('span');
      dot.className = 'vs-quality-dot vs-quality-dot--' + qualityLevel((ta.value || '').length);
      floatLabel.insertBefore(dot, floatLabel.firstChild);

      wrap.appendChild(floatLabel);

      // Micro-tip
      var tipText = getSectionTip(section.label);
      if (tipText) {
        var tip = document.createElement('div');
        tip.className = 'vs-section-tip';
        tip.textContent = tipText;
        tip.style.display = (important && selectedTaskType) ? '' : 'none';
        wrap.appendChild(tip);
      }

      container.appendChild(wrap);
    });

    // After rendering all fields, initialize composed user text so preview reflects loaded fields
    try {
      var initSections = instanceStored || {};
      var combinedUserInit = combineSectionsToText(initSections, 'user');
      if (typeof combinedUserInit === 'string') {
        State.save('userPrompt', combinedUserInit);
      }
      renderPreview();
    } catch (e) {
      // ignore
    }

    // Trigger input events on all rendered textareas so their debounced handlers
    // run and persist composed user/system text into State and refresh preview.
    try {
      var allTAs = container.querySelectorAll('textarea[data-section-label], textarea.textarea--user');
      allTAs.forEach(function (el) {
        // Fire an input event to simulate user interaction and invoke listeners
        try {
          el.dispatchEvent(new Event('input', { bubbles: true }));
        } catch (e) {
          // fallback for older browsers
          var evt = document.createEvent('Event');
          evt.initEvent('input', true, true);
          el.dispatchEvent(evt);
        }
      });
    } catch (e) {
      // ignore
    }
  }

  /**
   * Update slider min/max/step/default based on selected provider.
   */
  function syncSliderRanges() {
    // Tuning removed: no-op to keep calls safe
  }

  /**
   * Show the current model name in the badge.
   */
  function updateModelBadge() {
    // Provider UI removed — hide badge when present
    if ($modelBadge && $modelBadge.style) $modelBadge.style.display = "none";
  }

  /* ═══════════════════════════════════════════════════
     §6  FRAMEWORK TEMPLATE APPLICATION
     ═══════════════════════════════════════════════════ */

  /**
   * Apply the selected framework's templates into the textareas.
   * System-targeted sections → System Instructions.
   * User-targeted sections   → User Prompt.
   * If the textarea already has content, append with a separator.
   */
  function applyFramework(frameworkKey) {
    if (!frameworkKey) return;

    var fw = CONFIGS.FRAMEWORKS[frameworkKey];
    if (!fw) return;

    // System template
    // NOTE: Do not auto-insert system templates. System instructions stay empty by default.

    // User template: save into instance `userPrompt` (so preview shows it)
    if (fw.userTemplate) {
      var cur = State.load('userPrompt') || "";
      if (!cur.trim()) {
        State.save('userPrompt', fw.userTemplate);
      } else {
        State.save('userPrompt', cur + "\n\n--- (Framework Template) ---\n\n" + fw.userTemplate);
      }
    }

    // Save system (empty by design) into global per-framework storage and ensure preview updates
    try {
      var key = frameworkKey || NO_FRAMEWORK_KEY;
      localStorage.setItem(globalSystemKey(key), $system.value);
    } catch (e) {}
    renderPreview();
  }

  /**
   * Insert template text into a textarea.
   * If empty → replace. If has content → append with separator.
   */
  function insertTemplate(textarea, template) {
    var current = textarea.value.trim();
    if (!current) {
      textarea.value = template;
    } else {
      textarea.value = current + "\n\n--- (Framework Template) ---\n\n" + template;
    }
  }

  /* ═══════════════════════════════════════════════════
     §7  OUTPUT ASSEMBLY & PREVIEW
     ═══════════════════════════════════════════════════ */

  function renderPreview() {
    var text = assemblePreviewText();
    if (!text) {
      $preview.textContent = "Configure your prompt to see a live preview…";
      $preview.classList.add("preview-content--empty");
    } else {
      $preview.textContent = text;
      $preview.classList.remove("preview-content--empty");
    }
    updatePreviewStatus();
  }

  /**
   * Update the status bar with a rough token estimate and provider name.
   */
  function updatePreviewStatus() {
    var sys = $system.value || "";
    var usr = getUserText() || "";
    var words = 0;
    try {
      words = (sys + " " + usr).split(/\s+/).filter(Boolean).length;
    } catch (e) {
      words = 0;
    }
    // Rough token estimate: words * 1.3 (very approximate)
    var tokens = Math.max(0, Math.ceil(words * 1.3));
    var status = "Tokens: ~" + tokens;
    var $status = document.getElementById("preview-status");
    if ($status) {
      $status.textContent = status;
      if (tokens > 1500) $status.classList.add("high-tokens"); else $status.classList.remove("high-tokens");
    }
  }

  /**
   * Build plain-text preview from current field values.
   */
  function assemblePreviewText() {
    var pairs = assembleSectionsPairs();
    if (!pairs || !pairs.length) return "";
    var parts = pairs.map(function (p) { return p.label + "\n" + p.value; });
    return parts.join("\n\n");
  }

  /**
   * Build structured Markdown output for clipboard.
   */
  function assembleMarkdown() {
    var pairs = assembleSectionsPairs();
    var parts = pairs.map(function (p) { return "## " + p.label + "\n\n" + p.value; });
    return parts.join("\n\n");
  }

  /**
   * Build plain-text output for clipboard (cleaner than preview).
   */
  function assemblePlainText() {
    var pairs = assembleSectionsPairs();
    var parts = pairs.map(function (p) { return p.label + ":\n" + p.value; });
    return parts.join("\n\n");
  }

  /**
   * Build an ordered array of {label, value} for the active framework
   * using instance-scoped user sections and global system sections.
   */
  function assembleSectionsPairs() {
    var fwKey = $framework ? $framework.value : "";
    var pairs = [];

    if (!fwKey) {
      var sys = $system && $system.value ? $system.value.trim() : "";
      var usr = getUserText() ? getUserText().trim() : "";
      if (sys) pairs.push({ label: "System", value: sys });
      if (usr) pairs.push({ label: "User", value: usr });
      return pairs;
    }

    var fw = CONFIGS.FRAMEWORKS[fwKey] || {};
    var sectionsDef = (fw.sections && fw.sections.length) ? fw.sections : deriveSectionsFromTemplates(fw || {});
    var instanceStored = loadFrameworkInstanceSections(fwKey) || {};

    sectionsDef.forEach(function (s) {
      var v = (instanceStored[s.label] || "").trim();
      if (v) pairs.push({ label: s.label, value: v });
    });

    return pairs;
  }

  /* ═══════════════════════════════════════════════════
     §8  CLIPBOARD
     ═══════════════════════════════════════════════════ */

  /**
   * Copy text to clipboard with visual feedback on the button.
   */
  function copyToClipboard(text, button) {
    var originalHTML = button.innerHTML;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(function () {
          flashCopied(button, originalHTML);
        })
        .catch(function () {
          fallbackCopy(text, button, originalHTML);
        });
    } else {
      fallbackCopy(text, button, originalHTML);
    }
  }

  /**
   * Fallback copy using a temporary textarea (for file:// or insecure contexts).
   */
  function fallbackCopy(text, button, originalHTML) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      flashCopied(button, originalHTML);
    } catch (e) {
      console.warn("[AnkuraCopy] Copy failed:", e);
      button.innerHTML = "⚠ Failed";
      setTimeout(function () {
        button.innerHTML = originalHTML;
      }, 1500);
    }
    document.body.removeChild(ta);
  }

  /**
   * Flash "Copied!" on the button briefly.
   */
  function flashCopied(button, originalHTML) {
    button.innerHTML = "✓ Copied!";
    button.classList.add("btn--copied");
    setTimeout(function () {
      button.innerHTML = originalHTML;
      button.classList.remove("btn--copied");
    }, 1500);
  }

  /* ═══════════════════════════════════════════════════
     §9  EVENT BINDING
     ═══════════════════════════════════════════════════ */

  function bindEvents() {
    // Debounced save helpers
    var debouncedSaveSystem = debounce(function () {
      // Persist the system prompt globally per-framework (including no-framework),
      // so it's shared across tabs/instances.
      var fwKey = $framework && $framework.value ? $framework.value : NO_FRAMEWORK_KEY;
      try {
        localStorage.setItem(globalSystemKey(fwKey), $system.value);
      } catch (e) {
        console.warn('[Vaak] failed saving global system prompt', e);
      }
    }, 500);

    // userPrompt now derived from framework section fields; no direct user textarea

    // Tuning/provider controls removed; no-op handlers retained for safety.

    // ── Framework change ──
    $framework.addEventListener("change", function () {
      var key = $framework.value;
      State.save("framework", key);
      // Always render the appropriate framework UI (including no-framework)
      renderFrameworkFields(key);
      if (key) {
        // hydrate state for the selected framework
        var sections = loadFrameworkInstanceSections(key);
        if (sections) {
          var combined = combineSectionsToText(sections, 'user');
          State.save('userPrompt', combined);
        }
        // Do not modify the global System Instructions textbox here.
      }
      renderPreview();
    });

    // ── System Instructions input ──
    $system.addEventListener("input", function () {
      debouncedSaveSystem();
      renderPreview();
    });

    // ── User Prompt input removed (user content is now composed from section fields)

    // Tuning sliders removed from UI.

    // ── Reset ──
    $btnReset.addEventListener("click", function () {
      if (!confirm("Reset all fields and clear saved state for this instance?")) {
        return;
      }

      State.clearAll();

      // Reset to defaults (framework/system).
      $framework.value = "";
      $system.value = "";
      selectedTaskType = null;
      renderTaskTypeRow();
      // instance userPrompt state cleared by State.clearAll();
      renderPreview();
      try { localStorage.setItem(INSTANCE_ID + "__meta_updated", JSON.stringify(new Date().toISOString())); } catch (e) {}
    });

    // ── Delete instance (per-user request) ──
    if ($btnDelete) {
      $btnDelete.addEventListener("click", function () {
        if (!confirm("Delete this instance and close the tab? This will clear all instance data.")) return;
        try { State.clearAll(); } catch (e) {}
        try { sessionStorage.removeItem('ankura_instanceId'); } catch (e) {}

        // Try to close the window; if blocked, navigate back to dashboard
        try {
          if (window.opener && !window.opener.closed) {
            try { window.opener.focus(); } catch (e) {}
            try { window.close(); return; } catch (e) {}
          }
        } catch (e) {}
        try { window.location.href = "../index.html"; } catch (e) {}
      });
    }

    // ── Back / Return to Dashboard ──
    if ($btnBack) {
      $btnBack.addEventListener("click", function () {
        try { localStorage.setItem(INSTANCE_ID + "__meta_updated", JSON.stringify(new Date().toISOString())); } catch (e) {}
        // Prefer focusing/closing opener when present
        try {
          if (window.opener && !window.opener.closed) {
            try {
              window.opener.focus();
            } catch (e) {
              // ignore
            }
            // Attempt to close this window (may be blocked in some contexts)
            try {
              window.close();
              // If close is blocked, navigate back as fallback
              setTimeout(function () {
                if (!window.closed) window.location.href = "../index.html";
              }, 250);
              return;
            } catch (e) {
              // fallthrough to navigation fallback
            }
          }
        } catch (e) {
          // ignore errors and fallback to navigation
        }

        // Fallback: navigate to root index.html relative path
        try {
          window.location.href = "../index.html";
        } catch (e) {
          console.warn("Back navigation failed", e);
        }
      });
    }

    // ── Copy Plain ──
    $btnCopyPlain.addEventListener("click", function () {
      var text = assemblePlainText();
      if (!text.trim()) return;
      copyToClipboard(text, $btnCopyPlain);
    });

    // ── Copy Markdown ──
    $btnCopyMd.addEventListener("click", function () {
      var md = assembleMarkdown();
      if (!md.trim()) return;
      copyToClipboard(md, $btnCopyMd);
    });

    // ── Cross-tab sync for framework sections & global system prompt ──
    window.addEventListener('storage', function (ev) {
      try {
        if (!ev.key) return;
        // Sync the per-framework global System Instructions when the active
        // framework matches the changed key. This ensures the System box is
        // kept in sync across tabs/instances for the selected framework.
        if (ev.key && ev.key.indexOf('VAAK_GLOBAL__SYSTEM_PROMPT_') === 0) {
          var fk = ev.key.replace('VAAK_GLOBAL__SYSTEM_PROMPT_', '');
          if ($framework.value === fk) {
            var v = loadGlobalSystem(fk);
            $system.value = v || "";
            renderPreview();
          }
        }
      } catch (e) {
        // ignore
      }
    });
  }

  /* ═══════════════════════════════════════════════════
     §10  BOOTSTRAP
     ═══════════════════════════════════════════════════ */

  // Run when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

