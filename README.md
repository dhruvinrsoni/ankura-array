# 🌱 Ankura-Array (अंकुर-Array) ▦▦▦ 🪴

*A digital incubator for high-precision, offline-first nano applications.*

![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)
![Tech: Vanilla JS](https://img.shields.io/badge/tech-Vanilla%20JS-yellow.svg)
![Status: Active](https://img.shields.io/badge/status-active-brightgreen.svg)

---

## 🔧 The Idea (Raw)

Ankura-Array is a small, opinionated collection of single-purpose web tools — "nano-apps" — that you can open, use, and understand without a package manager, build pipeline or server. These apps are made to be durable: open `index.html` locally (`file://`), and they still work.

Each nano-app is deliberately small: the mental model is ship tiny, document everything, avoid friction.

## 🧾 The Nomenclature: Why "Ankura-Array"? (▼)

<details>
<summary>▼ The Nomenclature: Why 'Ankura-Array'?</summary>

Short version: we wanted a name that married meaning and implementation.

- Concept: blend Vedic meaning (the Soul) with practical engineering (the Body).
- Rejected names and reasons (dev-diary tone):
  - *Ankura-Grid* — Too rigid; felt like a prison.
  - *Srijan-Forge* — Too heavy; industrial, not a garden.
  - *Beej-Byte* — Nice sound, but disconnected.

- The winner: **Ankura** (sprout/potential) + **Array** (the literal JS structure that holds apps). It points at the code and keeps humility in the name.

First app: **Vaak-Smith** — the smith of speech. Prompting is speech with intent.

</details>

## 🗂️ The Array (Apps)

| App Name | Description | Status | Launch |
|---|---|:---:|---|
| Vaak-Smith | Precision prompt engineering cockpit for LLMs. | ✅ Live | [Launch](./vaak-smith/index.html) |

More tiny tools will be added over time. Each app should be understandable by reading its folder.

## ✨ Key Principles

- **Zero dependencies.** No `npm install` or `node_modules` required to use the apps.
- **Protocol-agnostic.** Works on GitHub Pages and `file://` (no fetch/CORS failures for the dashboard).
- **State isolation.** Per-tab `instanceId` prevents accidental cross-tab overwrites.
- **Privacy-first.** Data stays in the browser unless you explicitly wire an integration.

## 🏗 Technical Architecture (brief)

- **Registry pattern (script injection).** The dashboard loads a tiny registry script (`app_registry.js`) with a JS array of app descriptors. Loading via a `<script>` avoids fetch/CORS issues when opening files locally.

- **Instance Identity Protocol.** Apps accept an optional `?instanceId=` URL parameter. If absent, the app generates a UUID and persists it in `sessionStorage`. All persistent keys are namespaced with the instance ID (e.g., `${instanceId}__system`) so multiple tabs can hold independent drafts.

## 🚀 Install & Use

Clone the repo and open the dashboard or any app directly.

```bash
git clone https://github.com/dhruvinrsoni/ankura-array.git
cd ankura-array
# Option A: open the dashboard directly (double-click index.html or open via file://)
# Option B: run a quick local server and browse (recommended for convenience):
python -m http.server 8000
# then open http://localhost:8000

[Click to open the local server: http://localhost:8000](http://localhost:8000)
```

Open `vaak-smith/index.html` to try the first app.

## 🔍 Privacy & Security

By default, apps store data client-side in `localStorage` and `sessionStorage`. Integration with remote APIs must be explicit and opt-in per app.

## 🤝 Contributing

Small, well-documented PRs welcome. To add a nano-app:

1. Create a directory at the repository root.
2. Add `index.html` (required) and optionally `style.css`, `app.js`, and a tiny README.
3. Add an entry to `app_registry.js` following existing examples.
4. Keep it build-free; document any external steps in the app's README.

## 📄 License

Apache License 2.0 — see `LICENSE`.

---

If you want a PR template, contributor guide, CI check (e.g., prevent `node_modules`), or a prettier homepage, tell me and I will add it.

— The maintainer
