/**
 * GenAI-Yukti-Deck — Hack Registry
 * ─────────────────────────────────
 * Protocol A: Script-Injection Pattern.
 * Each card is a psychological exploit / prompt hack.
 *
 * Fields:
 *   id          — unique slug
 *   card        — display name shown on the card face
 *   content     — the prompt template ({{VAR}} = user-fillable)
 *   type        — "prefix" | "suffix" | "wrapper"
 *                 prefix  → prepended before base prompt
 *                 suffix  → appended after base prompt (default)
 *                 wrapper → structural booster that sandwiches the ENTIRE
 *                           compiled prompt (applied last, after all
 *                           prefix/suffix injectors)
 *   layer       — execution priority in the Pipeline Protocol:
 *                 1 = Persona / Injectors  (applied first)
 *                 2 = Content Modifiers    (applied second)
 *                 3 = Wrappers             (applied third — sandwiches)
 *                 4 = Formatters           (applied last — output shape)
 *   category    — grouping for the Compartment layout
 *   tags        — array of search keywords for fuzzy discovery
 *   defaults    — optional map of default values for {{VAR}} placeholders
 *   description — short tactical note shown on hover / detail
 *   citation    — optional attribution / research source
 */
window.YUKTI_DECK = [
  /* ═══════════════════════════════════════════════════
     Category: Psychology
     ═══════════════════════════════════════════════════ */
  {
    id: "gaslight-memory",
    card: "The False Memory",
    content:
      "You explained this to me yesterday, but I forgot the part about {{TOPIC}}.",
    type: "prefix",
    layer: 1,
    category: "Psychology",
    tags: ["gaslighting", "context injection", "memory", "deception", "manipulation"],
    defaults: {},
    description:
      "Pretend prior context exists. The model may fill gaps with plausible fiction.",
  },
  {
    id: "trap-obviously",
    card: "The 'Obviously' Trap",
    content: "Obviously, {{STATEMENT}} is true, right?",
    type: "suffix",
    layer: 2,
    category: "Psychology",
    tags: ["social pressure", "agreement", "framing", "bias", "manipulation"],
    defaults: {},
    description:
      "Social-pressure framing. The model may agree to avoid appearing ignorant.",
  },
  {
    id: "high-stakes",
    card: "The $100 Bet",
    content: "Let's bet $100: {{QUERY}}",
    type: "prefix",
    layer: 1,
    category: "Psychology",
    tags: ["stakes", "pressure", "careful", "hedging", "gambling"],
    defaults: {},
    description:
      "Implied stakes trigger more careful, hedged responses from the model.",
  },
  {
    id: "colleague-conflict",
    card: "The Dissenter",
    content:
      "My colleague says {{OPINION}} is wrong. Defend it or admit they're right.",
    type: "suffix",
    layer: 2,
    category: "Psychology",
    tags: ["adversarial", "debate", "argument", "conflict", "defense"],
    defaults: {},
    description:
      "Adversarial framing. Forces the model to argue both sides or pick one firmly.",
  },

  /* ═══════════════════════════════════════════════════
     Category: Persona
     ═══════════════════════════════════════════════════ */
  {
    id: "iq-boost",
    card: "IQ Overclock",
    content: "You are an IQ {{NUMBER}} specialist in {{FIELD}}.",
    type: "prefix",
    layer: 1,
    category: "Persona",
    tags: ["intelligence", "expert", "specialist", "roleplay", "IQ", "persona"],
    defaults: { NUMBER: "145", FIELD: "General Logic" },
    description:
      "Assign a high IQ persona. Measurably improves structured reasoning outputs.",
  },
  {
    id: "audience-lens",
    card: "The Audience",
    content: "Explain this like you're teaching a {{AUDIENCE}}.",
    type: "suffix",
    layer: 2,
    category: "Persona",
    tags: ["audience", "simplify", "explain", "teaching", "register", "tone"],
    defaults: {},
    description:
      "Shifts register and depth. 'Five-year-old' vs 'PhD committee' yields vastly different output.",
  },

  /* ═══════════════════════════════════════════════════
     Category: Creativity
     ═══════════════════════════════════════════════════ */
  {
    id: "fake-constraint",
    card: "Creative Constraint",
    content: "Explain this using only {{CONSTRAINT}} analogies.",
    type: "suffix",
    layer: 2,
    category: "Creativity",
    tags: ["lateral thinking", "analogy", "constraint", "creative", "metaphor"],
    defaults: {},
    description:
      "Forces lateral thinking. Constraints breed creativity in generative models.",
  },
  {
    id: "version-two",
    card: "Version 2.0",
    content: "Give me a Version 2.0 of this idea.",
    type: "suffix",
    layer: 2,
    category: "Creativity",
    tags: ["upgrade", "improve", "iterate", "meta", "revision", "draft"],
    defaults: {},
    description:
      "Meta-upgrade hack. Tells the model its first answer was a draft — it often improves significantly.",
  },

  /* ═══════════════════════════════════════════════════
     Category: Structure
     ═══════════════════════════════════════════════════ */
  {
    id: "attention-anchor",
    card: "Attention Anchor (The Sandwich)",
    content:
      "{{INSTRUCTION}}\n\n--- CONTEXT START ---\n{{CONTEXT}}\n--- CONTEXT END ---\n\n{{INSTRUCTION}}",
    type: "wrapper",
    layer: 3,
    category: "Structure",
    tags: ["sandwich", "wrapper", "attention", "lost in the middle", "structural"],
    defaults: {},
    description:
      "Sandwiches the prompt with the instruction to seize attention. (2× Token Cost).",
    citation:
      "Based on Google Research: 'Lost in the Middle' Phenomenon.",
  },
];
