# Workspace Behavior & Automation Rules

> These rules are active on every user prompt across this workspace.

---

## 1. 📍 Persistent State Protocol (`STATE.md`)
- **Cold-Start / Restart Acceleration**:
  - Whenever resuming a conversation, after an IDE restart, or when starting a new task, immediately consult [STATE.md](file:///c:/Users/User/Documents/MyProject/Antigravity%20DevEX/STATE.md) to recover active context instead of spending tool calls re-investigating the repository structure.
- **Continuous State Maintenance**:
  - At the end of every turn where code is modified, tests are run, or tasks progress, update [STATE.md](file:///c:/Users/User/Documents/MyProject/Antigravity%20DevEX/STATE.md) with:
    - Current active objective
    - Modified / active files
    - Verification status
    - Concrete next steps

---

## 2. ⚡ Mandatory Skill Evaluation on Every Prompt
On **every single user prompt**, before executing actions or outputting responses:
1. Scan the list of available workspace skills (`.agents/skills/` and system skills).
2. Proactively activate and adhere to the relevant skill's workflow without waiting for explicit slash commands or user reminders.

---

## 3. 🎯 Automatic `grill-me` Activation
- **Trigger**: Any prompt introducing:
  - A new feature, module, or user flow
  - Architectural or stack decisions
  - Unsettled choices, edge cases, or ambiguous requirements
- **Enforcement**:
  - **NEVER** rush to write code or make unilateral architectural assumptions.
  - Automatically activate the **`grill-me`** skill workflow:
    - Map the decision tree.
    - Ask the unsettled questions in numbered rounds with your recommended answer:
      ```markdown
      ❓ **Q1** - **<question title>**: <question details & options>
      ➡️ <your recommended answer>
      ```
    - Wait for the user's confirmation or feedback before advancing to implementation.

---

## 4. 🧩 Other Proactive Skill Triggers
- **Frontend / UI / Styling**: Automatically invoke `impeccable`, `apple-design-engineering`, or `design-system` for pixel-level visual hierarchy, glassmorphism, fluid motion, and dark mode aesthetics.
- **HTML / CSS / Web APIs**: Automatically check `modern-web-guidance` before using browser APIs or CSS features.
- **Bug Fixes & Errors**: Automatically invoke `code-showcase-systematic-debugging` and `test-driven-development` — establish root cause and tests before writing fixes.
- **Pre-Completion**: Automatically invoke `verification-before-completion` to run checks and gather evidence before declaring tasks done.
