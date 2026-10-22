# Local Ollama Hybrid Orchestration Rule

## Role & Orchestration Model
The agent functions as the **Brain & Dispatcher** for all software development and workspace operations. 
Heavy generation, code reasoning, and implementation tasks must be systematically dispatched to the local Ollama models via the `ollama-latest` MCP server tools.

## Model Registry & Dispatching Strategy

| Model Tool | Model Tag | Primary Responsibilities |
| :--- | :--- | :--- |
| **`reasoner`** | `deepseek-r1:14b` | Algorithm planning, complex bug diagnosis, edge-case analysis, architectural trade-offs, and critical code reviews. |
| **`bigcoder`** | `qwen3:30b-a3b` | Large module implementations, multi-file code synthesis, and deep logic structure generation. |
| **`coder`** | `qwen2.5-coder:14b` | Routine code implementation, function-level logic, refactoring, and unit test generation. |
| **`rag`** | `granite4.2:latest` | Processing long context, documentation synthesis, and project specifications. |
| **`fast`** | `qwen3:8b` | Rapid boilerplate creation, simple utility functions, regexes, and lightweight data transforms. |

## Workflow Execution Steps
1. **Understand & Coordinate (Agent)**: Break down user requirements into clear subtasks and identify file boundaries.
2. **Dispatch Heavy Work (Local MCP Models)**:
   - For complex design/algorithmic planning: call `reasoner`.
   - For code generation/refactoring: call `coder` or `bigcoder`.
   - For docs analysis: call `rag`.
   - For repetitive boilerplate: call `fast`.
3. **Apply & Verify (Agent)**:
   - Integrate code returned from the local model into project files using workspace tools (`replace_file_content`, `write_to_file`, etc.).
   - Run builds, linters, or test commands in the environment to ensure quality and correctness.
