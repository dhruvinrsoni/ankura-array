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
      return id;
    }

    // Check sessionStorage (e.g. page refresh within the same tab)
    id = sessionStorage.getItem("ankura_instanceId");
    if (id) {
      return id;
    }

    // Self-heal: generate a new UUID and update URL without navigation
    id =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : fallbackUUID();
    sessionStorage.setItem("ankura_instanceId", id);
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
  var $btnApplyGuidance = document.getElementById("btn-apply-guidance");

  var CONFIGS = window.LLM_CONFIGS || { PROVIDERS: {}, FRAMEWORKS: {} };
  var NO_FRAMEWORK_KEY = "__NO_FRAMEWORK__";

  /* ═══════════════════════════════════════════════════
     §5  INITIALIZATION / HYDRATION
     ═══════════════════════════════════════════════════ */

  function init() {
    populateFrameworks();
    hydrateState();
    // Render framework-specific fields (including the no-framework sandbox)
    renderFrameworkFields($framework.value);
    // tuning/provider UI removed — slider/model sync omitted
    updateApplyButtonState();
    renderPreview();
    bindEvents();
  }

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

  function loadFrameworkSections(frameworkKey) {
    try {
      var raw = localStorage.getItem(frameworkSectionsKey(frameworkKey));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function saveFrameworkSections(frameworkKey, obj) {
    try {
      localStorage.setItem(frameworkSectionsKey(frameworkKey), JSON.stringify(obj));
      // Note: do NOT auto-populate or persist a combined system prompt.
      // System instructions should remain empty by default; only user-targeted
      // sections are synchronized into the instance `userPrompt` textarea.
    } catch (e) {
      console.warn("[VaakFramework] save sections failed", e);
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
    var sections = loadFrameworkSections(fwKey);
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
      wrap.className = 'editor-section';

      var header = document.createElement('div');
      header.className = 'editor-section__header';
      var label = document.createElement('label');
      label.className = 'field-label';
      label.textContent = 'User Instructions (Sandbox)';
      header.appendChild(label);
      wrap.appendChild(header);

      var ta = document.createElement('textarea');
      ta.className = 'textarea textarea--user';
      ta.rows = 12;
      ta.placeholder = 'Freeform user instructions — full sandbox. The composed prompt will appear in the preview.';
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
      container.appendChild(wrap);
      return;
    }

    var fw = CONFIGS.FRAMEWORKS[frameworkKey];
    if (!fw) return;

    var sectionsDef = (fw.sections && fw.sections.length) ? fw.sections : deriveSectionsFromTemplates(fw);
    if (!sectionsDef || !sectionsDef.length) return;

    var stored = loadFrameworkSections(frameworkKey) || {};
    var legacy = loadGlobalSystem(frameworkKey);

    sectionsDef.forEach(function (section) {
      var wrap = document.createElement('div');
      wrap.className = 'editor-section';

      var header = document.createElement('div');
      header.className = 'editor-section__header';
      var label = document.createElement('label');
      label.className = 'field-label';
      label.textContent = section.label + (section.target === 'system' ? ' (system)' : ' (user)');
      header.appendChild(label);
      wrap.appendChild(header);

      var ta = document.createElement('textarea');
      ta.className = 'textarea';
      ta.rows = section.target === 'system' ? 4 : 3;
      ta.placeholder = section.placeholder || '';
      ta.dataset.sectionLabel = section.label;

      if (stored && stored[section.label]) {
        ta.value = stored[section.label];
      }

      var deb = debounce(function () {
        var nodes = container.querySelectorAll('textarea[data-section-label]');
        var obj = {};
        nodes.forEach(function (n) { obj[n.dataset.sectionLabel] = n.value; });
        saveFrameworkSections(frameworkKey, obj);
        // Only sync user-targeted sections into the instance-scoped saved userPrompt.
        var combinedUser = combineSectionsToText(obj, 'user');
        State.save('userPrompt', combinedUser);
        // Also derive system-targeted sections and apply to the System Instructions box
        var combinedSystem = combineSectionsToText(obj, 'system');
        if (typeof combinedSystem === 'string') {
          $system.value = combinedSystem;
          State.save('systemInstructions', combinedSystem);
        }
        renderPreview();
      }, 400);

      ta.addEventListener('input', deb);

      wrap.appendChild(ta);
      container.appendChild(wrap);
    });

    // After rendering all fields, initialize System Instructions from stored system-targeted sections
    try {
      var initSections = stored || {};
      var combinedSysInit = combineSectionsToText(initSections, 'system');
      if (combinedSysInit && combinedSysInit.trim()) {
        $system.value = combinedSysInit;
      } else if (legacy && legacy.trim()) {
        $system.value = legacy;
      }
      // Also initialize & persist composed user text so preview reflects loaded fields
      var combinedUserInit = combineSectionsToText(initSections, 'user');
      if (typeof combinedUserInit === 'string') {
        State.save('userPrompt', combinedUserInit);
      }
      // Ensure preview updates to reflect loaded data
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

    // Save system (empty by design) and ensure preview updates
    State.save("systemInstructions", $system.value);
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

    // Guidance toggle helper functions
    function guidanceMarkers(provider) {
      var model = provider.model.replace(/\s+/g, "_");
      var start = "\n\n--- Provider Guidance (" + model + ") START ---\n";
      var end = "\n--- Provider Guidance (" + model + ") END ---\n";
      return { start: start, end: end };
    }

    function buildGuidance(provider) {
      return (
        "Provider Guidance:\n" +
        "- Model: " + provider.model + "\n" +
        "- Max tokens: " + provider.maxTokens + "\n" +
        "- Recommended temperature: " + provider.temperature.default.toFixed(2) + "\n" +
        "- Recommended top_p: " + provider.topP.default.toFixed(2) + "\n\n" +
        "Behavioral guidance: Keep responses concise and prefer structured output when possible."
      );
    }

    function isGuidancePresentFor(provider) {
      if (!provider) return false;
      var markers = guidanceMarkers(provider);
      return $system.value.indexOf(markers.start) !== -1 && $system.value.indexOf(markers.end) !== -1;
    }

    function removeGuidanceFor(provider) {
      if (!provider) return;
      var markers = guidanceMarkers(provider);
      var idx = $system.value.indexOf(markers.start);
      if (idx === -1) return;
      var idxEnd = $system.value.indexOf(markers.end, idx);
      if (idxEnd === -1) return;
      var before = $system.value.slice(0, idx);
      var after = $system.value.slice(idxEnd + markers.end.length);
      $system.value = before.trim() + (after.trim() ? "\n\n" + after.trim() : "");
      State.save("systemInstructions", $system.value);
    }

    function insertGuidanceFor(provider) {
      if (!provider) return;
      var markers = guidanceMarkers(provider);
      var guidance = buildGuidance(provider);
      // Prevent duplicate insertion: only insert when absent
      if (isGuidancePresentFor(provider)) return;
      if (!$system.value.trim()) {
        $system.value = guidance + "\n";
      } else {
        $system.value = $system.value.trim() + markers.start + guidance + markers.end;
      }
      State.save("systemInstructions", $system.value);
    }

    function updateApplyButtonState() {
      var providerKey = $provider.value;
      var provider = CONFIGS.PROVIDERS[providerKey];
      if (!$btnApplyGuidance) return;
      // Always show the same label; indicate active state via class + aria-pressed
      $btnApplyGuidance.textContent = "Toggle Guidance";
      if (provider && isGuidancePresentFor(provider)) {
        $btnApplyGuidance.classList.add("btn--active");
        $btnApplyGuidance.classList.remove("btn--outline");
        $btnApplyGuidance.setAttribute("aria-pressed", "true");
      } else {
        $btnApplyGuidance.classList.remove("btn--active");
        $btnApplyGuidance.classList.add("btn--outline");
        $btnApplyGuidance.setAttribute("aria-pressed", "false");
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
    var systemText = $system.value.trim();
    var userText = getUserText().trim();

    if (!systemText && !userText) return "";

    var parts = [];

    if (systemText) {
      parts.push("=== System Instructions ===\n" + systemText);
    }

    if (userText) {
      parts.push("=== User Prompt ===\n" + userText);
    }

    return parts.join("\n\n");
  }

  /**
   * Build structured Markdown output for clipboard.
   */
  function assembleMarkdown() {
    var systemText = $system.value.trim();
    var userText = getUserText().trim();

    var parts = [];

    if (systemText) {
      parts.push("## System Instructions\n\n" + systemText);
    }

    if (userText) {
      parts.push("## User Prompt\n\n" + userText);
    }

    return parts.join("\n\n");
  }

  /**
   * Build plain-text output for clipboard (cleaner than preview).
   */
  function assemblePlainText() {
    var systemText = $system.value.trim();
    var userText = getUserText().trim();

    var parts = [];

    if (systemText) {
      parts.push("System Instructions:\n" + systemText);
    }

    if (userText) {
      parts.push("User Prompt:\n" + userText);
    }

    return parts.join("\n\n");
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
      // If no framework selected, persist the system prompt globally so it's shared across tabs/instances.
      if (!$framework.value) {
        try {
          localStorage.setItem(globalSystemKey(NO_FRAMEWORK_KEY), $system.value);
        } catch (e) {
          console.warn('[Vaak] failed saving global system for no-framework', e);
        }
      } else {
        State.save("systemInstructions", $system.value);
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
        var sections = loadFrameworkSections(key);
        $system.value = "";
        if (sections) {
          var combined = combineSectionsToText(sections, 'user');
          State.save('userPrompt', combined);
        }
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
      // instance userPrompt state cleared by State.clearAll();
      renderPreview();
    });

    // ── Back / Return to Dashboard ──
    if ($btnBack) {
      $btnBack.addEventListener("click", function () {
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

    // ── Apply Guidance toggle ──
    if ($btnApplyGuidance) {
      $btnApplyGuidance.addEventListener("click", function () {
        var providerKey = $provider.value;
        var provider = CONFIGS.PROVIDERS[providerKey];
        if (!provider) return;

        if (isGuidancePresentFor(provider)) {
          removeGuidanceFor(provider);
        } else {
          insertGuidanceFor(provider);
        }
        updateApplyButtonState();
        renderPreview();
      });
    }

    // ── Cross-tab sync for framework sections & global system prompt ──
    window.addEventListener('storage', function (ev) {
      try {
        if (!ev.key) return;
        if (ev.key.indexOf('VAAK_GLOBAL__FRAMEWORK_SECTIONS_') === 0) {
          var fk = ev.key.replace('VAAK_GLOBAL__FRAMEWORK_SECTIONS_', '');
          if ($framework.value === fk) {
            renderFrameworkFields(fk);
            var sections = loadFrameworkSections(fk);
            if (sections) {
              // Only sync user-targeted sections into instance state.
              var combined = combineSectionsToText(sections, 'user');
              State.save('userPrompt', combined);
              // Also sync system-targeted sections into the system textarea
              try {
                var combinedSys = combineSectionsToText(sections, 'system');
                if (combinedSys && combinedSys.trim()) {
                  $system.value = combinedSys;
                }
              } catch (e) {}
            }
            renderPreview();
          }
        }
        // sync for no-framework global system prompt
        if (ev.key === globalSystemKey(NO_FRAMEWORK_KEY)) {
          if (!$framework.value) {
            var v = loadGlobalSystem(NO_FRAMEWORK_KEY);
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

