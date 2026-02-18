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
  var $user = document.getElementById("user-prompt");
  var $sliderTemp = document.getElementById("slider-temp");
  var $sliderTopP = document.getElementById("slider-topp");
  var $valTemp = document.getElementById("val-temp");
  var $valTopP = document.getElementById("val-topp");
  var $preview = document.getElementById("output-preview");
  var $btnCopyPlain = document.getElementById("btn-copy-plain");
  var $btnCopyMd = document.getElementById("btn-copy-markdown");
  var $btnReset = document.getElementById("btn-reset");
  var $btnBack = document.getElementById("btn-back");
  var $providerInfo = document.getElementById("provider-info");
  var $btnApplyGuidance = document.getElementById("btn-apply-guidance");
  var $previewHint = document.getElementById("preview-hint");

  var CONFIGS = window.LLM_CONFIGS || { PROVIDERS: {}, FRAMEWORKS: {} };

  /* ═══════════════════════════════════════════════════
     §5  INITIALIZATION / HYDRATION
     ═══════════════════════════════════════════════════ */

  function init() {
    populateProviders();
    populateFrameworks();
    hydrateState();
    syncSliderRanges();
    updateModelBadge();
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
    var savedProvider = State.load("provider");
    if (savedProvider && CONFIGS.PROVIDERS[savedProvider]) {
      $provider.value = savedProvider;
    }

    var savedFramework = State.load("framework");
    if (savedFramework !== null) {
      $framework.value = savedFramework;
    }

    var savedSystem = State.load("systemInstructions");
    if (savedSystem !== null) {
      $system.value = savedSystem;
    }

    var savedUser = State.load("userPrompt");
    if (savedUser !== null) {
      $user.value = savedUser;
    }

    var savedTemp = State.load("temperature");
    if (savedTemp !== null) {
      $sliderTemp.value = savedTemp;
    }

    var savedTopP = State.load("topP");
    if (savedTopP !== null) {
      $sliderTopP.value = savedTopP;
    }

    // Sync displayed values
    $valTemp.textContent = parseFloat($sliderTemp.value).toFixed(2);
    $valTopP.textContent = parseFloat($sliderTopP.value).toFixed(2);
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
      // keep legacy single prompt in sync for compatibility
      var systemCombined = combineSectionsToText(obj, "system");
      if (systemCombined) localStorage.setItem(globalSystemKey(frameworkKey), systemCombined);
      else localStorage.removeItem(globalSystemKey(frameworkKey));
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
    if (!fw || !fw.sections) return "";
    fw.sections.forEach(function (s) {
      if (s.target === target) {
        var v = (obj[s.label] || "").trim();
        if (v) parts.push(v);
      }
    });
    return parts.join("\n\n");
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
      } else if (legacy && section.target === 'system' && !Object.keys(stored).length) {
        ta.value = legacy;
        legacy = null;
      }

      var deb = debounce(function () {
        var nodes = container.querySelectorAll('textarea[data-section-label]');
        var obj = {};
        nodes.forEach(function (n) { obj[n.dataset.sectionLabel] = n.value; });
        saveFrameworkSections(frameworkKey, obj);
        // update combined textareas
        $system.value = combineSectionsToText(obj, 'system');
        $user.value = combineSectionsToText(obj, 'user');
        State.save('userPrompt', $user.value);
        renderPreview();
      }, 400);

      ta.addEventListener('input', deb);

      wrap.appendChild(ta);
      container.appendChild(wrap);
    });
  }

  /**
   * Update slider min/max/step/default based on selected provider.
   */
  function syncSliderRanges() {
    var providerKey = $provider.value;
    var provider = CONFIGS.PROVIDERS[providerKey];
    if (!provider) return;

    var temp = provider.temperature;
    $sliderTemp.min = temp.min;
    $sliderTemp.max = temp.max;
    $sliderTemp.step = temp.step;

    // Clamp current value within new range
    var currentTemp = parseFloat($sliderTemp.value);
    if (currentTemp < temp.min) $sliderTemp.value = temp.min;
    if (currentTemp > temp.max) $sliderTemp.value = temp.max;

    var topP = provider.topP;
    $sliderTopP.min = topP.min;
    $sliderTopP.max = topP.max;
    $sliderTopP.step = topP.step;

    var currentTopP = parseFloat($sliderTopP.value);
    if (currentTopP < topP.min) $sliderTopP.value = topP.min;
    if (currentTopP > topP.max) $sliderTopP.value = topP.max;

    $valTemp.textContent = parseFloat($sliderTemp.value).toFixed(2);
    $valTopP.textContent = parseFloat($sliderTopP.value).toFixed(2);
  }

  /**
   * Show the current model name in the badge.
   */
  function updateModelBadge() {
    var providerKey = $provider.value;
    var provider = CONFIGS.PROVIDERS[providerKey];
    if (provider) {
      $modelBadge.textContent = "⚡ " + provider.model;
      $modelBadge.style.display = "";
      // Show provider info (max tokens, defaults)
      $providerInfo.textContent =
        "Max tokens: " + provider.maxTokens +
        " • default temp: " + provider.temperature.default.toFixed(2) +
        " • default topP: " + provider.topP.default.toFixed(2);

      // Preview hint (top-right, non-editable inside preview panel)
      if ($previewHint) {
        $previewHint.textContent =
          "Max Tokens: " + provider.maxTokens +
          " | Recommended Temp: " + provider.temperature.default.toFixed(2);
        $previewHint.style.display = "inline-block";
      }
    } else {
      $modelBadge.style.display = "none";
      $providerInfo.textContent = "";
      if ($previewHint) {
        $previewHint.textContent = "";
        $previewHint.style.display = "none";
      }
    }
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
    if (fw.systemTemplate) {
      insertTemplate($system, fw.systemTemplate);
    }

    // User template
    if (fw.userTemplate) {
      insertTemplate($user, fw.userTemplate);
    }

    // Save immediately
    State.save("systemInstructions", $system.value);
    State.save("userPrompt", $user.value);
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
    var provider = CONFIGS.PROVIDERS[$provider.value];
    var providerName = provider ? provider.name + " (" + provider.model + ")" : "—";
    var sys = $system.value || "";
    var usr = $user.value || "";
    var words = 0;
    try {
      words = (sys + " " + usr).split(/\s+/).filter(Boolean).length;
    } catch (e) {
      words = 0;
    }
    // Rough token estimate: words * 1.3 (very approximate)
    var tokens = Math.max(0, Math.ceil(words * 1.3));
    var status = "Tokens: ~" + tokens + " | Provider: " + (provider ? provider.model : "—");
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
    var userText = $user.value.trim();

    if (!systemText && !userText) return "";

    var provider = CONFIGS.PROVIDERS[$provider.value];
    var modelName = provider ? provider.model : "Unknown";

    var parts = [];

    if (systemText) {
      parts.push("=== System Instructions ===\n" + systemText);
    }

    if (userText) {
      parts.push("=== User Prompt ===\n" + userText);
    }

    parts.push(
      "=== Parameters ===\n" +
        "Model: " + modelName + "\n" +
        "Temperature: " + parseFloat($sliderTemp.value).toFixed(2) + "\n" +
        "Top P: " + parseFloat($sliderTopP.value).toFixed(2)
    );

    return parts.join("\n\n");
  }

  /**
   * Build structured Markdown output for clipboard.
   */
  function assembleMarkdown() {
    var systemText = $system.value.trim();
    var userText = $user.value.trim();
    var provider = CONFIGS.PROVIDERS[$provider.value];
    var modelName = provider ? provider.model : "Unknown";

    var parts = [];

    if (systemText) {
      parts.push("## System Instructions\n\n" + systemText);
    }

    if (userText) {
      parts.push("## User Prompt\n\n" + userText);
    }

    parts.push(
      "## Parameters\n\n" +
        "- **Model:** " + modelName + "\n" +
        "- **Temperature:** " + parseFloat($sliderTemp.value).toFixed(2) + "\n" +
        "- **Top P:** " + parseFloat($sliderTopP.value).toFixed(2)
    );

    return parts.join("\n\n");
  }

  /**
   * Build plain-text output for clipboard (cleaner than preview).
   */
  function assemblePlainText() {
    var systemText = $system.value.trim();
    var userText = $user.value.trim();
    var provider = CONFIGS.PROVIDERS[$provider.value];
    var modelName = provider ? provider.model : "Unknown";

    var parts = [];

    if (systemText) {
      parts.push("System Instructions:\n" + systemText);
    }

    if (userText) {
      parts.push("User Prompt:\n" + userText);
    }

    parts.push(
      "Parameters:\n" +
        "  Model: " + modelName + "\n" +
        "  Temperature: " + parseFloat($sliderTemp.value).toFixed(2) + "\n" +
        "  Top P: " + parseFloat($sliderTopP.value).toFixed(2)
    );

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
      State.save("systemInstructions", $system.value);
    }, 500);

    var debouncedSaveUser = debounce(function () {
      State.save("userPrompt", $user.value);
    }, 500);

    var debouncedSaveTemp = debounce(function () {
      State.save("temperature", $sliderTemp.value);
    }, 500);

    var debouncedSaveTopP = debounce(function () {
      State.save("topP", $sliderTopP.value);
    }, 500);

    // ── Provider change ──
    $provider.addEventListener("change", function () {
      State.save("provider", $provider.value);
      syncSliderRanges();
      updateModelBadge();
      updateApplyButtonState();
      renderPreview();
    });

    // ── Framework change ──
    $framework.addEventListener("change", function () {
      var key = $framework.value;
      State.save("framework", key);
      if (key) {
        // Render per-section inputs (and hydrate from stored sections or legacy global)
        renderFrameworkFields(key);
        var sections = loadFrameworkSections(key);
        if (sections) {
          $system.value = combineSectionsToText(sections, 'system');
          $user.value = combineSectionsToText(sections, 'user');
        } else {
          var legacy = loadGlobalSystem(key);
          if (legacy) $system.value = legacy;
        }
      }
      renderPreview();
    });

    // ── System Instructions input ──
    $system.addEventListener("input", function () {
      debouncedSaveSystem();
      renderPreview();
    });

    // ── User Prompt input ──
    $user.addEventListener("input", function () {
      debouncedSaveUser();
      renderPreview();
    });

    // ── Temperature slider ──
    $sliderTemp.addEventListener("input", function () {
      $valTemp.textContent = parseFloat($sliderTemp.value).toFixed(2);
      debouncedSaveTemp();
      renderPreview();
    });

    // ── Top P slider ──
    $sliderTopP.addEventListener("input", function () {
      $valTopP.textContent = parseFloat($sliderTopP.value).toFixed(2);
      debouncedSaveTopP();
      renderPreview();
    });

    // ── Reset ──
    $btnReset.addEventListener("click", function () {
      if (!confirm("Reset all fields and clear saved state for this instance?")) {
        return;
      }

      State.clearAll();

      // Reset to defaults
      $provider.selectedIndex = 0;
      $framework.value = "";
      $system.value = "";
      $user.value = "";

      var defaultProvider = CONFIGS.PROVIDERS[$provider.value];
      if (defaultProvider) {
        $sliderTemp.value = defaultProvider.temperature.default;
        $sliderTopP.value = defaultProvider.topP.default;
      } else {
        $sliderTemp.value = 1;
        $sliderTopP.value = 1;
      }

      $valTemp.textContent = parseFloat($sliderTemp.value).toFixed(2);
      $valTopP.textContent = parseFloat($sliderTopP.value).toFixed(2);

      syncSliderRanges();
      updateModelBadge();
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
      if (!text.trim() || text === "Parameters:\n  Model: Unknown\n  Temperature: 1.00\n  Top P: 1.00") {
        return;
      }
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
              $system.value = combineSectionsToText(sections, 'system');
              $user.value = combineSectionsToText(sections, 'user');
            } else {
              var legacy = loadGlobalSystem(fk);
              if (legacy) $system.value = legacy;
            }
            renderPreview();
          }
        }

        if (ev.key.indexOf('VAAK_GLOBAL__SYSTEM_PROMPT_') === 0) {
          var fk2 = ev.key.replace('VAAK_GLOBAL__SYSTEM_PROMPT_', '');
          if ($framework.value === fk2) {
            var v = loadGlobalSystem(fk2);
            if (v === null) $system.value = '';
            else $system.value = v;
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

