/* ankura-core.js — Shared framework for all Ankura nano-apps
   Exposes window.AnkuraCore
   Protocol version: 1
*/
window.AnkuraCore = (function () {
  'use strict';

  /* ── Utilities ────────────────────────────────────────── */
  function isoNow() { return new Date().toISOString(); }

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

    if (btnBack) btnBack.addEventListener('click', function () { window.location.href = backUrl; });

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

  /* ── Main init ────────────────────────────────────────── */
  /**
   * AnkuraCore.init(opts)
   * opts: { backUrl, onReset, onDelete }
   * returns: { instanceId, State, renderMeta }
   */
  function init(opts) {
    opts = opts || {};
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
  return { init: init, applyTheme: applyTheme, makeState: makeState, renderMeta: renderMeta };
})();
