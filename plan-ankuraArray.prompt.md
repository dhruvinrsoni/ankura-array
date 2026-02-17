# Plan: Scaffold Ankura-Array Platform

**TL;DR:** Build a zero-dependency, offline-first "Garden of Apps" platform from scratch in a clean repo (currently just LICENSE). The platform consists of a dashboard (`index.html`) that reads a script-injected registry to render app cards, plus a first nano app — "LLM Prompt Builder." All state is isolated per tab via UUID-namespaced `localStorage` keys (Protocol B), and all config is loaded via `<script>` tags to ensure `file://` compatibility (Protocol A). Color palette: warm dark (#1a1a1a / #2d2d2d) with amber/gold accents. Framework templates split across System Instructions (persona/role) and User Prompt (task-specific). LLM configs use current model names. Copy Markdown renders structured `##` headings.

---

**Steps**

## Step 1: Create the File Structure

Create all 7 files:

```
/ankura-array/
├── index.html           ← Platform dashboard
├── style.css            ← Dashboard styles
├── _app_registry.js     ← Script-injected app registry
└── nanoapps/
    └── llm-prompt-builder/
        ├── index.html   ← Prompt Builder UI
        ├── app.js       ← Core logic + Protocol B
        ├── style.css    ← App-specific styles
        └── llmConfigs.js ← Script-injected LLM data
```

## Step 2: `_app_registry.js` — The Registry

- Assign `window.ANKURA_REGISTRY` as an array of app descriptor objects
- First entry: `{ id: "llm-prompt-builder", name: "LLM Prompt Builder", description: "...", icon: "🧠", path: "nanoapps/llm-prompt-builder/index.html" }`
- Future apps are added by appending to this array — no other changes needed

## Step 3: Root `index.html` — The Dashboard

- Load `_app_registry.js` via `<script>` before main logic (Protocol A)
- Load `style.css`
- On `DOMContentLoaded`: iterate `window.ANKURA_REGISTRY`, render a card grid
- Each card shows `icon`, `name`, `description`, a "Launch" button
- **Launch handler:** generate UUID via `crypto.randomUUID()`, open `app.path + "?instanceId=" + uuid` in a new tab (`window.open` with `_blank`)
- Inline `<script>` at bottom — keeps it self-contained, no separate JS file needed for the dashboard (it's ~30 lines of logic)
- `<meta charset="UTF-8">`, `<meta name="viewport" ...>`, semantic HTML5

## Step 4: Root `style.css` — Dashboard Styling

- CSS custom properties for the warm dark palette:
  - `--bg-primary: #1a1a1a`, `--bg-card: #2d2d2d`, `--bg-card-hover: #3a3a3a`
  - `--accent: #d4a03c` (amber/gold), `--accent-hover: #e8b84a`
  - `--text-primary: #e8e6e3`, `--text-secondary: #a09b93`
  - `--border: #3d3d3d`, `--radius: 12px`
- `box-sizing: border-box` reset, system font stack
- CSS Grid layout for cards: `grid-template-columns: repeat(auto-fill, minmax(300px, 1fr))`
- Card: subtle border, rounded corners, hover lift (`transform: translateY(-2px)`, box-shadow transition)
- Responsive: single column on mobile

## Step 5: `nanoapps/llm-prompt-builder/llmConfigs.js` — Data Model

Assign `window.LLM_CONFIGS` with two properties:

- **`PROVIDERS`** — object keyed by provider ID:
  - `openai`: name "OpenAI", model "GPT-4o", temp range [0, 2], default 1.0, topP range [0, 1], default 1.0, maxTokens 4096
  - `anthropic`: name "Anthropic", model "Claude 3.5 Sonnet", temp range [0, 1], default 1.0, topP range [0, 1], default 0.999, maxTokens 8192
  - `google`: name "Google", model "Gemini 1.5 Pro", temp range [0, 2], default 1.0, topP range [0, 1], default 0.95, maxTokens 8192

- **`FRAMEWORKS`** — object keyed by framework ID:
  - `google-standard`:
    - `name`: "Google Standard"
    - `sections`: array of `{ label, placeholder, target }` where `target` is `"system"` or `"user"`
    - Persona → `target: "system"` (placeholder: "Act as a [Persona]…")
    - Task, Context, Format → `target: "user"` (structured as "Your task is to [Task]…\nContext: [Context]…\nFormat: [Format]…")
    - `systemTemplate`: "Act as a {{Persona}}. You are an expert in..."
    - `userTemplate`: "Your task is to {{Task}}.\n\nHere is the context:\n{{Context}}\n\nPlease format the output as:\n{{Format}}"
  - `copilot-gcse`:
    - `name`: "Copilot G.C.S.E."
    - Goal → `target: "user"`, Context → `target: "user"`, Source → `target: "system"`, Expectations → `target: "user"`
    - `systemTemplate`: "# SOURCE\n{{Source}}"
    - `userTemplate`: "# GOAL\n{{Goal}}\n\n# CONTEXT\n{{Context}}\n\n# EXPECTATIONS\n{{Expectations}}"

## Step 6: `nanoapps/llm-prompt-builder/index.html` — App UI

- Load `llmConfigs.js` via `<script>` first (Protocol A)
- Load `style.css`, then `app.js` (deferred)
- Semantic layout:
  - **Top Bar:** `<header>` with app title "LLM Prompt Builder" + `<button id="btn-reset">` Reset
  - **Config Section:** Two `<select>` dropdowns — `#select-provider`, `#select-framework`
  - **Editor Zone:**
    - `<textarea id="system-instructions">` (large, ~6 rows) with label "System Instructions"
    - `<textarea id="user-prompt">` (large, ~8 rows) with label "User Prompt"
    - **Parameter sliders:** `<input type="range" id="slider-temp">` and `<input type="range" id="slider-topp">` with live value display `<span>` — `step="0.01"`, min/max set dynamically by provider
  - **Output Preview:** `<pre id="output-preview">` read-only rendered view of assembled prompt
  - **Action Buttons:** `<button id="btn-copy-plain">` Copy Plain, `<button id="btn-copy-markdown">` Copy Markdown

## Step 7: `nanoapps/llm-prompt-builder/style.css` — App Styling

- Same warm dark palette via CSS custom properties (duplicated for `file://` independence — no cross-file `@import` issues)
- Two-column layout on desktop (editor left, preview right) using CSS Grid; stacked on mobile
- Textareas: dark background (`#252525`), monospace font, `resize: vertical`, amber focus ring
- Sliders: custom styled `::-webkit-slider-thumb` with amber accent
- Buttons: outlined style, amber border, hover fill transition
- Copied feedback: brief CSS animation or text change ("Copied!")

## Step 8: `nanoapps/llm-prompt-builder/app.js` — Core Logic

This is the most complex file. Structure as an IIFE or top-level module:

### 8a. Protocol B — Instance Identity

```
function initInstanceId():
  1. Read `instanceId` from URL search params
  2. If present → store in sessionStorage('ankura_instanceId')
  3. If missing → check sessionStorage
  4. If still missing → generate via crypto.randomUUID(), store in sessionStorage, 
     history.replaceState(null, '', location.pathname + '?instanceId=' + newId)
  5. Return the instanceId
```

### 8b. State Manager — Namespaced LocalStorage

- `save(key, value)` → `localStorage.setItem(instanceId + '__' + key, value)`
- `load(key)` → `localStorage.getItem(instanceId + '__' + key)`
- `clearAll()` → iterate `localStorage`, remove keys starting with `instanceId + '__'`

### 8c. Debounce Utility

- `debounce(fn, delay=500)` → standard debounce returning a wrapper that clears/resets timeout

### 8d. Hydration (On Load)

1. Call `initInstanceId()`
2. Populate provider dropdown from `window.LLM_CONFIGS.PROVIDERS`
3. Populate framework dropdown from `window.LLM_CONFIGS.FRAMEWORKS` (+ "None" option)
4. Load saved values from `localStorage` for: selected provider, selected framework, system instructions text, user prompt text, temperature, topP
5. If saved values exist → populate fields; otherwise leave defaults
6. Update slider min/max/step based on selected provider
7. Render output preview

### 8e. Event Listeners

- `#select-provider` → `change`: update slider ranges from provider config, save selection, re-render preview
- `#select-framework` → `change`: apply framework template split (system parts → system textarea, user parts → user textarea) — only populate if textarea is empty OR append with separator if it has content; save selection
- `#system-instructions` and `#user-prompt` → `input`: debounced save to `localStorage`, live re-render preview
- `#slider-temp` and `#slider-topp` → `input`: update display value, debounced save, re-render preview
- `#btn-reset` → `click`: confirm dialog → `clearAll()` from state manager, reset all fields to defaults, clear preview
- `#btn-copy-plain` → `click`: copy assembled plain text to clipboard via `navigator.clipboard.writeText()`
- `#btn-copy-markdown` → `click`: copy assembled Markdown (## headings for System Instructions, User Prompt, Parameters) to clipboard

### 8f. Output Assembly

- `renderPreview()`: constructs the final prompt string from current field values
- Plain format: concatenates "System: ...\n\nUser: ...\n\nParameters: temp=X, topP=Y, model=Z"
- Markdown format: `## System Instructions\n{text}\n\n## User Prompt\n{text}\n\n## Parameters\n- Model: ...\n- Temperature: ...\n- Top P: ...`
- Preview panel shows the plain text version live

---

## Verification

1. **File:// test:** Open `index.html` directly in browser from file system → dashboard should render cards from registry → clicking Launch should open the prompt builder with `?instanceId=...` in URL
2. **HTTPS test:** Deploy to GitHub Pages (push to `main` with Pages enabled) → same behavior
3. **State isolation test:** Open two instances of LLM Prompt Builder → type different text in each → refresh both → each should restore its own independent state
4. **Self-healing test:** Open `nanoapps/llm-prompt-builder/index.html` directly (no `?instanceId`) → URL should update with a generated ID via `replaceState`
5. **Lossless draft test:** Type in a textarea → close tab → reopen same instance URL → text should be restored
6. **Reset test:** Click Reset → confirm → all fields clear, `localStorage` keys for that instance removed
7. **Copy test:** Click Copy Plain / Copy Markdown → paste in text editor → verify structure

## Decisions

- **Model names:** Using current names (GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro) per user preference
- **Copy Markdown:** Structured `##` headings format, not fenced code block
- **Color palette:** Warm dark (#1a1a1a, #2d2d2d) with amber/gold (#d4a03c) accents
- **Framework template split:** Persona/Role/Source sections → System Instructions textarea; Task/Context/Format/Goal/Expectations → User Prompt textarea
- **Dashboard JS:** Inlined in `index.html` (trivial logic, keeps file count minimal)
- **No shared CSS:** Each app has its own `style.css` with duplicated custom properties — ensures `file://` independence and zero cross-file coupling
- **Debounce delay:** 500ms — balances responsiveness with storage write frequency
