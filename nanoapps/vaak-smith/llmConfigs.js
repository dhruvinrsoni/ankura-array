/**
 * LLM Prompt Builder — Configuration Data (copied for Vaak-Smith)
 */
window.LLM_CONFIGS = {
  /* ── Provider Definitions ──────────────────────── */
  PROVIDERS: {
    openai: {
      name: "OpenAI",
      model: "GPT-4o",
      temperature: { min: 0, max: 2, step: 0.01, default: 1.0 },
      topP: { min: 0, max: 1, step: 0.01, default: 1.0 },
      maxTokens: 4096,
    },
    anthropic: {
      name: "Anthropic",
      model: "Claude 3.5 Sonnet",
      temperature: { min: 0, max: 1, step: 0.01, default: 1.0 },
      topP: { min: 0, max: 1, step: 0.001, default: 0.999 },
      maxTokens: 8192,
    },
    google: {
      name: "Google",
      model: "Gemini 1.5 Pro",
      temperature: { min: 0, max: 2, step: 0.01, default: 1.0 },
      topP: { min: 0, max: 1, step: 0.01, default: 0.95 },
      maxTokens: 8192,
    },
  },

  /* ── Prompt Framework Definitions ──────────────── */
  FRAMEWORKS: {
    "google-standard": {
      name: "Google Standard",
      description: "Persona → Task → Context → Format",
      sections: [
        {
          label: "Persona",
          placeholder:
            "e.g. a senior data analyst with 10 years of experience in financial modelling",
          target: "system",
        },
        {
          label: "Task",
          placeholder:
            "e.g. analyse the Q3 revenue report and identify key trends",
          target: "user",
        },
        {
          label: "Context",
          placeholder:
            "e.g. The report covers APAC markets. Focus on YoY growth.",
          target: "user",
        },
        {
          label: "Format",
          placeholder:
            "e.g. a bullet-point executive summary followed by a markdown table",
          target: "user",
        },
      ],
      systemTemplate:
        "Act as a {{Persona}}. You are an expert and should respond with authority and precision.",
      userTemplate:
        "Your task is to {{Task}}.\n\nHere is the context:\n{{Context}}\n\nPlease format the output as:\n{{Format}}",
    },
    "copilot-gcse": {
      name: "Copilot G.C.S.E.",
      description: "Goal → Context → Source → Expectations",
      sections: [
        {
          label: "Goal",
          placeholder:
            "e.g. Refactor the authentication module to use JWT tokens",
          target: "user",
        },
        {
          label: "Context",
          placeholder:
            "e.g. We are migrating from session-based auth. The codebase is Node.js + Express.",
          target: "user",
        },
        {
          label: "Source",
          placeholder:
            "e.g. Refer to the existing auth middleware in src/middleware/auth.js",
          target: "system",
        },
        {
          label: "Expectations",
          placeholder:
            "e.g. Provide working code with inline comments. Include unit test examples.",
          target: "user",
        },
      ],
      systemTemplate: "# SOURCE\n{{Source}}",
      userTemplate:
        "# GOAL\n{{Goal}}\n\n# CONTEXT\n{{Context}}\n\n# EXPECTATIONS\n{{Expectations}}",
    },
  },
};
