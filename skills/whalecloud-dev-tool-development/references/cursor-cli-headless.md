# Cursor Agent CLI 无头模式使用说明

本文档说明 **Cursor Agent CLI**（可执行文件名 `agent`）在脚本、CI、Synapse 技能等场景下的**无头（headless）/ 打印（print）模式**用法。官方文档：<https://cursor.com/docs/cli>。

> **命名说明**：无头模式依赖 `-p` / `--print`，不是单独的子命令。可执行文件为 **`agent`**（安装后位于 PATH）；部分旧文档写作 `cursor agent`，与 `agent` 等价，以本机 `agent --help` 为准。

---

## 1. 安装与认证

### 安装

```bash
# macOS / Linux / WSL
curl https://cursor.com/install -fsS | bash

# Windows PowerShell
irm 'https://cursor.com/install?win32=true' | iex
```

### 登录（首次必做）

```bash
agent login
```

- 浏览器 OAuth；设置 `NO_OPEN_BROWSER=1` 可禁止自动打开浏览器。
- 也可用环境变量 **`CURSOR_API_KEY`** 或参数 **`--api-key <key>`** 做非交互认证。

### 常用维护命令

| 命令 | 说明 |
|------|------|
| `agent status` / `agent whoami` | 查看登录状态 |
| `agent models` / `agent --list-models` | 列出当前账号可用模型 id |
| `agent update` | 更新 CLI |
| `agent -v` / `agent --version` | 版本号 |
| `agent logout` | 登出 |

---

## 2. 无头模式是什么

**无头模式** = 使用 **`-p` / `--print`**：将 Agent 的回复与工具执行结果打印到 stdout，供脚本解析，而不是打开交互式 TUI。

特点（官方说明）：

- 可使用**全部工具**（读写文件、Shell 等），适合自动化改码。
- 必须配合 **`--output-format`** 选择输出形态（仅在与 `-p` 同时使用时生效）。
- 无人值守时常配合 **`--force`**、**`--trust`**，避免命令/工作区确认阻塞。

### 最小示例

```bash
agent -p "列出当前目录下的 Python 文件" --output-format text
```

### 本技能推荐组合（与 `cursor-operation.py` 一致）

```bash
agent -p "请根据方案修改代码，不要 git commit" \
  --workspace "/path/to/code/repo" \
  --output-format stream-json \
  --force \
  --trust \
  --model composer-2.5
```

---

## 3. 命令行结构

```text
agent [options] [prompt...]
```

| 部分 | 说明 |
|------|------|
| `prompt...` | 初始任务描述，可为一个或多个参数（空格拼接为完整 prompt） |
| `-p` / `--print` | **进入无头/打印模式**（自动化必加） |
| 其它 options | 见下表 |

**注意**：`-p` 的值是布尔开关；任务文本应作为**位置参数**写在命令末尾，或使用引号包成一条字符串，例如：

```bash
agent -p "修复 login 模块的空指针" --output-format text
```

---

## 4. 无头模式常用参数

以下摘自 `agent --help`，仅列出自动化相关项。

| 参数 | 说明 |
|------|------|
| **`-p`, `--print`** | 无头/打印模式；脚本、CI 必加 |
| **`--output-format <format>`** | 仅配合 `-p`：`text` \| `json` \| `stream-json`（默认 `text`） |
| **`--stream-partial-output`** | 在 `stream-json` 下按增量输出文本片段（更细粒度） |
| **`--workspace <path>`** | 工作区根目录（默认当前 cwd）；改码、读文件均相对此目录 |
| **`--model <model>`** | 模型 id，须为 `agent models` 中的 **id**（如 `composer-2.5`），不要用显示名 |
| **`-f`, `--force`** | 强制允许命令（除非显式拒绝）；别名 **`--yolo`** |
| **`--trust`** | 信任当前工作区，不再提示（**仅无头模式有效**） |
| **`--sandbox <enabled\|disabled>`** | 显式开/关沙箱 |
| **`--approve-mcps`** | 自动批准所有 MCP 服务器 |
| **`--mode plan` / `--plan`** | 只读规划，不改文件 |
| **`--mode ask`** | 只读问答 |
| **`--continue`** | 继续上一场会话 |
| **`--resume [chatId]`** | 恢复指定会话 |
| **`--api-key <key>`** | API Key（或 `CURSOR_API_KEY`） |
| **`-H, --header`** | 自定义请求头（可重复） |
| **`-w, --worktree [name]`** | 在隔离 git worktree 中运行 |
| **`--worktree-base <branch>`** | worktree 基于的分支/ref |
| **`--plugin-dir <path>`** | 加载本地插件目录（可多次） |

### 输出格式选择

| 格式 | 适用场景 |
|------|----------|
| **`text`** | 人类可读日志、简单管道 |
| **`json`** | 单次结构化结果，便于 `jq` |
| **`stream-json`** | **推荐**：每行一个 JSON 事件，实时跟踪 tool 调用与最终结果 |

---

## 5. `stream-json` 事件（进度解析）

stdout 为**按行分隔的 JSON**。`cursor-operation.py` 主要解析以下类型：

| `type` | `subtype` / 备注 | 含义 |
|--------|------------------|------|
| `system` | `init` | 会话初始化（含模型信息） |
| `assistant` | — | 助手文本片段 |
| `tool_call` | `started` | 开始调用工具（读/写/Shell 等） |
| `tool_call` | `completed` | 工具执行结束 |
| `progress` | — | 兼容旧格式的聚合进度（含 `tool_calls`） |
| `user` | — | 需用户确认的提示（无头下应用 `--force --trust` 减少） |
| `result` | `success` / 失败 | **结束事件**；应用 `subtype` 与 `is_error` 判断成败 |

