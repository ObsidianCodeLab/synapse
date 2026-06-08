# Cursor-Operation 脚本使用说明

`scripts/cursor-operation.py` 封装 Cursor Agent CLI（`agent`）无头模式：首轮开发、纠偏多轮；**完整 stream-json 写入 `--log`**，摘要行输出到 stdout。

## 参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| `--code-path` | 是 | `MODIFY_CODE_PATH`，映射为 `agent --workspace` |
| `--log` | 是 | 日志路径，技能内统一使用 `{OUTPUT_DIR}/development.log`（**所有轮次共用**同一份文件，脚本以**追加**模式打开；多轮内容按时间顺序拼接在一起） |
| `--target` | 条件 | 任务描述；**首轮必填**；纠偏轮可与 `--fix-feedback` 联用 |
| `--doc` | 推荐 | `FUNC_SOLUTION_DOC`；首轮传入 |
| `--acceptance-doc` | 否 | 验收标准路径 |
| `--fix-feedback` | 条件 | 校验未通过项全文；纠偏轮必填（含 `[执行]`/`[方案]`/`[规范]`/`[验收]`） |
| `--round` | 否 | 轮次号（默认 `1`），写入日志 |
| `--continue` | 否 | 传给 `agent --continue`（仅上一轮同工作区 Cursor 成功时推荐） |
| `--model` | 否 | CLI 模型 id，如 `composer-2.5` |
| `--timeout` | 否 | 秒，默认 `600`（须 ≤ `run_skill_script` 平台超时） |
| `--no-echo-stream` | 否 | 不向 stdout 打摘要（仍写 log） |
| `--agent-path` | 否 | 默认 `agent` |

脚本固定传入 `agent --force --trust`（无人值守自动确认），无开关参数。

## 输出约定

- **`--log` 文件**：含元数据行 + **完整 Cursor CLI stream-json 行**（一行一条 JSON）。
  - 技能内统一使用 **单一日志文件** `development.log`，**所有轮次以追加模式写入**；每轮开头带 `=== 第 N 轮 Cursor 开发 ===` 元信息头，便于按轮次定位。
  - 若希望从空白日志开始，先手动删除 `development.log`。
- **stdout**：`[tool]` / `[assistant]` 摘要；结束时：
  - `SYNAPSE_CURSOR_LOG=...`
  - `SYNAPSE_CURSOR_ROUND=...`
  - `SYNAPSE_CURSOR_CONTINUE=0|1`
  - `SYNAPSE_CURSOR_SUCCESS=0|1`

智能体每轮结束后应 `read_file` 同一份 `development.log`，定位本轮段落并做验收（见 SKILL.md）。**不生成 patch 文件。**

## 示例

### 首轮（`run_skill_script`）

```
run_skill_script(
  skill_name="whalecloud-dev-tool-development",
  script_name="cursor-operation.py",
  args=[
    "--code-path", "/path/to/code",
    "--doc", "/path/to/函数级方案.md",
    "--acceptance-doc", "/path/to/验收标准.md",
    "--target", "根据函数级方案实现代码修改",
    "--log", "/path/to/archive/需求研发/task_exec/development.log",
    "--round", "1",
    "--timeout", "600",
    "--model", "composer-2.5"
  ]
)
```

### 纠偏轮（第 2 轮）

```
run_skill_script(
  skill_name="whalecloud-dev-tool-development",
  script_name="cursor-operation.py",
  args=[
    "--code-path", "/path/to/code",
    "--doc", "/path/to/函数级方案.md",
    "--fix-feedback", "[方案] 函数 Foo 未实现\n[规范] bar.cpp:118 未判空",
    "--target", "按纠偏说明修复",
    "--log", "/path/to/archive/需求研发/task_exec/development.log",
    "--round", "2",
    "--continue",
    "--timeout", "600",
    "--model", "composer-2.5"
  ]
)
```

> **会话续接**：仅当第 1 轮 `SYNAPSE_CURSOR_SUCCESS=1` 且未穿插其它 `agent` 任务时，第 2 轮起可加 `--continue`。

## 依赖

- Python 3.11+
- `agent` 在 PATH 且已 `agent login`（或 `CURSOR_API_KEY`）

CLI 参数说明见 **`cursor-cli-headless.md`**。

## 模块接口

| 符号 | 说明 |
|------|------|
| `build_develop_prompt(...)` | 生成首轮/纠偏 prompt |
| `CursorCLI.agent_stream(...)` | 流式执行，支持 `on_stream_line` |
| `develop_code(...)` | 异步便捷入口 |
