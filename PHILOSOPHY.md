# Ankura Array — Philosophy

> *"You are spawning universes every time you prompt. Some of you are making very shitty universes which are very generic."*

This document is not surface-level documentation. It is a deep dive into the foundational philosophy of every nano app in the Ankura Array — why each one exists, the core beliefs that shaped its design, and the laws that govern this universe.

---

## The Core Thesis

### Why "Nano Apps"?

The word is deliberate. Not "micro." Not "macro." **Nano.**

A nano app solves one problem, solves it deeply, and refuses to bloat. The constraint is the feature. When you limit scope to a single-purpose tool, every line of code serves the mission. There is no feature committee, no backlog of compromises, no "we'll add that in v2 to satisfy stakeholders." The constraint breeds creativity — you must find elegant solutions within a tight box rather than throwing complexity at the problem.

This is not minimalism for its own sake. It is a design philosophy rooted in respect for the user's attention. Every feature you add is a tax on comprehension. Nano apps pay zero tax.

### Offline-First: A Philosophical Choice

Ankura apps work on `file://`. You can double-click `index.html` from your desktop, no server, no internet, no build step, no deploy pipeline. This is not a technical limitation. It is a philosophical stance.

When your tool works offline, you are saying: **your data never leaves your machine.** There is no analytics endpoint phoning home. There is no cloud dependency that can be revoked, rate-limited, or monetised against you. The user owns the tool the same way they own a hammer — completely, unconditionally, and permanently.

`file://` compatibility is also the most democratic deployment target on Earth. It works in a browser on a $100 laptop in a village with no internet. It works in an air-gapped corporate environment where IT has locked down everything. It works 10 years from now when whatever cloud service would have shut down.

### Zero Dependencies: The Courage to Own Every Line

No React. No Vue. No Tailwind. No npm. No build tool. No transpiler.

Every line of JavaScript in this repo is vanilla ES5-compatible code running in an IIFE. Every CSS rule is hand-written. Every HTML file is a complete, self-contained document.

This is not anti-framework ideology. Frameworks are good when you need them. But a nano app doesn't need them. When you own every line, you understand every line. There is no supply chain to audit. There is no `node_modules` black hole. There is no version conflict that breaks your build on a Tuesday morning.

Zero dependencies means zero excuses.

---

## The Naming Philosophy

### Sanskrit + English: Bridging Worlds

Every app carries a Sanskrit name paired with an English word. This is not decoration. Each Sanskrit root encodes the app's essence:

| Sanskrit Root | Meaning | App | Why |
|---------------|---------|-----|-----|
| **Vaak** (वाक्) | Speech, utterance, the power of the word | Vaak-Smith | Prompting is the act of speech directed at an intelligence. The "smith" forges that speech into a weapon. |
| **Gati** (गति) | Movement, journey, velocity | Gati-Grid | Tracks physical movement — train journeys parsed from ticket data into a navigable grid. |
| **Yukti** (युक्ति) | Wisdom, strategy, a clever device | GenAI-Yukti-Deck | Each card in the deck is a *yukti* — a named strategic device for prompt engineering. |
| **Tula** (तुला) | Balance, the scales, measurement | Tula-Bench | A balance for weighing AI tool quality, moment by moment, through calibrated sentiment. |
| **Ankura** (अङ्कुर) | Sprout, seedling, new growth | Ankura Array (the collection) | The whole project is a seedling — small tools that grow from simple roots. |

The naming convention serves a deeper purpose: it forces the creator to distil the app's essence into a single concept before writing a single line of code. If you can't name it in one word, you haven't understood it yet.

---

## Per-App Deep Dives

### Vaak-Smith — The Prompt Engineering Cockpit

**Core Belief:** Prompting is worldbuilding, not form-filling.

Most prompt engineering tools treat a prompt as a form: fill in role, fill in task, fill in context, click submit. Vaak-Smith rejects this. A prompt is not a form. A prompt is a **universe** you are creating for an AI to inhabit.

When you write a prompt, you are not transmitting a message. You are constraining a high-dimensional probability space. Every word you add collapses possibilities. A vague prompt leaves the AI in a vast, generic space where the most statistically likely (and therefore most boring) outputs dominate. A specific, worldbuilt prompt teleports the AI into a tight, rich, well-defined universe where the outputs are sharp, relevant, and surprising.

#### The 7 Principles

Vaak-Smith's design is informed by seven principles drawn from the intersection of applied psychology and machine learning:

1. **Audience-First** — Good writing is about what people *hear*, not what you *say*. Every framework includes an Audience field because the same task described for a junior dev vs. a C-suite exec produces radically different outputs. The AI needs to know who it is talking to.

2. **Atomic Units** — Start with shared ground truths. The Ground Truths field lets you set axioms — facts the AI must treat as the physics of its universe. These are the foundation stones. Everything else is built on top of them.

3. **Worldbuilding** — Each prompt creates a universe. The Worldbuilder framework makes this explicit: Audience → Ground Truths → World → Task → Examples → Output. You are not filling a form. You are authoring reality.

