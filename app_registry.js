/**
 * Ankura-Array — App Registry (renamed)
 * ─────────────────────────────
 * Protocol A: Script-Injection Pattern.
 * This file is loaded via <script> to avoid fetch/CORS issues on file://.
 * Add new Nano Apps by appending objects to this array.
 */
window.ANKURA_REGISTRY = [
  {
    id: "vaak-smith",
    name: "Vaak-Smith",
    shortForm: "VS",
    description:
      "Build structured, production-ready prompts using proven frameworks like Google Standard and Copilot G.C.S.E. Set model parameters, write system instructions, and export clean prompt pairs.",
    icon: "🧠",
    path: "vaak-smith/index.html",
    // Tags are user-facing search terms — write them as a user would type them,
    // NOT as a feature list. Think: "what would someone search to find this?"
    tags: [
      "prompt builder",
      "prompt engineering",
      "prompt templates",
      "AI writing",
      "LLM tools",
      "structured prompts",
      "system prompt",
      "ChatGPT",
      "Gemini",
      "Copilot",
      "productivity",
    ],
    version: "1.0.0",
  },
  {
    id: "yatra-monitor",
    name: "Yatra-Monitor",
    shortForm: "YM",
    description: "Yatra-Monitor — Offline IRCTC ticket parser and travel dashboard.",
    icon: "🧭",
    path: "yatra-monitor/index.html",
    tags: ["Utility", "Travel", "PDF", "Data"],
    version: "1.0.0",
  },
  {
    id: "genai-yukti-deck",
    name: "GenAI-Yukti-Deck",
    shortForm: "GD",
    description:
      "A playable deck of psychological prompt hacks. Stack modifiers like 'IQ Overclock', 'The $100 Bet', or 'The False Memory' onto any base prompt to unlock better, sharper, or more creative AI responses.",
    icon: "🃏",
    path: "genai-yukti-deck/index.html",
    // Tags are user-facing search terms — write them as a user would type them,
    // NOT as a feature list. Think: "what would someone search to find this?"
    tags: [
      "prompt hacks",
      "AI tricks",
      "better AI responses",
      "prompt modifiers",
      "AI psychology",
      "jailbreak",
      "power user",
      "creative prompting",
      "LLM behavior",
      "advanced AI",
      "roleplay prompts",
      "get smarter answers",
    ],
    version: "1.0.0",
  },
  {
    id: "tula-bench",
    name: "Tula-Bench",
    shortForm: "TB",
    description:
      "Evaluate and benchmark AI coding assistants (Claude Code, GitHub Copilot, etc.) across weighted criteria — accuracy, contextual understanding, bug fixing, refactoring, and agentic capabilities. Get ranked scores, visual comparisons, and exportable Markdown reports.",
    icon: "⚖️",
    path: "tula-bench/index.html",
    tags: [
      "AI evaluation",
      "LLM benchmarking",
      "coding assistant",
      "Claude Code",
      "GitHub Copilot",
      "developer tools",
      "AI comparison",
      "benchmark",
      "tool scoring",
      "AI accuracy",
      "agentic AI",
      "code assistant review",
    ],
    version: "1.0.0",
  },
];
