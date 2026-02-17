/**
 * Vaak-Smith — Configuration Data
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
          placeholder: "e.g. analyse the Q3 revenue report and identify key trends",
          target: "user",
        },
        {
          label: "Context",
          placeholder: "e.g. The report covers APAC markets. Focus on YoY growth.",
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

    "GEMINI_ENTERPRISE": {
      name: "Gemini Enterprise Pro (Role/Task/Context/Source/Expectations)",
      description:
        "Highly-structured enterprise prompt template: Role, Task, Context, Source, Expectations.",
      sections: [
        {
          label: "Role",
          placeholder: "e.g. Senior Systems Architect, Security Lead",
          target: "system",
        },
        {
          label: "Task",
          placeholder: "e.g. Design a migration plan for microservices",
          target: "user",
        },
        {
          label: "Context",
          placeholder:
            "Provide high-level context, philosophy, and key constraints (business, legal, performance)",
          target: "user",
        },
        {
          label: "Source",
          placeholder: "Attach source material: code, logs, docs, or datasets",
          target: "user",
        },
        {
          label: "Expectations",
          placeholder:
            "Define exact output format, file structure, or style requirements. Be specific.",
          target: "user",
        },
      ],
      systemTemplate: "# 1. GOAL (The Directive)\n**Role:** {{Role}}\n**Task:** {{Task}}",
      userTemplate:
        "# 1. GOAL (The Directive)\n**Role:** [Insert Role]\n**Task:** [Insert Task]\n\n# 2. CONTEXT (The Background)\n[Provide high-level context, philosophy, and constraints]\n\n# 3. SOURCE (The Input Data)\n[Provide the source code, text, or documentation here]\n\n# 4. EXPECTATIONS (The Output Format)\n[Define the exact output format, file structure, or style requirements. Be specific.]",
    },

    "ARCHITECT": {
      name: "The Architect (Role/Context/Action)",
      description: "Architect's Command — Role/Task/Context/Action Checklist/Output",
      sections: [
        { label: "Role", placeholder: "e.g. Senior Software Architect", target: "system" },
        { label: "Task", placeholder: "e.g. Define the migration strategy for X", target: "user" },
        { label: "Context", placeholder: "Background info, constraints, and current state", target: "user" },
        { label: "Action Checklist", placeholder: "Step-by-step instructions for the AI", target: "user" },
        { label: "Output", placeholder: "Define exactly what you want to see", target: "user" },
      ],
      template: `
# Role
[Insert Role, e.g., Senior Software Architect]

# Task
[Insert the specific objective]

# Context
[Background info, constraints, and current state]

# Action Checklist
[Step-by-step instructions for the AI]
1.  ...
2.  ...

# Output
[Define exactly what you want to see]
`,
    },
  },
};
