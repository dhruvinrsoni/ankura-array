/**
 * Ankura-Array — Dashboard Config
 * ───────────────────────────────
 * Code-level "control panel" for opt-in dashboard behaviors.
 * Loaded via <script> in root index.html before app_registry.js.
 *
 * Flip flags here, commit, redeploy. No UI exposure.
 */
window.ANKURA_CONFIG = {
  /**
   * Hidden admin panel (Manage Apps — enable/disable apps).
   * Always reachable via the URL hash below.
   * Optionally: tap the "Ankura" title 7 times within 3 seconds to toggle.
   */
  admin: {
    hash: "#admin",          // visit index.html#admin to reveal the panel
    enableLogoMultiTap: true, // set false to require URL hash only
    multiTapCount: 7,
    multiTapWindowMs: 3000
  }
};
