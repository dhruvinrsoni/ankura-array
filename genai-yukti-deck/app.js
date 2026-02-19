/**
 * GenAI-Yukti-Deck — App Logic
 * ─────────────────────────────
 * Toggle/Stack engine with variable injection and prompt compilation.
 */
(function () {
  "use strict";

  /* ── Instance Identity ─────────────────────────── */

  function initInstanceId() {
    var params = new URLSearchParams(window.location.search);
    var id = params.get("instanceId");
    if (id) {
      sessionStorage.setItem("ankura_instanceId", id);
      return id;
    }
    id = sessionStorage.getItem("ankura_instanceId");
    if (id) return id;
    id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : "inst-" + Math.random().toString(36).slice(2, 9);
    sessionStorage.setItem("ankura_instanceId", id);
    var newUrl =
      window.location.pathname +
      "?instanceId=" +
      id +
      window.location.hash;
    try {
      window.history.replaceState(null, "", newUrl);
    } catch (e) {}
    return id;
  }

  var INSTANCE_ID = initInstanceId();

  /* ── Lightweight State Manager ─────────────────── */

  var State = {
    _key: function (name) {
      return INSTANCE_ID + "__" + name;
    },
    save: function (name, value) {
      try {
        localStorage.setItem(this._key(name), JSON.stringify(value));
      } catch (e) {}
    },
    load: function (name, fallback) {
      try {
        var raw = localStorage.getItem(this._key(name));
        return raw !== null ? JSON.parse(raw) : fallback;
      } catch (e) {
        return fallback;
      }
    },
    clear: function (name) {
      try {
        localStorage.removeItem(this._key(name));
      } catch (e) {}
    },
  };

  /* ── Theme ─────────────────────────────────────── */

  function applyThemeMode(mode) {
    var value = mode || "auto";
    var useDark = false;
    if (value === "auto") {
      try {
        useDark =
          window.matchMedia &&
          window.matchMedia("(prefers-color-scheme: dark)").matches;
      } catch (e) {
        useDark = false;
      }
    } else if (value === "dark") {
      useDark = true;
    }
    document.body.classList.toggle("dark-theme", useDark);
    document.body.classList.toggle("light-theme", !useDark);
  }

  function initTheme() {
    var sel = document.getElementById("theme-select");
    if (!sel) return;
    var saved = State.load("theme", "auto");
    sel.value = saved;
    applyThemeMode(saved);
    sel.addEventListener("change", function () {
      var v = sel.value || "auto";
      State.save("theme", v);
      applyThemeMode(v);
    });
  }

  /* ── Data ───────────────────────────────────────── */

  var DECK = window.YUKTI_DECK || [];

  /**
   * activeStack: ordered array of card IDs currently "played"
   * varValues:   { cardId: { VAR_NAME: "user value" } }
   */
  var activeStack = State.load("yukti_stack", []);
  var varValues = State.load("yukti_vars", {});

  /* ── DOM refs ───────────────────────────────────── */

  var $cardGrid = document.getElementById("card-grid");
  var $activeStack = document.getElementById("active-stack");
  var $basePrompt = document.getElementById("base-prompt");
  var $compiled = document.getElementById("compiled-output");
  var $deckCount = document.getElementById("deck-count");
  var $stackCount = document.getElementById("stack-count");
  var $btnCopy = document.getElementById("btn-copy");
  var $btnReset = document.getElementById("btn-reset");
  var $btnBack = document.getElementById("btn-back");

  /* ── Helpers ────────────────────────────────────── */

  function cardById(id) {
    for (var i = 0; i < DECK.length; i++) {
      if (DECK[i].id === id) return DECK[i];
    }
    return null;
  }

  /** Extract {{VAR}} names from template string */
  function extractVars(content) {
    var matches = content.match(/\{\{(\w+)\}\}/g);
    if (!matches) return [];
    var seen = {};
    var result = [];
    matches.forEach(function (m) {
      var name = m.replace(/[{}]/g, "");
      if (!seen[name]) {
        seen[name] = true;
        result.push(name);
      }
    });
    return result;
  }

  /** Resolve a card's template with user-supplied variable values */
  function resolveTemplate(card) {
    var vals = varValues[card.id] || {};
    var text = card.content;
    extractVars(card.content).forEach(function (v) {
      var replacement =
        vals[v] || (card.defaults && card.defaults[v]) || "{{" + v + "}}";
      text = text.replace(new RegExp("\\{\\{" + v + "\\}\\}", "g"), replacement);
    });
    return text;
  }

  function escapeHTML(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  /* ── Persistence ────────────────────────────────── */

  function persist() {
    State.save("yukti_stack", activeStack);
    State.save("yukti_vars", varValues);
    State.save("yukti_base", $basePrompt.value);
  }

  /* ── Render: Card Grid ──────────────────────────── */

  function renderDeck() {
    $cardGrid.innerHTML = "";
    DECK.forEach(function (card) {
      var isActive = activeStack.indexOf(card.id) !== -1;
      var el = document.createElement("div");
      el.className = "yukti-card" + (isActive ? " yukti-card--active" : "");
      el.setAttribute("data-id", card.id);
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "0");
      el.setAttribute("title", card.description || "");

      el.innerHTML =
        '<span class="yukti-card__indicator"></span>' +
        '<span class="yukti-card__name">' + escapeHTML(card.card) + "</span>" +
        '<span class="yukti-card__type">' + escapeHTML(card.type || "suffix") + "</span>" +
        '<span class="yukti-card__snippet">' + escapeHTML(card.content) + "</span>" +
        '<span class="yukti-card__desc">' + escapeHTML(card.description || "") + "</span>";

      el.addEventListener("click", function () {
        toggleCard(card.id);
      });
      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleCard(card.id);
        }
      });

      $cardGrid.appendChild(el);
    });

    $deckCount.textContent = activeStack.length + " / " + DECK.length;
  }

  /* ── Render: Active Stack ───────────────────────── */

  function renderStack() {
    $stackCount.textContent = activeStack.length;

    if (activeStack.length === 0) {
      $activeStack.innerHTML =
        '<div class="active-stack__empty">No cards played. Click a card to add it.</div>';
      return;
    }

    $activeStack.innerHTML = "";

    activeStack.forEach(function (id, idx) {
      var card = cardById(id);
      if (!card) return;

      var vars = extractVars(card.content);
      var el = document.createElement("div");
      el.className = "stack-item";

      // Order buttons
      var orderHTML =
        '<div class="stack-item__order">' +
        '<button data-dir="up" title="Move up"' +
        (idx === 0 ? " disabled" : "") +
        ">▲</button>" +
        '<button data-dir="down" title="Move down"' +
        (idx === activeStack.length - 1 ? " disabled" : "") +
        ">▼</button>" +
        "</div>";

      // Variable inputs
      var varsHTML = "";
      if (vars.length > 0) {
        varsHTML = '<div class="stack-item__vars">';
        vars.forEach(function (v) {
          var val =
            (varValues[id] && varValues[id][v]) ||
            (card.defaults && card.defaults[v]) ||
            "";
          varsHTML +=
            '<div class="var-input-group">' +
            '<span class="var-input-group__label">' + escapeHTML(v) + ":</span>" +
            '<input class="var-input-group__input" data-card="' +
            escapeHTML(id) +
            '" data-var="' +
            escapeHTML(v) +
            '" value="' +
            escapeHTML(val) +
            '" placeholder="' +
            escapeHTML(v) +
            '" />' +
            "</div>";
        });
        varsHTML += "</div>";
      }

      el.innerHTML =
        orderHTML +
        '<div class="stack-item__body">' +
        '<div class="stack-item__name">' + escapeHTML(card.card) + "</div>" +
        '<div class="stack-item__template">' + escapeHTML(card.content) + "</div>" +
        varsHTML +
        "</div>" +
        '<button class="stack-item__remove" title="Remove card">✕</button>';

      // Event: reorder
      el.querySelectorAll(".stack-item__order button").forEach(function (btn) {
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          var dir = btn.getAttribute("data-dir");
          moveCard(idx, dir);
        });
      });

      // Event: variable input
      el.querySelectorAll(".var-input-group__input").forEach(function (inp) {
        inp.addEventListener("input", function () {
          var cid = inp.getAttribute("data-card");
          var vname = inp.getAttribute("data-var");
          if (!varValues[cid]) varValues[cid] = {};
          varValues[cid][vname] = inp.value;
          compile();
          persist();
        });
      });

      // Event: remove
      el.querySelector(".stack-item__remove").addEventListener("click", function (e) {
        e.stopPropagation();
        toggleCard(id);
      });

      $activeStack.appendChild(el);
    });
  }

  /* ── Stack Operations ───────────────────────────── */

  function toggleCard(id) {
    var idx = activeStack.indexOf(id);
    if (idx !== -1) {
      activeStack.splice(idx, 1);
    } else {
      activeStack.push(id);
    }
    renderDeck();
    renderStack();
    compile();
    persist();
  }

  function moveCard(idx, direction) {
    var newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= activeStack.length) return;
    var temp = activeStack[idx];
    activeStack[idx] = activeStack[newIdx];
    activeStack[newIdx] = temp;
    renderStack();
    compile();
    persist();
  }

  /* ── Compile ────────────────────────────────────── */

  function compile() {
    var base = ($basePrompt.value || "").trim();
    if (activeStack.length === 0 && !base) {
      $compiled.innerHTML =
        '<span class="compiled-output__empty">Play cards and write a base prompt to compile…</span>';
      return;
    }

    var prefixes = [];
    var wrappers = [];
    var suffixes = [];

    activeStack.forEach(function (id) {
      var card = cardById(id);
      if (!card) return;
      var resolved = resolveTemplate(card);
      var type = (card.type || "suffix").toLowerCase();
      if (type === "prefix") prefixes.push(resolved);
      else if (type === "wrapper") wrappers.push(resolved);
      else suffixes.push(resolved);
    });

    var parts = [];

    // Prefixes first
    if (prefixes.length) parts.push(prefixes.join("\n"));

    // Base prompt (possibly wrapped)
    var baseBlock = base || "";
    if (wrappers.length) {
      // Wrappers enclose the base prompt
      wrappers.forEach(function (w) {
        baseBlock = w + "\n" + baseBlock;
      });
    }
    if (baseBlock) parts.push(baseBlock);

    // Suffixes last
    if (suffixes.length) parts.push(suffixes.join("\n"));

    var final = parts.join("\n\n");
    $compiled.textContent = final;
  }

  /* ── Events ─────────────────────────────────────── */

  // Base prompt input
  $basePrompt.addEventListener("input", function () {
    compile();
    persist();
  });

  // Copy
  $btnCopy.addEventListener("click", function () {
    var text = $compiled.textContent || "";
    if (!text || $compiled.querySelector(".compiled-output__empty")) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        flashCopied();
      });
    } else {
      // Fallback
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        flashCopied();
      } catch (e) {}
      document.body.removeChild(ta);
    }
  });

  function flashCopied() {
    $btnCopy.classList.add("btn--copied");
    $btnCopy.textContent = "✓ Copied";
    setTimeout(function () {
      $btnCopy.classList.remove("btn--copied");
      $btnCopy.textContent = "📋 Copy";
    }, 1500);
  }

  // Reset
  $btnReset.addEventListener("click", function () {
    if (!confirm("Clear the entire stack and all inputs?")) return;
    activeStack = [];
    varValues = {};
    $basePrompt.value = "";
    State.clear("yukti_stack");
    State.clear("yukti_vars");
    State.clear("yukti_base");
    renderDeck();
    renderStack();
    compile();
  });

  // Back
  $btnBack.addEventListener("click", function () {
    var dashUrl = window.location.pathname.replace(/\/[^/]+\/[^/]*$/, "/index.html");
    window.location.href = dashUrl;
  });

  /* ── Init ───────────────────────────────────────── */

  function init() {
    initTheme();

    // Restore base prompt
    var savedBase = State.load("yukti_base", "");
    if (savedBase) $basePrompt.value = savedBase;

    renderDeck();
    renderStack();
    compile();
  }

  init();
})();
