/**
 * ──────────────────────────────────────────────────────────────
 * ⚠️  DEPRECATED — DO NOT LOAD THIS FILE
 * ──────────────────────────────────────────────────────────────
 * This file was a temporary workaround for Jekyll (GitHub Pages)
 * which ignores files whose names start with an underscore (_).
 * That problem is solved at the repo level via a `.nojekyll` file
 * in the root, so this underscore variant is no longer needed.
 *
 * THE ONE TRUE REGISTRY: `app_registry.js` (no underscore)
 *
 * HOW TO FIX any file that still loads this:
 *   Change:  <script src="../_app_registry.js"></script>
 *   To:      <script src="../app_registry.js"></script>
 *
 * This file intentionally does NOT define window.ANKURA_REGISTRY
 * so that loading it by mistake produces a loud, obvious runtime
 * error rather than silent stale data.
 * ──────────────────────────────────────────────────────────────
 */
(function () {
  var msg =
    "[Ankura-Array] _app_registry.js is DEPRECATED. " +
    "Load app_registry.js instead (no underscore). " +
    "See the comment at the top of this file for migration steps.";
  // Surface the error in the console, the UI, and as a thrown exception
  // so neither a human nor an LLM can miss it.
  if (typeof console !== "undefined" && console.error) {
    console.error(msg);
  }
  var banner = document.createElement("div");
  banner.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:99999;" +
    "background:#b91c1c;color:#fff;font:bold 14px/1.5 monospace;" +
    "padding:10px 16px;text-align:center;";
  banner.textContent = "⚠️ " + msg;
  document.documentElement.appendChild(banner);
  throw new Error(msg);
})();

