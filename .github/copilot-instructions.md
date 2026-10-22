# VS Code Copilot & Agent Instructions

See full project rules in `AGENTS.md` and `HANDOVER.md`.

## Mandatory Hybrid Orchestration Protocol (Ollama MCP)
The agent functions strictly as the **Brain, Planner & Dispatcher**.
Heavy code generation, algorithm planning, refactoring, and boilerplate MUST be dispatched to local Ollama models via the `ollama-latest` MCP server tools before applying changes to workspace files:

| Tool | Target Model | Responsibilities & Dispatch Triggers |
| :--- | :--- | :--- |
| **`reasoner`** | `deepseek-r1:14b` | Algorithm planning, complex logic debugging, trade-off analysis, security reviews. |
| **`bigcoder`** | `qwen3:30b-a3b` | Large multi-file syntheses, full module implementations, deep architecture changes. |
| **`coder`** | `qwen2.5-coder:14b` | Default for writing functions, refactoring snippets, unit tests, and bug fixes. |
| **`rag`** | `granite4.2:latest` | Documentation parsing, large text context analysis. |
| **`fast`** | `qwen3:8b` | Rapid boilerplate, regexes, simple schema transforms. |

Always verify changes with project build & test commands (`npm run build`, `python -m agent.main`).
