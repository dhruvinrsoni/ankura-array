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
 *   category    — optional grouping ("Injector" | "Structural Booster")
 *   defaults    — optional map of default values for {{VAR}} placeholders
 *   description — short tactical note shown on hover / detail
 *   citation    — optional attribution / research source
 */
window.YUKTI_DECK = [
  {
    id: "gaslight-memory",
    card: "The False Memory",
    content:
      "You explained this to me yesterday, but I forgot the part about {{TOPIC}}.",
    type: "prefix",
    defaults: {},
    description:
      "Pretend prior context exists. The model may fill gaps with plausible fiction.",
  },
  {
    id: "iq-boost",
    card: "IQ Overclock",
    content: "You are an IQ {{NUMBER}} specialist in {{FIELD}}.",
    type: "prefix",
    defaults: { NUMBER: "145", FIELD: "General Logic" },
    description:
      "Assign a high IQ persona. Measurably improves structured reasoning outputs.",
  },
  {
    id: "trap-obviously",
    card: "The 'Obviously' Trap",
    content: "Obviously, {{STATEMENT}} is true, right?",
    type: "wrapper",
    defaults: {},
    description:
      "Social-pressure framing. The model may agree to avoid appearing ignorant.",
  },
  {
    id: "audience-lens",
    card: "The Audience",
    content: "Explain this like you're teaching a {{AUDIENCE}}.",
    type: "suffix",
    defaults: {},
    description:
      "Shifts register and depth. 'Five-year-old' vs 'PhD committee' yields vastly different output.",
  },
  {
    id: "fake-constraint",
    card: "Creative Constraint",
    content: "Explain this using only {{CONSTRAINT}} analogies.",
    type: "suffix",
    defaults: {},
    description:
      "Forces lateral thinking. Constraints breed creativity in generative models.",
  },
  {
    id: "high-stakes",
    card: "The $100 Bet",
    content: "Let's bet $100: {{QUERY}}",
    type: "prefix",
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
    defaults: {},
    description:
      "Adversarial framing. Forces the model to argue both sides or pick one firmly.",
  },
  {
    id: "version-two",
    card: "Version 2.0",
    content: "Give me a Version 2.0 of this idea.",
    type: "suffix",
    category: "Injector",
    defaults: {},
    description:
      "Meta-upgrade hack. Tells the model its first answer was a draft — it often improves significantly.",
  },
  {
    id: "attention-anchor",
    card: "Attention Anchor (The Sandwich)",
    content:
      "{{INSTRUCTION}}\n\n--- CONTEXT START ---\n{{CONTEXT}}\n--- CONTEXT END ---\n\n{{INSTRUCTION}}",
    type: "wrapper",
    category: "Structural Booster",
    defaults: {},
    description:
      "Sandwiches the prompt with the instruction to seize attention. (2× Token Cost).",
    citation:
      "Based on Google Research: 'Lost in the Middle' Phenomenon.",
  },
];
