/**
 * LLM Prompt Builder — Application Logic
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
    } else {
      $modelBadge.style.display = "none";
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
      renderPreview();
    });

    // ── Framework change ──
    $framework.addEventListener("change", function () {
      var key = $framework.value;
      State.save("framework", key);
      if (key) {
        applyFramework(key);
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
