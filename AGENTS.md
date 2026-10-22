# AGENTS.md — agent operating rules for this repo

These rules apply to any AI agent working in this repository.

## ⚡ Mandatory Hybrid Orchestration Protocol (Ollama MCP)
The cloud agent functions strictly as the **Brain, Planner & Dispatcher**.
**Heavy code generation, algorithm planning, refactoring, and boilerplate MUST be dispatched to local Ollama models via the `ollama-latest` MCP server tools before applying changes to workspace files.**

### Model Dispatch Registry (`ollama-latest` MCP server)
| Tool | Target Model | Responsibilities & Dispatch Triggers |
| :--- | :--- | :--- |
| **`reasoner`** | `deepseek-r1:14b` | Algorithm planning, complex logic debugging, trade-off analysis, security reviews. |
| **`bigcoder`** | `qwen3:30b-a3b` | Large multi-file syntheses, full module implementations, deep architecture changes. |
| **`coder`** | `qwen2.5-coder:14b` | Default for writing functions, refactoring snippets, unit tests, and bug fixes. |
| **`rag`** | `granite4.2:latest` | Documentation parsing, large text context analysis. |
| **`fast`** | `qwen3:8b` | Rapid boilerplate, regexes, simple schema transforms. |

### Mandatory Execution Loop
1. **Triage & Prompt Construction (Cloud Agent)**: Formulate precise prompt specifications with relevant context.
2. **Dispatch to Local Ollama Model (Cloud Agent)**: Call `call_mcp_tool` (`ServerName: "ollama-latest"`, `ToolName: "coder"|"reasoner"|"bigcoder"|"fast"`).
3. **Integrate to Workspace (Cloud Agent)**: Apply the local model's generated code using workspace file tools (`replace_file_content`, `write_to_file`).
4. **Verify & Test (Cloud Agent)**: Execute project tests/builds (`npm run build`, `pytest`, etc.). If tests fail, send error back to `reasoner`/`coder` for targeted fix.

## Escalation rules (when a local step may go to the cloud)

1. **Two-strike rule.** If a local model fails the same step twice (tests still
   failing, or it repeats a wrong approach), escalate that step once to the
   cloud brain — then come back to local for the follow-up work.
2. **Complexity gate.** New architecture, security-sensitive design, or a change
   spanning many modules may start on the cloud brain for the *plan*, then hand
   the *implementation* back to local coders.
3. **Never escalate sensitive code.** Anything containing secrets, credentials,
   customer data, or regulated Payoneer source stays on local models regardless
   of difficulty. If you cannot solve it locally, stop and ask the human.

## The work loop (goal loop)

For any coding task, run this loop instead of one-shot generation:

1. **Plan** briefly (tiny or reasoner tier). State the success condition.
2. **Draft** the change (coder or big-local tier).
3. **Verify** — run the project's tests/lint (see Definition of done). This gate
   decides the next step, not the model's own opinion.
4. **If failing:** get a focused fix from the reasoner tier using the actual
   error output, then return to step 2. Apply the two-strike rule.
5. **Stop** when the success condition is met. Do not keep editing a passing
   change.

## Definition of done (the loop's exit gate)

A task is only complete when:

- The relevant tests pass. Run: `<!-- EDIT: your test command, e.g. npm test / pytest -q / mvn -q test -->`
- Lint/format is clean. Run: `<!-- EDIT: e.g. npm run lint / ruff check . -->`
- No secrets, keys, or credentials were added to the code or committed.
- A one-line summary of what changed is provided.

## Memory and context (protect the 32 GB RAM budget)

- Prefer **retrieval over pasting**: use `@codebase` (bge-m3 embeddings) to pull
  only the relevant files instead of loading the whole tree into context.
- Keep long-running task state in `NOTES.md`, not in the model's context window.
- Keep context small and concrete; smaller prompts run faster and leave RAM for
  the model weights.

## Handoffs between IDEs

- Commit before switching tools: `git add -A && git commit -m "WIP: <what>"`.
- Local models do **not** inherit Antigravity's chat history — write the current
  plan and where you left off into `NOTES.md` before handing off.

## Coding conventions


---

1. Repository Shape

This is a polyglot monorepo: Python services (agentic/ETL/backend) + TypeScript (frontend, shared types, some tooling).

```
/apps
  /web                 # React + TypeScript frontend
  /api                 # Python backend (FastAPI)
/services
  /orchestrator         # Agent orchestration (LangGraph/CrewAI runtime)
  /connectors           # Per-platform data connectors
  /governance           # Policy / OPA integration
/packages
  /shared-types         # Cross-language contracts (OpenAPI/JSON Schema -> generated types)
  /ui                    # Shared React component library
/infra                  # IaC, Kafka topics, Temporal/Step Functions defs
/scripts                # One-off and maintenance scripts
/tests                  # Cross-service integration & e2e tests
```

- Each `apps/*` and `services/*` is independently deployable and owns its own `pyproject.toml` or `package.json`.
- Never introduce a new top-level directory without updating this file.

---

2. Python Conventions

