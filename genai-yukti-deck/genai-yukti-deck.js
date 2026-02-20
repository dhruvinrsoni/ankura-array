/**
 * GenAI-Yukti-Deck — App Logic (renamed to genai-yukti-deck.js)
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
      // ensure meta_created/meta_updated exist for this instance
      try {
        var existingCreated = localStorage.getItem(id + "__meta_created");
        var now = new Date().toISOString();
        if (!existingCreated) {
          localStorage.setItem(id + "__meta_created", JSON.stringify(now));
        }
        localStorage.setItem(id + "__meta_updated", JSON.stringify(now));
      } catch (e) {}
      return id;
    }
    id = sessionStorage.getItem("ankura_instanceId");
    if (id) {
      // ensure meta timestamps exist
      try {
        var ex = localStorage.getItem(id + "__meta_created");
        var now2 = new Date().toISOString();
        if (!ex) localStorage.setItem(id + "__meta_created", JSON.stringify(now2));
        localStorage.setItem(id + "__meta_updated", JSON.stringify(now2));
      } catch (e) {}
      return id;
    }
    id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : "inst-" + Math.random().toString(36).slice(2, 9);
    sessionStorage.setItem("ankura_instanceId", id);
    // record creation timestamp for this instance (ISO 8601)
    try {
      localStorage.setItem(id + "__meta_created", JSON.stringify(new Date().toISOString()));
      localStorage.setItem(id + "__meta_updated", JSON.stringify(new Date().toISOString()));
    } catch (e) {}
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
        try {
          localStorage.setItem(this._key('meta_updated'), JSON.stringify(new Date().toISOString()));
        } catch (e) {}
        try {
          window.dispatchEvent(new CustomEvent('ankura:meta-updated', { detail: { instance: INSTANCE_ID } }));
        } catch (e) {}
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
  var $btnDelete = document.getElementById("btn-delete");
  var $searchInput = document.getElementById("deck-search");
  var $tagBar = document.getElementById("tag-filter-bar");
  var $tagFilterToggle = document.getElementById("tag-filter-toggle");
  var $metaCreated = document.getElementById("meta-created");
  var $metaUpdated = document.getElementById("meta-updated");

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
    try { renderMeta(); } catch (e) {}
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
    activeStack.forEach(function (cardId, idx) {
      var card = cardById(cardId);
      var row = document.createElement("div");
      row.className = "stack-row";
      row.setAttribute("draggable", "true");
      row.setAttribute("data-idx", idx);

      var name = document.createElement("div");
      name.className = "stack-row__name";
      name.textContent = card ? card.card : cardId;

      var controls = document.createElement("div");
      controls.className = "stack-row__controls";
      var up = document.createElement("button"); up.className = "btn btn--outline"; up.textContent = "↑";
      var down = document.createElement("button"); down.className = "btn btn--outline"; down.textContent = "↓";
      var remove = document.createElement("button"); remove.className = "btn btn--danger"; remove.textContent = "Remove";

      up.addEventListener("click", function () { moveStack(idx, idx - 1); });
      down.addEventListener("click", function () { moveStack(idx, idx + 1); });
      remove.addEventListener("click", function () { removeFromStack(idx); });

      controls.appendChild(up); controls.appendChild(down); controls.appendChild(remove);

      row.appendChild(name);
      row.appendChild(controls);

      // drag handlers
      row.addEventListener("dragstart", function (e) { dragSrcIdx = idx; e.dataTransfer && e.dataTransfer.setData('text/plain', ''); });
      row.addEventListener("dragover", function (e) { e.preventDefault(); });
      row.addEventListener("drop", function (e) { e.preventDefault(); if (dragSrcIdx !== null) moveStack(dragSrcIdx, idx); dragSrcIdx = null; });

      $activeStack.appendChild(row);
    });
  }

  /* ── Stack mutation helpers ─────────────────────── */

  function toggleCard(id) {
    var ix = activeStack.indexOf(id);
    if (ix === -1) {
      activeStack.push(id);
    } else {
      activeStack.splice(ix, 1);
    }
    persist();
    renderDeck();
    renderStack();
    renderCompiled();
  }

  function moveStack(from, to) {
    if (to < 0 || to >= activeStack.length) return;
    var item = activeStack.splice(from, 1)[0];
    activeStack.splice(to, 0, item);
    persist();
    renderStack();
    renderCompiled();
  }

  function removeFromStack(idx) {
    activeStack.splice(idx, 1);
    persist();
    renderStack();
    renderCompiled();
  }

  /* ── Variable editor for cards in stack ─────────── */

  function renderCompiled() {
    var lines = [];
    if ($basePrompt && $basePrompt.value) lines.push($basePrompt.value);
    activeStack.forEach(function (cid) {
      var card = cardById(cid);
      if (!card) return;
      lines.push(resolveTemplate(card));
    });
    if ($compiled) $compiled.textContent = lines.join("\n\n");
  }

  /* ── Actions: Copy / Reset / Back / Delete ─────── */

  function copyOutput() {
    try {
      navigator.clipboard.writeText($compiled.textContent || "");
    } catch (e) {
      console.warn("copy failed", e);
    }
  }

  function resetAll() {
    if (!confirm("Reset this instance? This will clear local changes.")) return;
    activeStack = [];
    var keys = Object.keys(varValues);
    keys.forEach(function (k) { delete varValues[k]; });
    if ($basePrompt) $basePrompt.value = "";
    try {
      State.save("yukti_stack", activeStack);
      State.save("yukti_vars", varValues);
      State.save("yukti_base", "");
      // update meta updated
      localStorage.setItem(INSTANCE_ID + "__meta_updated", JSON.stringify(new Date().toISOString()));
      try { window.dispatchEvent(new CustomEvent('ankura:meta-updated', { detail: { instance: INSTANCE_ID } })); } catch (e) {}
    } catch (e) {}
    renderDeck(); renderStack(); renderCompiled(); renderMeta();
  }

  function backToDashboard() {
    try {
      // update meta updated
      localStorage.setItem(INSTANCE_ID + "__meta_updated", JSON.stringify(new Date().toISOString()));
      try { window.dispatchEvent(new CustomEvent('ankura:meta-updated', { detail: { instance: INSTANCE_ID } })); } catch (e) {}
    } catch (e) {}
    window.location.href = "../index.html";
  }

  function deleteInstance() {
    if (!confirm("Delete data for this instance and close?")) return;
    try {
      var prefix = INSTANCE_ID + "__";
      var toRemove = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(prefix) === 0) toRemove.push(k);
      }
      toRemove.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {}
    try { sessionStorage.removeItem('ankura_instanceId'); } catch (e) {}
    // best-effort close
    try { window.close(); } catch (e) { window.location.href = '../index.html'; }
  }

  /* ── Meta rendering ────────────────────────────── */

  function parseTimestamp(raw) {
    if (!raw) return null;
    try { return new Date(JSON.parse(raw)); } catch (e) {}
    try { return new Date(raw); } catch (e) { return null; }
  }

  function renderMeta() {
    if (!$metaCreated && !$metaUpdated) return;
    var createdRaw = null;
    var updatedRaw = null;
    try { createdRaw = localStorage.getItem(INSTANCE_ID + '__meta_created'); } catch (e) {}
    try { updatedRaw = localStorage.getItem(INSTANCE_ID + '__meta_updated'); } catch (e) {}
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

  /* ── UI wiring ─────────────────────────────────── */

  function bindEvents() {
    if ($btnCopy) $btnCopy.addEventListener('click', copyOutput);
    if ($btnReset) $btnReset.addEventListener('click', resetAll);
    if ($btnBack) $btnBack.addEventListener('click', backToDashboard);
    if ($btnDelete) $btnDelete.addEventListener('click', deleteInstance);
    if ($searchInput) {
      $searchInput.addEventListener('input', function (e) { currentSearch = e.target.value || ''; renderDeck(); });
    }
  }

  function init() {
    initTheme();
    renderTagBar();
    renderDeck();
    renderStack();
    renderCompiled();
    bindEvents();
    try { renderMeta(); } catch (e) {}
  }

  // Expose for debugging (optional)
  window.YUKTI_DEBUG = { State: State, INSTANCE_ID: INSTANCE_ID };

  // start
  try { init(); } catch (e) { console.warn('init failed', e); }

})();
