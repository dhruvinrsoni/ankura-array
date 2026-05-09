/* ankura-core.js — Shared framework for all Ankura nano-apps
   Exposes window.AnkuraCore
   Protocol version: 1
*/
window.AnkuraCore = (function () {
  'use strict';

  /* ── Utilities ────────────────────────────────────────── */
  function isoNow() { return new Date().toISOString(); }

  /* ── Global app enable/disable registry ───────────────── */
  // Stored as a JSON array of appIds in localStorage under 'ankura_disabled_apps'.
  // Sibling to 'ankura_theme' — global, not instance-scoped.
  var DISABLED_KEY = 'ankura_disabled_apps';

  function getDisabledApps() {
    try {
      var raw = localStorage.getItem(DISABLED_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function setDisabledApps(arr) {
    try { localStorage.setItem(DISABLED_KEY, JSON.stringify(arr || [])); } catch (e) {}
  }
  function isAppDisabled(appId) {
    if (!appId) return false;
    return getDisabledApps().indexOf(appId) !== -1;
  }
  // Derive appId from URL when not passed explicitly.
  // Works for /<root>/<appId>/index.html, /<root>/<appId>/, etc.
  function getCurrentAppId() {
    try {
      var p = location.pathname.replace(/\/index\.html$/, '').replace(/\/$/, '');
      var segs = p.split('/');
      return segs[segs.length - 1] || null;
    } catch (e) { return null; }
  }

  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /* ── Instance identity ────────────────────────────────── */
  function initInstanceId() {
    var params = new URLSearchParams(window.location.search);
    var id = params.get('instanceId');
    var now = isoNow();
    if (id) {
      sessionStorage.setItem('ankura_instanceId', id);
      try {
        if (!localStorage.getItem(id + '__meta_created')) localStorage.setItem(id + '__meta_created', JSON.stringify(now));
        localStorage.setItem(id + '__meta_updated', JSON.stringify(now));
      } catch (e) {}
      return id;
    }
    id = sessionStorage.getItem('ankura_instanceId');
    if (id) {
      try {
        if (!localStorage.getItem(id + '__meta_created')) localStorage.setItem(id + '__meta_created', JSON.stringify(now));
        localStorage.setItem(id + '__meta_updated', JSON.stringify(now));
      } catch (e) {}
      return id;
    }
    id = uuid();
    sessionStorage.setItem('ankura_instanceId', id);
    try {
      localStorage.setItem(id + '__meta_created', JSON.stringify(now));
      localStorage.setItem(id + '__meta_updated', JSON.stringify(now));
    } catch (e) {}
    try {
      var newUrl = window.location.pathname + '?instanceId=' + id + window.location.hash;
      window.history.replaceState(null, '', newUrl);
    } catch (e) {}
    return id;
  }

  /* ── State manager ────────────────────────────────────── */
  function makeState(instanceId) {
    function touchMeta() {
      try { localStorage.setItem(instanceId + '__meta_updated', JSON.stringify(isoNow())); } catch (e) {}
      try { window.dispatchEvent(new CustomEvent('ankura:meta-updated', { detail: { instance: instanceId } })); } catch (e) {}
    }
    return {
      _key: function (name) { return instanceId + '__' + name; },
      save: function (name, value) {
        try { localStorage.setItem(instanceId + '__' + name, JSON.stringify(value)); touchMeta(); } catch (e) {}
      },
      load: function (name, fallback) {
        try { var raw = localStorage.getItem(instanceId + '__' + name); return raw !== null ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
      },
      clear: function (name) {
        try { localStorage.removeItem(instanceId + '__' + name); touchMeta(); } catch (e) {}
      },
      clearAll: function () {
        try {
          Object.keys(localStorage).forEach(function (k) {
            if (k.indexOf(instanceId + '__') === 0) localStorage.removeItem(k);
          });
          try { sessionStorage.removeItem('ankura_instanceId'); } catch (e) {}
        } catch (e) {}
      }
    };
  }

  /* ── Meta renderer ────────────────────────────────────── */
  function renderMeta(instanceId) {
    try {
      var rawC = localStorage.getItem(instanceId + '__meta_created');
      var rawU = localStorage.getItem(instanceId + '__meta_updated');
      var elC = document.getElementById('meta-created');
      var elU = document.getElementById('meta-updated');
      if (elC) {
        if (rawC) { try { var jc = JSON.parse(rawC); elC.textContent = 'Created: ' + new Date(jc).toLocaleString(); elC.title = jc; } catch (e) { elC.textContent = 'Created: ' + rawC; elC.title = rawC; } }
        else { elC.textContent = 'Created: —'; }
      }
      if (elU) {
        if (rawU) { try { var ju = JSON.parse(rawU); elU.textContent = 'Updated: ' + new Date(ju).toLocaleString(); elU.title = ju; } catch (e) { elU.textContent = 'Updated: ' + rawU; elU.title = rawU; } }
        else { elU.textContent = 'Updated: —'; }
      }
    } catch (e) {}
  }

  /* ── Theme ────────────────────────────────────────────── */
  function applyTheme(mode) {
    var useDark = false;
    if (mode === 'dark') { useDark = true; }
    else if (mode === 'auto') { try { useDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) {} }
    document.body.classList.toggle('dark-theme', useDark);
    document.body.classList.toggle('light-theme', !useDark);
  }

  /* ── Button + theme wiring ────────────────────────────── */
  function wireButtons(instanceId, State, opts) {
    opts = opts || {};
    var backUrl = opts.backUrl || '../index.html';

    var btnBack   = document.getElementById('btn-back');
    var btnDelete = document.getElementById('btn-delete');
    var btnReset  = document.getElementById('btn-reset');
    var themeSelect = document.getElementById('theme-select');

    if (btnBack) btnBack.addEventListener('click', function () {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        // Opened in a new tab (ctrl+click / shift+click) — close it
        window.close();
        // Fallback: if browser blocks close(), navigate after a short delay
        setTimeout(function () { window.location.href = backUrl; }, 200);
      }
    });

    if (btnDelete) btnDelete.addEventListener('click', function () {
      if (opts.onDelete) opts.onDelete();
      else { try { State.clearAll(); } catch (e) {} }
      try { window.close(); } catch (e) { window.location.href = backUrl; }
    });

    if (btnReset && opts.onReset) btnReset.addEventListener('click', opts.onReset);

    if (themeSelect) {
      var saved = State.load('theme', 'auto');
      try { themeSelect.value = saved; } catch (e) {}
      applyTheme(saved);
      themeSelect.addEventListener('change', function () {
        var v = themeSelect.value || 'auto';
        State.save('theme', v);
        applyTheme(v);
      });
    }
  }

  /* ── Disabled-app screen (replaces page body when app is disabled) ─ */
  function renderDisabledScreen(appId, backUrl) {
    var label = appId ? appId.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }) : 'This app';
    document.title = label + ' — Disabled';
    var bg   = 'background: var(--bg-color, #1a1a1a); color: var(--text-color, #e8e6e3);';
    var card = 'background: var(--bg-card, #2d2d2d); border: 1px solid var(--border, #3d3d3d); border-radius: 12px; padding: 2.25rem 2rem; max-width: 460px; text-align: center; box-shadow: 0 8px 24px rgba(0,0,0,0.4);';
    var btn  = 'display: inline-block; margin-top: 1.25rem; padding: 0.55rem 1rem; background: var(--accent, #d4a03c); color: #11110e; text-decoration: none; border-radius: 8px; font-weight: 500;';
    document.body.innerHTML =
      '<div data-ankura-disabled="1" style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1.5rem; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif; ' + bg + '">' +
        '<div style="' + card + '">' +
          '<div style="font-size: 3rem; line-height: 1; margin-bottom: 0.5rem">🚫</div>' +
          '<h1 style="font-size: 1.4rem; margin: 0 0 0.4rem; color: var(--accent, #d4a03c);">' + label + ' is disabled</h1>' +
          '<p style="font-size: 0.92rem; line-height: 1.5; margin: 0; color: var(--text-secondary, #a09b93);">This app has been disabled from the Ankura-Array dashboard. Re-enable it under <strong>Manage apps</strong> to access it again.</p>' +
          '<a href="' + (backUrl || '../index.html') + '" style="' + btn + '">← Back to dashboard</a>' +
        '</div>' +
      '</div>';
  }

  /* ── Main init ────────────────────────────────────────── */
  /**
   * AnkuraCore.init(opts)
   * opts: { backUrl, onReset, onDelete, appId }
   * returns: { instanceId, State, renderMeta }
   *
   * If the current app is in the global disabled list (ankura_disabled_apps),
   * init() short-circuits, replaces the page with a disabled screen, and
   * returns a stub object so callers don't crash if they invoke methods.
   */
  function init(opts) {
    opts = opts || {};
    var appId = opts.appId || getCurrentAppId();
    var backUrl = opts.backUrl || '../index.html';

    function showDisabled() { renderDisabledScreen(appId, backUrl); }
    function applyDisabledIfNeeded() {
      if (isAppDisabled(appId)) {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', showDisabled);
        } else {
          showDisabled();
        }
        return true;
      }
      return false;
    }

    // Cross-tab live sync: react to dashboard toggling apps in another tab.
    window.addEventListener('storage', function (ev) {
      if (ev.key !== DISABLED_KEY) return;
      var nowDisabled = isAppDisabled(appId);
      var hasDisabledScreen = !!document.querySelector('[data-ankura-disabled]');
      if (nowDisabled && !hasDisabledScreen) {
        showDisabled();
      } else if (!nowDisabled && hasDisabledScreen) {
        // Re-enabled in another tab — reload to restore the live app
        try { window.location.reload(); } catch (e) {}
      }
    });

    if (applyDisabledIfNeeded()) {
      // Stub State so any caller code that runs synchronously won't blow up
      var noopState = { save: function(){}, load: function(_,f){return f;}, clear: function(){}, clearAll: function(){}, _key: function(n){return n;} };
      return { instanceId: '', State: noopState, renderMeta: function(){}, disabled: true };
    }

    var instanceId = initInstanceId();
    var State = makeState(instanceId);

    window.addEventListener('ankura:meta-updated', function (ev) {
      if (ev && ev.detail && ev.detail.instance === instanceId) renderMeta(instanceId);
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        wireButtons(instanceId, State, opts);
        renderMeta(instanceId);
      });
    } else {
      wireButtons(instanceId, State, opts);
      renderMeta(instanceId);
    }

    return {
      instanceId: instanceId,
      State: State,
      renderMeta: function () { renderMeta(instanceId); }
    };
  }

  /* ── Public API ───────────────────────────────────────── */
  return {
    init: init,
    applyTheme: applyTheme,
    makeState: makeState,
    renderMeta: renderMeta,
    getDisabledApps: getDisabledApps,
    setDisabledApps: setDisabledApps,
    isAppDisabled: isAppDisabled,
    getCurrentAppId: getCurrentAppId
  };
})();