**Version:** 3.12+. Target modern syntax (`match`, `X | Y` unions, `TypedDict`, structural pattern matching where it improves clarity — don't force it).

**Tooling:**
- Package/dependency management: `uv` (not pip/poetry directly).
- Formatting: `ruff format` (Black-compatible), enforced pre-commit.
- Linting: `ruff check`, config in `pyproject.toml`, no per-file `# noqa` without a comment explaining why.
- Type checking: `mypy --strict` on all `services/*` and `apps/api`. New code must be fully typed; no bare `Any` without justification.

**Frameworks:**
- API layer: FastAPI (async endpoints, Pydantic v2 models for request/response).
- Agent orchestration: LangGraph as the default graph/state-machine layer for multi-agent flows; CrewAI only where a role-based crew pattern is explicitly simpler (document the choice in the module docstring).
- Workflow durability: Temporal for anything long-running or requiring retries/replay; don't hand-roll retry logic that Temporal already gives you.
- Event bus client: Kafka via `confluent-kafka` or `aiokafka` — pick one per service and stay consistent within it.
- DB access: SQLAlchemy 2.0 (async) for Postgres; official `neo4j` driver for graph queries — no raw string-built Cypher, use parameterized queries always.
- Validation: Pydantic v2 everywhere data crosses a boundary (API, event payloads, connector outputs).

**Style:**
- Functions: small, single-purpose, type-annotated, docstring (Google style) on anything public.
- Prefer composition over inheritance; avoid deep class hierarchies in agent/connector code.
- Agents are stateless — no instance state that outlives a single run. All run state goes to Postgres/pgvector or the durable workflow store. This is a hard architectural rule, not a style preference.
- Errors: raise typed, module-specific exceptions (subclass a shared `BeraleError`); never swallow exceptions silently; never use bare `except:`.
- Logging: structured logging only (`structlog` or stdlib `logging` with JSON formatter) — no bare `print()` in service code.
- No global mutable state. No singletons that hide dependencies — pass them explicitly or use FastAPI's DI.

**Directory layout per Python package:**
```
service_name/
  src/service_name/
    __init__.py
    api/            # routers/endpoints
    domain/         # business logic, framework-agnostic
    adapters/       # DB, Kafka, external API clients
    models.py       # Pydantic models
  tests/
    unit/
    integration/
  pyproject.toml
```

---

3. TypeScript Conventions

**Version:** TypeScript 5.x, `strict: true` non-negotiable in `tsconfig.json`.

**Frameworks:**
- Frontend: React (function components + hooks only, no class components).
- State management: server state via React Query (TanStack Query); local/UI state via React state or Zustand — no Redux unless a specific case justifies it.
- Styling: Tailwind CSS with the shared design tokens in `packages/ui`.
- Graph/knowledge-graph visualizations: keep rendering logic isolated in `packages/ui/graph` so it's swappable independent of the rest of the app.

**Style:**
- No `any`. Use `unknown` + narrowing, or generate types from the backend contracts in `packages/shared-types` instead of hand-writing duplicate interfaces.
- Explicit return types on exported functions.
- Prefer named exports; default exports only for page/route components.
- Co-locate component, styles, and tests: `Component.tsx`, `Component.test.tsx`.
- No implicit `useEffect` data fetching — use React Query hooks.

**Directory layout (`apps/web`):**
```
src/
  components/       # shared, reusable UI
  features/         # feature-scoped: components + hooks + api calls per feature
  hooks/
  lib/              # utilities, api client, formatting
  routes/
  types/            # only types NOT already in packages/shared-types
```

---

4. Testing Expectations

- **Unit tests are mandatory** for all domain logic (Python `domain/`, TS `hooks/` and pure functions). Target meaningful coverage of behavior, not a coverage percentage for its own sake.
- **Integration tests** required for: any new connector, any new API endpoint, any Kafka producer/consumer, any Cypher query pattern.
- **Agent/orchestration code**: test each node/agent function in isolation with mocked state; add at least one end-to-end graph test per new workflow using recorded/fixture data (never live external calls in tests).
- Python: `pytest`, fixtures in `conftest.py`, no test depends on execution order.
- TypeScript: `vitest` + `React Testing Library`; test behavior/output, not implementation details.
- No PR merges with failing tests or reduced coverage on touched files. Skipped tests must have a linked ticket, not a silent `@skip`.

---

5. Hard Rules — Never Violate

- **Never touch generated files.** Anything under `**/generated/`, `**/*.gen.ts`, `**/*_pb2.py`, or produced by `packages/shared-types`' codegen step is off-limits for manual edits. If it needs to change, change the source schema and regenerate.
- **Never commit secrets, API keys, or credentials.** Use the existing secrets manager / env var patterns already in the repo.
- **Never write raw, unparameterized Cypher or SQL.** Always use the driver's parameter binding.
- **Never introduce a new framework/library** (new agent framework, new state manager, new DB client) without flagging it — the stack above is intentional, not exhaustive-by-accident.
- **Never make agents stateful.** All state goes through the durable/external stores listed in §2.
- **Never bypass OPA policy checks** in governance-adjacent code paths, even for "just testing."
- **Never edit `packages/shared-types` output directly** — edit the schema definitions that generate it.
- **Do not reformat files you didn't otherwise need to touch** — keep diffs scoped to the actual change.

---

6. Commit / PR Conventions

- Conventional Commits format: `feat:`, `fix:`, `refactor:`, `test:`, `chore:`.
- One logical change per PR; note any open architectural questions (e.g., graph DB query language tradeoffs) in the PR description rather than resolving them unilaterally in code.