4. **Grounding with Examples** — One concrete input→output pair outperforms ten paragraphs of abstract instruction. Every framework includes an Examples section because concrete beats abstract, always.

5. **Cognitive Hospitality** — Reduce the cognitive load for the receiver. Simple, familiar language produces better AI outputs because the model can allocate more "attention" to the task and less to decoding your prompt. Quality dots and micro-tips nudge users toward this.

6. **Single Leverage Point** — Not all sections are equal. Each framework marks one section as the ⚡ leverage point — the field where your investment pays off most. For Worldbuilder, it's Examples. For The Architect, it's Action Checklist. This prevents the "engineering answer syndrome" of scattering effort across ten mediocre fields.

7. **Frame Shift** — Start in the audience's existing world, then gradually redirect. This principle is captured in the roadmap as a future exploration (multi-turn prompt chaining), because it exceeds the current nano-app scope.

#### Why Frameworks Are Thinking Scaffolds, Not Templates

A framework in Vaak-Smith is not a mad-lib. It is a thinking scaffold. Each framework enforces a particular *order of thought*:

- **Google Standard** forces you to think about persona first, because identity constrains everything downstream.
- **Copilot G.C.S.E.** forces you to define the goal before the context, preventing context-without-purpose drift.
- **Vivek-Kram** forces you to articulate where you're stuck before asking for a solution, because vague struggles get vague answers.
- **The Architect** forces you to write a numbered action checklist, because AI follows numbered lists more reliably than prose.
- **The Worldbuilder** forces you to define your audience and ground truths before even stating the task, because the universe must exist before anything can happen inside it.

#### Pre-Flight Task Types: Constraining the Universe Before You Build It

The "Define your universe" selector at the top of Vaak-Smith is not a filter. It is a dimensionality reducer. When you declare "I am building a Code Gen universe," the UI highlights the sections that matter most for that universe and fades the rest. This prevents the paralysis of staring at six empty fields with equal weight.

---

### Gati-Grid — The Travel Intelligence Grid

**Core Belief:** Your data should work for you, not a corporation.

IRCTC generates train ticket PDFs — dense, poorly formatted, opaque documents designed for printing, not querying. If you travel frequently by Indian Railways, you accumulate dozens of these files, each one a locked vault of your own travel history. Gati-Grid cracks those vaults open.

#### Patient, Forgiving Extraction

IRCTC PDFs are notoriously inconsistent. A table cell in one version is a floating text block in another. Rather than trusting structure, Gati-Grid treats the PDF as raw text and applies a layered regex strategy. It looks for labels first, then hunts for the value across the next one or two lines. When the primary extraction pattern fails, a fallback scan activates. This graceful degradation — trying harder rather than giving up — is rare in single-file web apps.

#### Transparent Parsing

Every parsing step is logged in a visible Parse Log panel — timestamped, colour-coded by severity, and persisted. The user can always see exactly what the parser found and why a field might be blank. This treats the user as a **collaborator**, not an end consumer. The philosophy: if the tool can't parse your ticket perfectly, it will at least tell you *why*, so you can manually correct the gap.

#### The Grid as a Thinking Tool

The data grid is not just a display. It is searchable, sortable, and column-configurable. You can ask questions of your own travel history: "How many times did I travel in Sleeper class last year?" or "Which routes did I take most?" The columns are schema-driven — adding a new field requires touching only one definition, and the header, cells, search indexing, and column-visibility toggles all derive from it.

#### Why IndexedDB + localStorage

PDF binary data (megabytes per file) lives in IndexedDB. Parsed metadata (kilobytes) lives in localStorage via the State API. This two-tier storage respects both the browser's limits and the user's expectation that their app will load instantly.

---

### GenAI-Yukti-Deck — The Prompt Hack Deck

**Core Belief:** Prompt engineering is a learnable craft, not magic.

There exists a body of knowledge about how to influence LLM behaviour — persona injection, chain-of-thought steering, output wrapping, formatting tricks, psychological framing techniques. This knowledge is scattered across research papers, blog posts, and Twitter threads. GenAI-Yukti-Deck externalises it as a **playable deck of named cards**, then gives you a workbench to compose them into a finished prompt.

#### Gamification as Pedagogy

Each card is named after its psychological exploit: "The False Memory," "The 'Obviously' Trap," "The Dissenter," "The $100 Bet." These names are intentional. Naming a technique is the first step to recognising when to use it. The deck format — browse, pick, stack, compile — makes prompt engineering feel like deck-building in a card game, not like writing a config file.

#### The Pipeline Protocol

The central insight is that prompt components are not interchangeable — they have a natural execution order:

| Layer | Role | Position |
|-------|------|----------|
| L1 | Persona / Injectors | Prepended — shapes the model's identity |
| L2 | Content Modifiers | Appended after the base — steers reasoning |
| L3 | Wrappers | Applied last — sandwiches the entire inner prompt via `{{CONTEXT}}` |
| L4 | Formatters | Specifies output shape |

Regardless of the order in which you click cards, the compile function sorts by layer before assembling. This separates your expressive intent (which hacks to apply) from the structural correctness of the output. You can freely reorder cards within a layer; cross-layer ordering is guaranteed correct by the engine.

