# DEPRECATED — Gati-Grid

This folder contains the legacy `gati-grid` app. It has been replaced by `yatra-monitor`.

Why it remains here
- Kept as a safe rollback and reference while `yatra-monitor` is validated.
- Useful for debugging, comparing parser heuristics, or restoring behavior if needed.

Notes
- `gati-grid` has been removed from the active registry; it will not appear in the dashboard by default.
- Do not rely on this folder for active development. Prefer `yatra-monitor/`.

How to restore (if needed)
1. Re-add an entry for `gati-grid` in `app_registry.js` (copy the original metadata).
2. Ensure `gati-grid/index.html` includes `ankura-core.js` before `app.js`.

When ready to remove
- Move this folder to `archive/gati-grid/` or delete it after you are confident `yatra-monitor` is fully validated and no rollback will be necessary.

Contact
- If you want me to archive or delete this folder, tell me which option you prefer and I will perform it.
