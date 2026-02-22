# Ankura Nano-App Skill
Protocol for creating or modifying apps in the Ankura Array workspace.

---

## Required HTML elements

| id | purpose |
|----|---------|
| `meta-created` | Shows instance creation timestamp |
| `meta-updated` | Shows instance last-updated timestamp |
| `btn-back` | Navigate back to `../index.html` |
| `btn-reset` | App-specific reset (data only) |
| `btn-delete` | Destroy instance + close tab |
| `theme-select` | `<select>` with values `auto` / `light` / `dark` |

---

## Required scripts (in `<head>`, before app.js)

```html
<script src="../app_registry.js"></script>
<script src="../ankura-core.js"></script>
```

For apps that depend on a third-party lib loaded dynamically (e.g. pdf.js),
load `ankura-core.js` **inside** the `startApp()` callback before loading `app.js`.

---

## Required JS init (top of app IIFE)

```javascript
var _fw = window.AnkuraCore.init({
  backUrl: '../index.html',   // optional, default: '../index.html'
  onReset: function(){ /* clear app data, re-render */ },
  onDelete: function(){
    /* clear app-specific keys (e.g. localStorage.removeItem(LOG_KEY)) */
    /* AnkuraCore calls State.clearAll() + closes tab if no onDelete */
  }
});
var INSTANCE_ID = _fw.instanceId;
var State        = _fw.State;
```

---

## State rules

- **All** `localStorage` reads/writes go through `State.save(name, value)` / `State.load(name, fallback)` / `State.clear(name)`.
- Keys are auto-namespaced: `instanceId + '__' + name`.
- `State.save` and `State.clear` auto-update `__meta_updated` and fire `ankura:meta-updated`.
- `State.clearAll()` removes every key prefixed with `instanceId + '__'`.
- App-global keys (e.g. shared logs) may use `localStorage` directly — document them in the app.

---

## Theme rules

- Theme is stored via `State.save('theme', value)` where value ∈ `{ 'auto', 'light', 'dark' }`.
- `AnkuraCore.init()` wires `#theme-select` and calls `AnkuraCore.applyTheme(mode)` on change.
- Do **not** manually wire the theme select or call `applyTheme` in app code.

---

## Dashboard registration

Add the app to `/app_registry.js`:

```javascript
{ id: 'my-app', name: 'My App', icon: '🔧', path: 'my-app/index.html', description: '…' }
```

Add key detection to `getInstanceRegistry()` in `/index.html` (checks `localStorage` keys to match instances to apps):

```javascript
if(dk.indexOf('my-app-prefix') !== -1) instances[instanceId].apps.add('my-app');
```

---

## Minimal app checklist

- [ ] `ankura-core.js` loaded before `app.js`  
- [ ] `AnkuraCore.init(...)` called at top of IIFE — returns `{ instanceId, State, renderMeta }`  
- [ ] All localStorage via `State.*`  
- [ ] `#meta-created`, `#meta-updated`, `#btn-back`, `#btn-reset`, `#btn-delete`, `#theme-select` present in HTML  
- [ ] Registered in `app_registry.js`  
- [ ] Key prefix registered in dashboard `getInstanceRegistry()`  