`tool_call` + `started` 时，`tool_call` 对象内键名多为 `*ToolCall`（如 `editToolCall`），`args` 中常见 `path`、`command`、`contents` 等。

判断任务是否成功（与脚本逻辑一致）：

1. 进程 `exit code == 0`；且/或  
2. 从 stdout **最后一行有效 `result` 事件** 读取：`subtype == "success"` 且 `is_error` 不为真。

---

## 6. 典型使用场景与示例

### 6.1 一次性改码（研发技能标准形态）

```bash
agent -p "请阅读 /work/函数级方案.md 并按方案修改本仓库代码；不要 git commit；完成后列出修改的文件" \
  --workspace "D:/repos/myproject" \
  --output-format stream-json \
  --force \
  --trust \
  --model composer-2.5
```

### 6.2 只读审查（不改文件）

```bash
agent -p "审查 git diff 中的安全问题" \
  --mode ask \
  --workspace "." \
  --output-format text
```

### 6.3 先规划再人工执行

```bash
agent -p "为 auth 模块设计 JWT 迁移方案" \
  --plan \
  --workspace "." \
  --output-format text
```

### 6.4 流式增量文本

```bash
agent -p "解释 src/main.py 的结构" \
  --output-format stream-json \
  --stream-partial-output
```

### 6.5 恢复会话（慎用多工单并行）

```bash
agent ls
agent resume
agent --continue -p "继续上一轮未完成的修改" --output-format stream-json --force --trust
```

多任务/多工单自动化时，**优先每轮新进程 + 完整 prompt**，避免 `--continue` 串会话。

### 6.6 通过 Synapse 技能脚本（推荐）

不直接拼 `agent`，由 `scripts/cursor-operation.py` 封装（参数映射见 `references/cursor-operation-readme.md`）：

```bash
# 首轮
python scripts/cursor-operation.py \
  --code-path "D:/repos/myproject" \
  --target "按函数级方案实现改造" \
  --doc ".../函数级方案.md" \
  --acceptance-doc ".../验收标准.md" \
  --log ".../development.log" \
  --round 1 \
  --model composer-2.5

# 纠偏轮（第 2 轮，共用同一份 development.log，追加写入）
python scripts/cursor-operation.py \
  --code-path "D:/repos/myproject" \
  --doc ".../函数级方案.md" \
  --fix-feedback "1. 函数 Foo 未实现\n2. ..." \
  --target "按纠偏说明修复" \
  --log ".../development.log" \
  --round 2 \
  --continue \
  --model composer-2.5
```

`--log` 含完整 stream-json；stdout 输出 `[tool]`/`[assistant]` 摘要及 `SYNAPSE_CURSOR_*` 行。

等价底层命令形如：

```text
agent -p <prompt> --workspace <code-path> --output-format stream-json --force --trust --model composer-2.5
```

---

## 7. 环境变量

| 变量 | 说明 |
|------|------|
| `CURSOR_API_KEY` | API 密钥（替代交互 login） |
| `NO_OPEN_BROWSER` | `agent login` 时不自动打开浏览器 |

---

## 8. 自动化安全与运维建议

1. **`--force` + `--trust`**：适合受控 CI/内网工单目录；在不可信仓库或共享机上应关闭，改人工审批或去掉 `--force`。
2. **`--workspace`**：务必指向**真实 Git 工作区**（仓库根或子目录），便于任务结束后在仓库内 `git diff` 验收（本技能**不**落盘 patch 文件）。
3. **`--model`**：传 `agent models` 列出的 **id**；传错由 CLI 报错退出。
4. **超时**：CLI 本身无 `--timeout`；外层用 Python/shell 包一层（`cursor-operation.py` 默认 300s）。
5. **不要提交**：改码留在工作区，由后续流水线或走查取用，与 `whalecloud-dev-tool-development` 技能约束一致。
6. **可执行路径**：非默认安装时用 `cursor-operation.py` 的 `--agent-path /full/path/to/agent`。

---

## 9. 与交互模式的区别

| | 交互模式 | 无头模式 (`-p`) |
|--|----------|-----------------|
| 启动 | `agent` 或 `agent "初始提示"` | `agent -p "任务" ...` |
| 输出 | TUI | stdout（text/json/stream-json） |
| 确认 | 终端内逐项确认 | `--force` / `--trust` 减少阻塞 |
| 适用 | 本地探索 | 脚本、Synapse `run_skill_script`、CI |

---

## 10. 故障排查

| 现象 | 处理 |
|------|------|
| `agent: command not found` | 重装 CLI 或将安装目录加入 PATH |
| 认证失败 | `agent login` 或配置 `CURSOR_API_KEY` |
| 模型不可用 | `agent models` 核对 id |
| 无输出卡住 | 检查是否缺少 `-p`；是否等待工作区/命令确认（加 `--trust` `--force`） |
| `stream-json` 解析失败 | 确认每行独立 JSON；过滤非 JSON 日志行 |
| Windows 路径 | `--workspace` 可用正斜杠或引号包裹的反斜杠路径 |

---

## 11. 相关文件

| 文件 | 说明 |
|------|------|
| `../scripts/cursor-operation.py` | 本仓库对 `agent` 的 asyncio 封装与日志 |
| `cursor-operation-readme.md` | 技能脚本参数与 `run_skill_script` 示例 |
| `../SKILL.md` | 代码开发技能工作流与产物约定 |

文档版本以本机 **`agent --help`** 与 <https://cursor.com/docs/cli> 为准；CLI 升级后请重新核对参数表。
