# Ankura Array — Roadmap

## Implemented

### Prompt Template Library — Export/Import ✅

**What:** Export a Vaak-Smith session (framework + all section values + system instructions + ground truths) as a `.json` file. Import that file into any instance to restore the full prompt configuration.

**How it works:** Export creates a `Blob` with `JSON.stringify` and triggers a file download via `<a download>`. Import uses `<input type="file">` + `FileReader`. Both work on `file://` with zero dependencies.

**Why it matters:** Worldbuilt prompts are valuable work. A brilliant prompt for "code review for junior developers" should be shareable, reusable, and archivable.

---

### Tula-Bench Trends Over Time ✅

**What:** A time-series view in the Insights tab showing per-tool average sentiment scores bucketed by week or month. Rendered as pure SVG polylines — no external charting library.

**How it works:** Events are grouped by `getBucketKey(ts, bucket)`, averaged per tool per bucket, and rendered as colored polylines on a -2 to +2 sentiment axis. Weekly and Monthly toggle buttons switch the bucketing. A legend maps colors to tool names.

**Why it matters:** Snapshots tell you where you are. Trends tell you where you're heading. "Is Copilot getting better at architectural suggestions?" is now answerable.

---

## Future Explorations

### Frame Shift / Iteration (from Worldbuilding Principles)

**Principle:** Start in the reader's existing world, then gradually redirect their thinking step by step.

**For prompting:** This means multi-turn prompt chains where each step builds on the previous, gradually shifting the AI's "world" toward your target output. Instead of a single monolithic prompt, you compose a sequence:

1. **Establish shared ground** — Prompt N sets up the context and gets the AI nodding along in a familiar world
2. **Introduce the shift** — Prompt N+1 introduces a modification, referencing the AI's own previous output
3. **Deepen the new world** — Prompt N+2 grounds the shift with examples and constraints
4. **Deliver** — The final prompt operates entirely within the new, redirected world

**What it would need:**
- Prompt version history (diff between iterations)
- Multi-turn session tracking (output of step N becomes input context for step N+1)
- A/B comparison view (two prompt versions side by side)
- "Chain" mode: explicit step-by-step prompt composition with carry-forward context
- Visual pipeline builder (nodes and connections between prompt stages)

**Scope:** This likely becomes its own app or a major V2 of Vaak-Smith. The current Vaak-Smith is designed for single-turn prompt crafting — extending it to multi-turn would fundamentally change its architecture.

**Note:** Could be a separate repo if scope demands it. The nano-app philosophy allows spawning new focused tools rather than bloating existing ones. A "Vaak-Chain" or "Vaak-Shift" app dedicated to multi-turn prompt orchestration would be a natural sibling.

---

### Yatra-Monitor Multi-Format Support

**Idea:** Extend beyond IRCTC PDFs to other travel document formats (boarding passes, hotel confirmations, ride receipts). Same philosophy: your travel data, liberated from opaque formats, unified in a queryable grid.

**Feasibility:** Text-extractable PDF variants (airline e-tickets) are medium scope — only the parser layer grows, the grid needs no changes. Image-based formats (wallet passes, scanned boarding passes) would require OCR, which conflicts with the zero-dependency philosophy.
