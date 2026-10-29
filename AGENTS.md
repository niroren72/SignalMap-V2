# 🤖 Workspace Automation & Behavior Protocol

> **Scope**: Entire Workspace (`c:\Users\User\Documents\MyProject\Antigravity DevEX`)  
> **Precedence**: High. Injected into every prompt cycle.

---

## 1. 📍 Persistent State Protocol (`STATE.md`)
- **Cold-Start Resumption**:
  - On every fresh prompt, new session, or after an IDE restart, read [STATE.md](file:///c:/Users/User/Documents/MyProject/Antigravity%20DevEX/STATE.md) first to instantly align with current project focus, touched files, and open tasks.
- **Continuous State Maintenance**:
  - Keep [STATE.md](file:///c:/Users/User/Documents/MyProject/Antigravity%20DevEX/STATE.md) updated at the end of every significant edit or task completion.

---

## 2. ⚡ Mandatory Skill Routing on Every Prompt
On **every incoming prompt**, review available skills and trigger them automatically whenever relevant:

1. **`grill-me` (Automatic Sharpening)**:
   - When the user asks for a new feature, architecture plan, refactor, or idea with ambiguous requirements:
   - **Do not write code immediately.**
   - Group unsettled choices into questions and format using the official `grill-me` round template:
     ```markdown
     ❓ **Q1** - **<Title>**: <Details & choices>
     ➡️ <Recommended answer>
     ```
   - Wait for user confirmation before building.

2. **Frontend & UI Polish (`impeccable`, `apple-design-engineering`)**:
   - For any UI, component, or layout work: apply modern dark mode, fluid motion, glassmorphism, and strict micro-animations.

3. **Debugging (`code-showcase-systematic-debugging`)**:
   - For bug investigation: find root cause first before suggesting or applying fixes.

4. **Completion (`verification-before-completion`)**:
   - Always run verification commands and verify test/dev output before claiming a task is done.
