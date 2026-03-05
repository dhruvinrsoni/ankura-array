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

  /* ═══════════════════════════════════════════════════
     Category: Grounding
     AI Guardrails — operationalize the human skills
     AI cannot replicate (architecture, legacy awareness,
     business context, accountability, simplicity, self-review).
     ═══════════════════════════════════════════════════ */
  {
    id: "constraint-injector",
    card: "The Constraint Injector",
    content:
      "Before answering, list 3 things you must NOT do:\n1. Do not {{ANTI_1}}\n2. Do not {{ANTI_2}}\n3. Do not {{ANTI_3}}\n\nNow proceed with the task.",
    type: "prefix",
    layer: 1,
    category: "Grounding",
    tags: ["constraints", "guardrails", "negative prompting", "boundaries", "safety"],
    defaults: {
      ANTI_1: "make assumptions about my tech stack",
      ANTI_2: "over-engineer the solution",
      ANTI_3: "skip error handling",
    },
    description:
      "Forces the AI to acknowledge constraints upfront. Prevents runaway assumptions.",
    citation:
      "Inspired by: 'AI doesn't know your hidden constraints' — Architectural Reasoning.",
  },
  {
    id: "architecture-guard",
    card: "The Architecture Guard",
    content:
      "Before writing any code, state:\n1. Your assumptions about the existing architecture\n2. What technologies/patterns you expect are in use\n3. What you would need to verify with a human\n\nThen wait for confirmation before proceeding.",
    type: "prefix",
    layer: 1,
    category: "Grounding",
    tags: ["architecture", "assumptions", "verification", "guard", "constraints"],
    defaults: {},
    description:
      "Makes AI explicit about its assumptions. Prevents blind refactoring of systems it doesn't understand.",
    citation:
      "Inspired by: 'AI suggests textbook solutions' — Architectural Reasoning.",
  },
  {
    id: "legacy-lens",
    card: "The Legacy Lens",
    content:
      "This code may look messy, but it exists for a reason. Before suggesting changes:\n1. Explain what this code does and WHY it might be written this way\n2. List possible reasons the original developer chose this approach\n3. Only then suggest improvements, noting what each change might break\n\n{{CONTEXT}}",
    type: "wrapper",
    layer: 3,
    category: "Grounding",
    tags: ["legacy", "refactoring", "understanding", "caution", "technical debt"],
    defaults: {},
    description:
      "Prevents AI from reflexively refactoring code. Forces understanding before action.",
    citation:
      "Inspired by: 'AI sees messy code and wants to refactor it. Humans know WHY it survived.'",
  },
  {
    id: "business-translator",
    card: "The Business Translator",
    content:
      "Before solving this, ask me {{COUNT}} clarifying questions about:\n- Business constraints (budget, timeline, team size)\n- Success criteria (what does 'done' look like?)\n- Stakeholders (who cares about this?)\n\nDo NOT start coding until I answer.",
    type: "prefix",
    layer: 1,
    category: "Grounding",
    tags: ["business", "requirements", "clarification", "stakeholder", "translation"],
    defaults: { COUNT: "3" },
    description:
      "Forces AI to ask 'why' before answering 'how'. Prevents solving the wrong problem.",
    citation:
      "Inspired by: 'Make it faster' — AI codes, a human asks 'how much are you willing to pay?'",
  },
  {
    id: "accountability-anchor",
    card: "The Accountability Anchor",
    content:
      "For each claim or recommendation, provide:\n- Confidence level (high/medium/low)\n- Source or reasoning\n- What could go wrong if this is wrong\n\nIf you're uncertain, say so explicitly.",
    type: "suffix",
    layer: 2,
    category: "Grounding",
    tags: ["accountability", "confidence", "sources", "uncertainty", "honesty"],
    defaults: {},
    description:
      "Makes AI cite sources and express uncertainty. Prevents confident hallucination.",
    citation:
      "Inspired by: 'AI cannot be sued. You can.' — Legal/Ethical Accountability.",
  },
  {
    id: "complexity-throttle",
    card: "The Complexity Throttle",
    content:
      "Constraint: Your solution must be expressible in under {{MAX_LINES}} lines of code. If it can't, explain what's truly necessary vs what's over-engineering. Prefer configuration over code, and simple over clever.",
    type: "suffix",
    layer: 2,
    category: "Grounding",
    tags: ["simplicity", "over-engineering", "YAGNI", "minimal", "pragmatic"],
    defaults: { MAX_LINES: "50" },
    description:
      "Prevents AI from generating 500 lines for a config change. Forces minimal solutions.",
    citation:
      "Inspired by: 'The best engineers delete more code than they write.' — Knowing when NOT to code.",
  },
  {
    id: "review-protocol",
    card: "The Review Protocol",
    content:
      "After generating your response:\n1. Critique it — what's weak, risky, or assumed?\n2. Rate your own confidence (1-10)\n3. Suggest what a human should double-check\n\nThen present the final version.",
    type: "suffix",
    layer: 4,
    category: "Grounding",
    tags: ["self-review", "meta", "quality", "critique", "verification"],
    defaults: {},
    description:
      "Forces AI to self-critique before presenting output. Layer 4 ensures it runs last.",
    citation:
      "Inspired by: 'AI optimizes for today. Engineers think about the future.' — Strategic Systems Thinking.",
  },
];
