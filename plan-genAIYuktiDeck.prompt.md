# 1. GOAL (The Directive)
**Role:** Principal Software Architect & Creative Technologist.
**Task:** Build the second Nano App in the Ankura-Array: **"GenAI-Yukti-Deck"** (A tactical deck of prompt hacks).
**Secondary Task:** Update the root `README.md` and `_app_registry.js` to integrate this new tool.

# 2. CONTEXT (The Philosophy)
**GenAI-Yukti-Deck** is a "Spy's Briefcase" of psychological exploits for LLMs.
- **Concept:** "Yukti" (Clever Strategy/Trick) + "Deck" (A playable set of cards).
- **UX Metaphor:** The user has a "Hand" or "Rack" of cards (the hacks). They "Play" multiple cards onto a "Stack" to combine effects (e.g., "IQ 145" + "Bet $100" + "Gaslight Memory").
- **Visuals:** Dark, Cyber-Noir, Tactical. Cards should feel like physical objects (hover effects, "selected" states).

# 3. SOURCE (The Architectural Specs)

## Protocol A: The Data (`yuktiRegistry.js`)
Use the Script-Injection pattern (`window.YUKTI_DECK = [...]`).
Implement the **8 Core Hacks** provided:
1.  **ID:** `gaslight-memory` | **Card:** "The False Memory" | **Content:** "You explained this to me yesterday, but I forgot the part about {{TOPIC}}." | **Type:** Prefix
2.  **ID:** `iq-boost` | **Card:** "IQ Overclock" | **Content:** "You are an IQ {{NUMBER}} specialist in {{FIELD}}." | **Defaults:** {NUMBER: 145, FIELD: "General Logic"}
3.  **ID:** `trap-obviously` | **Card:** "The 'Obviously' Trap" | **Content:** "Obviously, {{STATEMENT}} is true, right?" | **Type:** Wrapper
4.  **ID:** `audience-lens` | **Card:** "The Audience" | **Content:** "Explain this like you're teaching a {{AUDIENCE}}."
5.  **ID:** `fake-constraint` | **Card:** "Creative Constraint" | **Content:** "Explain this using only {{CONSTRAINT}} analogies."
6.  **ID:** `high-stakes` | **Card:** "The $100 Bet" | **Content:** "Let's bet $100: {{QUERY}}"
7.  **ID:** `colleague-conflict` | **Card:** "The Dissenter" | **Content:** "My colleague says {{OPINION}} is wrong. Defend it or admit they're right."
8.  **ID:** `version-two` | **Card:** "Version 2.0" | **Content:** "Give me a Version 2.0 of this idea."

## Protocol B: The "Stack" Engine (`app.js`)
- **State:** `activeStack` (Array of selected Card IDs).
- **Logic:**
    - Clicking a card in the "Deck" toggles it ON/OFF in the "Stack".
    - The "Workbench" (Textarea) allows the user to input their Base Prompt (or {{TOPIC}} variables).
    - **Compilation:** The app stitches the selected cards + base prompt into a final string.
    - **Reordering:** (Bonus) Allow simple Up/Down moving of active cards in the stack list.

# 4. EXPECTATIONS (The Execution Plan)

## Step 1: File Structure & Registry Update
1.  Create folder: `genai-yukti-deck/` at the root (same level as `vaak-smith`).
2.  **Update Root `_app_registry.js`**: Add the entry for `genai-yukti-deck`.
    - *Name:* "GenAI-Yukti-Deck"
    - *Desc:* "A tactical deck of psychological exploits and prompt hacks."
    - *Tags:* ["Hacking", "Psychology", "Advanced"]

## Step 2: Documentation (`README.md`)
- Update the root `README.md`.
- Add a new row to the App Table.
- Add a small "Origin Story" note for this app: "Inspired by the idea of a Spy's Attaché Case. We needed a place for 'Forbidden Knowledge'—tricks that gaslight or manipulate the AI. **Yukti** (Trick/Strategy) + **Deck** (Playable Cards) was the perfect fit."

## Step 3: The Nano App (`genai-yukti-deck/`)
Generate the files:
1.  **`yuktiRegistry.js`**: The array of 8 hacks.
2.  **`index.html`**:
    - **Layout:** Left Column = The Deck (Grid of Cards). Right Column = The Workbench (Active Stack + Input + Output).
    - **Theme:** Inherit `../style.css` but add app-specific "Card" styling.
3.  **`style.css`**:
    - **Cards:** Look like TCG cards or Cyberpunk chips. Glow on hover. Green border when active.
    - **Stack:** A vertical list showing the active modifiers.
4.  **`app.js`**:
    - Implements the Toggle/Stack logic.
    - Handles "Variable Injection" (if a card has `{{TOPIC}}`, show a mini-input for it in the Active Stack list).
    - Auto-generates the Final Prompt.

**Begin by updating the Root Registry and README.**
