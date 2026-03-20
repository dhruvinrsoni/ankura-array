# Ankura Array — Roadmap

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

### Prompt Template Library / Community Sharing

**Idea:** Save and share worldbuilt prompts as reusable templates. Export a Vaak-Smith configuration (framework + filled sections) as a JSON file that others can import.

**Why it matters:** The Worldbuilder framework creates rich, structured prompts. If a user crafts a brilliant prompt for "code review for junior developers," that worldbuilding work should be shareable.

---

### Tula-Bench Cross-Tool Analysis

**Idea:** Compare AI tool performance across different criteria over time. Track trends: "Is Copilot getting better at architectural suggestions?" Currently, Tula-Bench captures snapshots. A time-series view would reveal trajectories.

---

### Gati-Grid Multi-Format Support

**Idea:** Extend beyond IRCTC PDFs to other travel document formats (boarding passes, hotel confirmations, ride receipts). Same philosophy: your travel data, liberated from opaque formats, unified in a queryable grid.