#### The `{{VAR}}` Template System

Each card's content can include named placeholders. When a card is added to the active stack, input fields for its variables appear inline. Resolved values are injected at compile time. Wrapper cards auto-hide the `{{CONTEXT}}` variable since that slot is filled programmatically. This is a micro-programming language embedded in a card game.

---

### Tula-Bench — The AI Tool Evaluator

**Core Belief:** You can't improve what you can't measure with feeling.

Traditional benchmarks measure AI tools with curated tasks and numeric scores — context-free, removed from real workflows. Retrospective impressions ("it felt worse this week") are too vague to act on. Tula-Bench takes a third path: **continuous atomic capture.**

#### Event-Driven, Not Score-Matrix

Every notable moment — brilliant or terrible — is logged in three seconds: pick the tool, tap a sentiment, optionally add a note. Over time, the accumulated events form a real dataset derived from your actual workflow. This is not a benchmark score. It is a behavioural journal.

The event schema captures more than a number:
```
{ id, ts, tool, sentiment, criterion|null, note, decision|null, reason|null }
```

The `decision` field (accept/tweak/rewrite/reject) and `reason` field (Architecture, Debugging, Legacy, Business...) enable a second layer of analysis: not just "how did the AI do" but "what did you do about it" and "why was human judgment needed."

#### The 5-Point Sentiment Scale

| Emoji | Score | Meaning |
|-------|-------|---------|
| 💀 | -2 | Rock-bottom — the AI actively harmed the task |
| 😤 | -1 | Friction — the AI slowed you down |
| 😐 | 0 | Meh — neither helpful nor harmful |
| 👍 | +1 | Nice — the AI was genuinely useful |
| 🚀 | +2 | Brilliant — the AI exceeded expectations |

This scale is deliberately emotional, not numeric. "Rock-bottom" and "brilliant" are visceral labels that capture honest reactions in the moment. A 1-to-5 Likert scale would invite overthinking. The emoji scale invites gut response — and gut response, captured at the moment of experience, is more truthful than a retrospective survey.

#### Zero Config, Maximum Signal

The Capture tab is designed for zero friction: the tool selector remembers your last choice (sticky last tool); sentiment is a single tap; criterion and note are optional; the Decision step uses progressive disclosure (it only appears after a sentiment is chosen). The LOG IT button stays disabled until the minimum required fields are filled. Every design choice removes one more reason to skip logging.

#### Smart Summary: Data That Talks Back

The Insights tab computes everything from the raw event log: tool comparison charts, criterion heatmaps, pain-point extraction, decision-pattern summaries, an AI Trust Score, and a Skill Gap Analysis. But the most distinctive feature is the Smart Summary — it reads the data and emits English sentences: *"You reject/rewrite 60% of GitHub Copilot's output — consider using it differently."* This is deliberately opinionated. Data without interpretation is noise. Data with interpretation is intelligence.

---

## The Shared Architecture

### AnkuraCore: The Invisible Backbone

Every app calls `window.AnkuraCore.init({ backUrl, onReset })` on boot. This returns two things:
- `instanceId` — a UUID that isolates this session's state from all others
- `State` — an API (`save`, `load`, `clear`, `clearAll`) that automatically namespaces every key under the instance ID

AnkuraCore also auto-wires common UI elements (back button, reset button, delete button, theme selector) and manages meta timestamps (created/updated). It is invisible to the user and nearly invisible to the developer — you call `init()` once and then forget about it.

### Instance Isolation: Every Session Is a Fresh Universe

When you open a nano app from the dashboard, it generates a unique instance ID. All localStorage keys are prefixed with that ID. This means:
- Two tabs of the same app have completely independent state
- Deleting one instance does not touch another
- The dashboard can enumerate all instances across all apps by scanning localStorage prefixes

This is the same principle as container isolation in DevOps: each instance is a clean room that cannot contaminate its neighbours.

### The Dashboard: A Launchpad, Not a Prison

The root `index.html` is a launchpad with search, app grid, and instance management. It does not own the apps. It does not proxy their data. It simply launches them. Each app is a sovereign entity that happens to share a common design system and core library.

---

## Design Principles — The Laws of This Universe

1. **Constraint breeds creativity** — Nano, not micro, not macro. If the app tries to do two things, it should be two apps.
2. **Offline-first is a feature, not a bug** — If it requires internet, it doesn't ship.
3. **Every app must work on `file://`** — The most democratic deployment target on Earth.
4. **Zero dependencies means zero excuses** — Own every line. Understand every line.
5. **Sanskrit names aren't decoration — they encode intent** — If you can't name the essence in one word, you haven't understood it.
6. **Each app solves ONE problem deeply, not many problems shallowly** — Depth over breadth, always.
7. **The user's data never leaves their machine** — No analytics. No telemetry. No cloud. No exceptions.
8. **Treat the user as a collaborator, not a consumer** — Show your work. Expose the parse log. Make the data editable.
9. **Concrete beats abstract** — One example outperforms ten descriptions. One prototype outperforms ten proposals.
10. **Respect the user's attention** — Every feature is a tax on comprehension. Pay zero tax.
