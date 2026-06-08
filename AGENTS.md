# Synapse

Open-source multi-agent AI assistant — not just chat, an AI team that gets things done.

## Tech Stack

- **Backend**: Python 3.11+ (FastAPI, asyncio, aiosqlite)
- **Frontend**: React 18 + TypeScript + Vite 6 (in `apps/setup-center/`)
- **Desktop**: Tauri 2.x (Rust shell)
- **LLM**: Anthropic Claude, OpenAI-compatible APIs (30+ providers)
- **IM Channels**: Telegram, Feishu, DingTalk, WeCom, QQ, OneBot

## Dev Environment Setup

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
```

Frontend (only if touching `apps/setup-center/`):
```bash
cd apps/setup-center && npm install
```

## Build & Run

```bash
# CLI interactive mode
synapse

# Run a single task
synapse run "your task here"

# API server mode
synapse serve

# Desktop app (Tauri)
cd apps/setup-center && npm run tauri dev
```

## Testing

```bash
pytest                      # all tests (asyncio_mode=auto)
pytest tests/unit/          # unit tests only
pytest -k "test_brain"      # specific test
pytest --cov=src/synapse  # with coverage
```

Test paths: `tests/` (configured in `pyproject.toml`).

## Code Style

- **Linter**: Ruff (line-length=100, target py311)
- **Rules**: E, F, I, N, W, UP, B, C4, SIM (see `pyproject.toml [tool.ruff.lint]` for ignores)
- **Type checking**: mypy (lenient mode — `ignore_errors = true` for now)
- **Formatting**: Ruff formatter

```bash
ruff check src/             # lint
ruff format src/            # format
mypy src/synapse/         # type check (best-effort)
```

## Project Structure

```
src/synapse/          # Core Python backend
  core/                 #   Agent, Brain, Ralph Loop, ReasoningEngine, Identity
  agents/               #   Multi-agent: Orchestrator, Factory, Profiles, TaskQueue
  prompt/               #   Prompt compilation & assembly (builder, compiler, budget)
  api/routes/           #   FastAPI endpoints
  tools/                #   Tool system (handlers/ + definitions/)
  channels/             #   IM adapters (Telegram, Feishu, DingTalk, etc.)
  memory/               #   Three-layer memory (unified_store, vector, retrieval)
  llm/                  #   LLM client & provider registry
  skills/               #   Skill loader, parser, registry
  evolution/            #   Self-evolution engine
  scheduler/            #   Cron-like task scheduler
apps/setup-center/      # Desktop GUI (Tauri + React)
identity/               # Agent identity (SOUL.md, AGENT.md, POLICIES.yaml)
skills/                 # Skill definitions (system/ + external/)
docs/                   # Documentation
tests/                  # Test suite
```

## R&D Document Archive (`synapse_archive/`)

研发文档归档目录，智能体执行研发任务时按此路径读取，禁止臆造目录。

```
<代码根目录>/
├── AGENTS.md
└── synapse_archive/
    ├── 需求分析/
    │   ├── req_clarify/
    │   │   └── 需求澄清.md
    │   ├── boundary/
    │   │   └── 边界确认说明.md
    │   ├── module_func/
    │   │   └── 模块功能.md
    │   ├── acceptance/
    │   │   └── 验收标准.md
    │   └── req_risk/
    │       └── 需求风险评估.md
    ├── 需求设计/
    │   ├── func_assign/
    │   │   └── 功能点分派清单.md
    │   ├── history_solution/
    │   │   └── 历史方案映射.md
    │   ├── module_confirm/
    │   │   └── 模块范围确认.md
    │   └── func_solution/
    │       └── 函数级方案.md
    ├── 产品架构/
    │   ├── FUNCTIONAL_ARCH.md
    │   └── TECH_ARCH.md
    ├── 产品手册/
    │   └── 产品研发手册.md
    └── 产品规范/
        ├── C++研发规范.md
        ├── Go研发规范.md
        ├── JAVA研发规范.md
        ├── JavaScript研发规范.md
        ├── MYSQL研发规范.md
        ├── PG研发规范.md
        └── Python研发规范.md
```

## Architecture Notes

- **Identity system**: `identity/SOUL.md` (values), `AGENT.md` (behavior), `USER.md` (preferences), `MEMORY.md` (persistent memory). Compiled to `identity/runtime/` for prompt injection.
- **Prompt pipeline**: `prompt/compiler.py` compiles identity files → `prompt/builder.py` assembles system prompt in layers: Identity → Persona → Runtime → Session Rules → AGENTS.md → Catalogs → Memory → User.
- **Multi-agent**: `agents/orchestrator.py` routes messages, `agents/factory.py` creates instances from `AgentProfile`. Sub-agents share the same `PromptAssembler` and session. Max delegation depth = 5.
- **Ralph Loop**: The core execution loop in `core/ralph.py` — never gives up, retries with analysis on failure.
- **Tool system**: Each tool has a handler in `tools/handlers/` and a definition in `tools/definitions/`. Skills are SKILL.md-based (declarative), loaded by `skills/loader.py`.
- **AGENTS.md injection**: `prompt/builder.py` auto-reads `AGENTS.md` from CWD into the system prompt (developer section). All agents (including sub-agents) get project context automatically.

## Commit Conventions

- Commit messages in Chinese or English, describe the "why" not the "what"
- Keep changes focused — one logical change per commit

## Known Gotchas

- Windows shell: use `write_file` + `run_shell python script.py` for complex text processing; avoid PowerShell escaping issues.
- `identity/AGENT.md` is Synapse's own behavior spec, NOT the industry-standard `AGENTS.md` file — don't confuse them.
- The `prompt/compiler.py` must be re-run when identity files change; `builder.py` auto-detects staleness via `check_compiled_outdated()`.
- Skill loading order: `__builtin__` → workspace → `.cursor/skills` → `.claude/skills` → `skills/` → global home dirs.
- `multi_agent_enabled` defaults to `True` and is always on; the toggle has been removed.
