/**
 * GenAI-Yukti-Deck — App Logic
 * ─────────────────────────────
 * Pipeline-sorted stack engine with categorized deck,
 * fuzzy search, tag filtering, and variable injection.
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

  /** Layer labels for display */
  var LAYER_LABELS = {
    1: "L1 · Persona",
    2: "L2 · Modifier",
    3: "L3 · Wrapper",
    4: "L4 · Formatter",
  };

  /**
   * activeStack: ordered array of card IDs currently "played"
   * varValues:   { cardId: { VAR_NAME: "user value" } }
   */
  var activeStack = State.load("yukti_stack", []);
  var varValues = State.load("yukti_vars", {});

  /** Current search/filter state */
  var currentSearch = "";
  var activeTagFilter = null; // null = show all

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
  var $searchInput = document.getElementById("deck-search");
  var $tagBar = document.getElementById("tag-filter-bar");
  var $tagFilterToggle = document.getElementById("tag-filter-toggle");

  /** Drag state for stack reorder */
  var dragSrcIdx = null;

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

  /* ── Search & Filter ────────────────────────────── */

  /** Fuzzy case-insensitive match: does needle appear in haystack? */
  function fuzzyMatch(haystack, needle) {
    return haystack.toLowerCase().indexOf(needle.toLowerCase()) !== -1;
  }

  /** Check if a card passes the current search + tag filter */
  function cardPassesFilter(card) {
    // Tag filter
    if (activeTagFilter !== null) {
      var cardTags = card.tags || [];
      var hasTag = false;
      for (var i = 0; i < cardTags.length; i++) {
        if (cardTags[i].toLowerCase() === activeTagFilter.toLowerCase()) {
          hasTag = true;
          break;
        }
      }
      if (!hasTag) return false;
    }

    // Search filter
    if (!currentSearch) return true;
    var q = currentSearch.toLowerCase();
    if (fuzzyMatch(card.card || "", q)) return true;
    if (fuzzyMatch(card.description || "", q)) return true;
    if (fuzzyMatch(card.category || "", q)) return true;
    var tags = (card.tags || []).join(" ");
    if (fuzzyMatch(tags, q)) return true;
    return false;
  }

  /** Collect all unique tags from the deck for the filter bar */
  function collectAllTags() {
    var tagSet = {};
    DECK.forEach(function (card) {
      (card.tags || []).forEach(function (t) {
        tagSet[t.toLowerCase()] = t;
      });
    });
    return Object.keys(tagSet).sort().map(function (k) { return tagSet[k]; });
  }

  /** Render the tag filter bar */
  function renderTagBar() {
    if (!$tagBar) return;
    var allTags = collectAllTags();
    $tagBar.innerHTML = "";

    // "All" chip
    var allChip = document.createElement("button");
    allChip.className = "tag-chip" + (activeTagFilter === null ? " tag-chip--active" : "");
    allChip.textContent = "All";
    allChip.addEventListener("click", function () {
      activeTagFilter = null;
      renderTagBar();
      renderDeck();
    });
    $tagBar.appendChild(allChip);

    allTags.forEach(function (tag) {
      var chip = document.createElement("button");
      chip.className = "tag-chip" + (activeTagFilter === tag ? " tag-chip--active" : "");
      chip.textContent = "#" + tag;
      chip.addEventListener("click", function () {
        activeTagFilter = activeTagFilter === tag ? null : tag;
        renderTagBar();
        renderDeck();
      });
      $tagBar.appendChild(chip);
    });
  }

  /* ── Render: Categorized Card Grid ──────────────── */

  function renderDeck() {
    $cardGrid.innerHTML = "";

    // Group cards by category, preserving registry order within each
    var categories = [];
    var catMap = {};

    DECK.forEach(function (card) {
      if (!cardPassesFilter(card)) return;
      var cat = card.category || "Uncategorized";
      if (!catMap[cat]) {
        catMap[cat] = [];
        categories.push(cat);
      }
      catMap[cat].push(card);
    });

    if (categories.length === 0) {
      var emptyMsg = document.createElement("div");
      emptyMsg.className = "deck-empty";
      emptyMsg.textContent = "No cards match your search.";
      $cardGrid.appendChild(emptyMsg);
      $deckCount.textContent = activeStack.length + " / " + DECK.length;
      return;
    }

    categories.forEach(function (cat) {
      var section = document.createElement("div");
      section.className = "deck-category";

      var header = document.createElement("div");
      header.className = "deck-category__header";
      header.innerHTML =
        '<span class="deck-category__name">' + escapeHTML(cat) + "</span>" +
        '<span class="deck-category__count">' + catMap[cat].length + "</span>";
      section.appendChild(header);

      var grid = document.createElement("div");
      grid.className = "card-grid";

      catMap[cat].forEach(function (card) {
        var isActive = activeStack.indexOf(card.id) !== -1;
        var isBooster = (card.layer || 2) === 3;
        var el = document.createElement("div");
        el.className =
          "yukti-card" +
          (isActive ? " yukti-card--active" : "") +
          (isBooster ? " yukti-card--booster" : "");
        el.setAttribute("data-id", card.id);
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
        el.setAttribute("title", card.description || "");

        var layerLabel = LAYER_LABELS[card.layer] || "L?";
        var categoryBadge = isBooster
          ? '<span class="yukti-card__category">' + escapeHTML(card.category || "") + "</span>"
          : "";
        var citationLine = card.citation
          ? '<span class="yukti-card__citation">' + escapeHTML(card.citation) + "</span>"
          : "";

        el.innerHTML =
          '<span class="yukti-card__indicator"></span>' +
          '<span class="yukti-card__name">' + escapeHTML(card.card) + "</span>" +
          '<div class="yukti-card__meta">' +
            '<span class="yukti-card__type">' + escapeHTML(card.type || "suffix") + "</span>" +
            '<span class="yukti-card__layer">' + escapeHTML(layerLabel) + "</span>" +
          "</div>" +
          categoryBadge +
          '<span class="yukti-card__snippet">' + escapeHTML(card.content) + "</span>" +
          '<span class="yukti-card__desc">' + escapeHTML(card.description || "") + "</span>" +
          citationLine;

        el.addEventListener("click", function () {
          toggleCard(card.id);
        });
        el.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleCard(card.id);
          }
        });

        grid.appendChild(el);
      });

      section.appendChild(grid);
      $cardGrid.appendChild(section);
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

      var isBooster = (card.layer || 2) === 3;
      var vars = extractVars(card.content);
      // For wrapper cards, hide the auto-detected {{CONTEXT}} var —
      // context is the entire compiled prompt, injected automatically.
      if (card.type === "wrapper") {
        vars = vars.filter(function (v) { return v !== "CONTEXT"; });
      }
      var el = document.createElement("div");
      el.className = "stack-item" + (isBooster ? " stack-item--booster" : "");
      el.setAttribute("draggable", "true");
      el.setAttribute("data-idx", idx);

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

      // Layer badge
      var layerLabel = LAYER_LABELS[card.layer] || "L?";

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
        '<div class="stack-item__header">' +
          '<span class="stack-item__name">' + escapeHTML(card.card) + "</span>" +
          '<span class="stack-item__layer-badge">' + escapeHTML(layerLabel) + "</span>" +
        "</div>" +
        '<div class="stack-item__template">' + escapeHTML(card.content) + "</div>" +
        varsHTML +
        "</div>" +
        '<button class="stack-item__remove" title="Remove card">✕</button>';

      // Event: drag-and-drop reorder
      el.addEventListener("dragstart", function () {
        dragSrcIdx = idx;
        setTimeout(function () { el.classList.add("stack-item--dragging"); }, 0);
      });
      el.addEventListener("dragend", function () {
        el.classList.remove("stack-item--dragging");
        document.querySelectorAll(".stack-item--drag-over").forEach(function (n) {
          n.classList.remove("stack-item--drag-over");
        });
      });
      el.addEventListener("dragover", function (e) {
        e.preventDefault();
        el.classList.add("stack-item--drag-over");
      });
      el.addEventListener("dragleave", function () {
        el.classList.remove("stack-item--drag-over");
      });
      el.addEventListener("drop", function (e) {
        e.preventDefault();
        el.classList.remove("stack-item--drag-over");
        var targetIdx = parseInt(el.getAttribute("data-idx"), 10);
        if (dragSrcIdx === null || dragSrcIdx === targetIdx) return;
        var moved = activeStack.splice(dragSrcIdx, 1)[0];
        activeStack.splice(targetIdx, 0, moved);
        dragSrcIdx = null;
        renderStack();
        compile();
        persist();
      });

      // Event: reorder (buttons)
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

  /* ── Compile (Pipeline Protocol) ────────────────── */

  /**
   * Pipeline Protocol — execution order:
   *   1. Sort active cards by `layer` (ascending).
   *      Layer 1 (Persona/Injectors) → Layer 2 (Content Modifiers) →
   *      Layer 3 (Wrappers) → Layer 4 (Formatters)
   *   2. Within each layer, preserve the user's chosen order (manual reorder).
   *   3. Build inner prompt: prefixes → base → suffixes → formatters.
   *   4. Apply wrappers LAST — each receives the full inner prompt as {{CONTEXT}}.
   *
   * This guarantees correct execution regardless of click order.
   */
  function compile() {
    var base = ($basePrompt.value || "").trim();
    if (activeStack.length === 0 && !base) {
      $compiled.innerHTML =
        '<span class="compiled-output__empty">Play cards and write a base prompt to compile…</span>';
      return;
    }

    // Resolve cards from stack, attaching their layer for sorting
    var resolvedCards = [];
    activeStack.forEach(function (id) {
      var card = cardById(id);
      if (!card) return;
      resolvedCards.push(card);
    });

    // Pipeline sort: stable sort by layer, preserving user order within same layer
    resolvedCards.sort(function (a, b) {
      return (a.layer || 2) - (b.layer || 2);
    });

    var prefixes = [];
    var suffixes = [];
    var formatters = [];
    var wrapperCards = [];

    resolvedCards.forEach(function (card) {
      var type = (card.type || "suffix").toLowerCase();
      var layer = card.layer || 2;

      if (type === "wrapper") {
        wrapperCards.push(card);
      } else if (layer === 4) {
        // Layer 4 = formatters, appended after everything
        formatters.push(resolveTemplate(card));
      } else if (type === "prefix") {
        prefixes.push(resolveTemplate(card));
      } else {
        suffixes.push(resolveTemplate(card));
      }
    });

    // Step 1 — build inner prompt (prefix → base → suffix → formatters)
    var innerParts = [];
    if (prefixes.length) innerParts.push(prefixes.join("\n"));
    if (base) innerParts.push(base);
    if (suffixes.length) innerParts.push(suffixes.join("\n"));
    if (formatters.length) innerParts.push(formatters.join("\n"));
    var innerPrompt = innerParts.join("\n\n");

    // Step 2 — apply each wrapper around the inner prompt (layer 3)
    // Safety: if a wrapper card has no {{CONTEXT}} slot, it can't sandwich
    // the inner prompt — treat it as a suffix instead so content is never lost.
    var finalPrompt = innerPrompt;
    wrapperCards.forEach(function (card) {
      var vals = varValues[card.id] || {};
      var text = card.content;
      extractVars(card.content).forEach(function (v) {
        if (v === "CONTEXT") return;
        var replacement =
          vals[v] || (card.defaults && card.defaults[v]) || "{{" + v + "}}";
        text = text.replace(new RegExp("\\{\\{" + v + "\\}\\}", "g"), replacement);
      });

      if (card.content.indexOf("{{CONTEXT}}") !== -1) {
        // True wrapper: sandwiches the compiled prompt as {{CONTEXT}}
        finalPrompt = text.replace(/\{\{CONTEXT\}\}/g, finalPrompt);
      } else {
        // Fallback: no {{CONTEXT}} slot, just append so content isn't lost
        finalPrompt = finalPrompt + "\n\n" + text;
      }
    });

    $compiled.textContent = finalPrompt;
  }

  /* ── Events ─────────────────────────────────────── */

  // Base prompt input
  $basePrompt.addEventListener("input", function () {
    compile();
    persist();
  });

  // Tag filter toggle
  if ($tagFilterToggle) {
    $tagFilterToggle.addEventListener("click", function () {
      var isOpen = $tagBar.classList.toggle("tag-filter-bar--collapsed");
      $tagFilterToggle.setAttribute("aria-expanded", !isOpen);
      var arrow = $tagFilterToggle.querySelector(".tag-filter-toggle__arrow");
      if (arrow) arrow.style.transform = isOpen ? "" : "rotate(180deg)";
    });
  }

  // Search input
  if ($searchInput) {
    $searchInput.addEventListener("input", function () {
      currentSearch = $searchInput.value.trim();
      renderDeck();
    });
  }

  // Copy
  $btnCopy.addEventListener("click", function () {
    var text = $compiled.textContent || "";
    if (!text || $compiled.querySelector(".compiled-output__empty")) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        flashCopied();
      });
    } else {
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
    currentSearch = "";
    activeTagFilter = null;
    if ($searchInput) $searchInput.value = "";
    State.clear("yukti_stack");
    State.clear("yukti_vars");
    State.clear("yukti_base");
    // Collapse tag bar on reset
    if ($tagBar) $tagBar.classList.add("tag-filter-bar--collapsed");
    if ($tagFilterToggle) {
      $tagFilterToggle.setAttribute("aria-expanded", "false");
      var arrow = $tagFilterToggle.querySelector(".tag-filter-toggle__arrow");
      if (arrow) arrow.style.transform = "";
    }
    renderTagBar();
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

    // Restore base prompt from instance-scoped State
    var savedBase = State.load("yukti_base", "");
    if (savedBase) {
      $basePrompt.value = savedBase;
    }

    renderTagBar();
    renderDeck();
    renderStack();
    compile();
  }

  init();
})();
