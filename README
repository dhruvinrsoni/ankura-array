Ankura-Array
=================

A digital garden of "Once in and all like Done and Dusted" nano-applications.

▼ Why this thing exists
-----------------------

This repository is an ugly, honest, technical home for tiny apps that do one thing well and keep their state where you can see it — in plain files, in the browser, and without any nonsense build chain. If you can open it with `file://` and it still works, it's doing its job.

**Nomenclature**

<details>
<summary>▼ Why the name 'Ankura-Array'? (The Naming Log)</summary>

We argued about the name for too long. Names matter because they're mental models; they say what the project thinks it is. What follows is the dev diary version of that argument, warts and all.

Core conflict: we wanted to fuse two things that each carry weight — Vedic/Sanatani concepts (the Soul) and modern engineering terms (the Body). The Soul gives intention and humility; the Body gives structure and chewable primitives for programmers.

Rejected Candidates (and why they failed, brutally honest):

- Ankura-Grid: "Good, but too rigid. Felt like a prison."
- Srijan-Forge: "Too heavy. Sounds like an industrial factory, not a garden."
- Bindu-Base: "Just... awkward. Hard pass."
- Beej-Bay: "Disconnected. Words didn't talk to each other."
- Yukti-Stack: "The absolute worst. Rejected immediately."
- Anu-Shard: "Too extreme. Lost the plot."

Winner: Ankura-Array

- Ankura (Sprout): The atomic unit of potential — small, quiet, expects sunlight. It's the idea that a nano-app is not a finished product, it's a lived-in seed.
- Array (Structure): A practical, literal word for what holds the project together — a JavaScript array inside a tiny registry file (`_app_registry.js`). It honors the code: the mental model should point at the implementation, not a marketing adjective.

</details>

Vaak-Smith — a quick note
-------------------------

Even the first app had an identity crisis. It started as "LLM Prompt Builder" (boring), flirted with "Aadesh-Auth" (too aggressive), and then settled on **Vaak-Smith** — the smith of speech. Prompting is not just text; it's a way of speaking with intent. The app builds that speech.

Done and Dusted Manifesto
-------------------------

This project is deliberately stubborn about a few things. The guiding principles are short and non-negotiable:

- No build steps. No transpilers. No hidden toolchains that make the repo fragile.
- No node_modules sitting in the tree. If you want dependencies, you pin them explicitly and manage them outside the repo.
- Works on `file://`. Open an `index.html` and it should work. No dev server required for development sanity.
- Tiny, composable apps. Each nano-app is one folder, one HTML, a bit of CSS and JS, maybe a small config file. Keep the mental overhead low.
- Protocol A — Script-injected registry: apps are discovered by a small global registry script (the literal array I mentioned). This avoids fetch/CORS problems in local contexts and makes launching apps trivial.
- Protocol B — Per-tab instance identity: when you open an app, it either uses the `?instanceId=` from the URL or creates a tab-scoped identity and namespaces all localStorage keys with it. You get per-tab, non-colliding drafts and no surprise overwrites.
- UX > ceremony. The UI should favor simple, discoverable controls over layers of abstraction. Save drafts automatically, provide lossless exports, and avoid surprises.

Longevity claim (yes, it's a claim):

If this repo is still around in 2050 and browsers haven't completely reinvented the DOM, Ankura-Array will still open and let you tinker. That's the yardstick we used when making design choices: simple, durable, explainable.

Contributing (short)
--------------------

I want small, clear patches. If you add a nano-app:

1. Add a small folder at the repo root.
2. Add an `index.html`, `style.css` (optional), `app.js` (optional), and a tiny entry in the registry script.
3. No build steps. No registration ceremony.

If you have a strong opinion about names, please write it down in a PR. This README has been edited in the open; keep that spirit.

License
-------

This is free software. Do what you want, but don't be a jerk.

— The maintainer
