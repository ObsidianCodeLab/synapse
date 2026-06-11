---
name: whalecloud-dev-tool-base-scripts
description: "研发工具共享脚本包：SynapseService / GitNexus / 图谱工单检索等系统交互的可执行脚本与说明，供 whalecloud-dev-tool-* 业务技能引用。Examples: gnx-tools materialize、get_repo_info、get_doc、历史工单 hybrid/relation/cypher 查询。"
label: 研发工具共享脚本
---

> **系统约束**：本技能由 Synapse / Setup Center **强制启用**（不可从 `data/skills.json` 的 `external_allowlist` 中移除），且**不可卸载**。

# whalecloud-dev-tool-base-scripts（共享脚本）

本技能**仅提供**与外部系统交互的脚本与参考说明；业务流程由其它 `whalecloud-dev-tool-*` 技能定义。

## 调用方式（业务技能必读）

**禁止**在业务技能 Parameters 中要求用户传入脚本根路径。一律通过 Synapse 工具执行：

```text
run_skill_script(
  skill_name="whalecloud-dev-tool-base-scripts",
  script_name="<脚本文件名>",
  args=["参数1", "参数2", ...]
)
```

- `.py` 脚本：平台自动选用 Python 解释器
- `.js` 脚本（如 `gnx-tools.js`）：平台自动用 `node` 执行；子命令写在 `args` 最前面（如 `["materialize", "--url", ...]`）

需要脚本列表或参数说明时：`get_skill_info("whalecloud-dev-tool-base-scripts")`。

脚本参数细则在 `references/<脚本名>.md`；**禁止**对默认 `REFERENCE.md` 调用 `get_skill_reference`（本技能无此文件），应指定 `ref_name`，例如：

```text
get_skill_reference(
  skill_name="whalecloud-dev-tool-base-scripts",
  ref_name="hybrid_query.md"
)
```

## 研发会议室：系统 URL 对照（执行脚本前必读）

系统提示「四、系统信息」会注入下列变量。**禁止混用**：

| 变量 | 用于哪些脚本 | 参数名 |
|------|----------------|--------|
| `SERVER_URL`（同 `SYNAPSE_URL`，研发统一服务 :10001） | `hybrid_query.py` / `relation_query.py` / `cypher_query.py` / `get_repo_info.py` / `get_doc.py` | `--server_url` 或 `--server-url` |
| `GITNEXUS_URL`（代码图谱服务 :11011） | `gnx-tools.js` / `fetch-arch-data.js` | `--url` |
| `PROD` | 历史工单检索、get_repo_info | `--prod` |
| `REPO_NAME` | gnx-tools search/explore/impact 等 | `--repo` |

**常见错误**：把 `GITNEXUS_URL` 传给 `hybrid_query.py` 的 `--server_url`（会 404）。历史工单检索一律用 `SERVER_URL`。

### 复制即用示例（把占位符换成系统提示中的实际值）

历史工单混合检索：

```text
run_skill_script(
  skill_name="whalecloud-dev-tool-base-scripts",
  script_name="hybrid_query.py",
  args=["--server_url", "<SERVER_URL>", "--prod", "<PROD>", "--query", "<从 DEMAND_DESC 提炼的关键词>", "--limit", "10"]
)
```

GitNexus 代码搜索：

```text
run_skill_script(
  skill_name="whalecloud-dev-tool-base-scripts",
  script_name="gnx-tools.js",
  args=["search", "--url", "<GITNEXUS_URL>", "--repo", "<REPO_NAME>", "--query", "<符号或关键词>"]
)
```

## `scripts/` 清单

| 脚本 | 用途 |
|------|------|
| `gnx-tools.js` | GitNexus：materialize / read / grep / cypher / search / overview / explore / impact |
| `fetch-arch-data.js` | 架构 JSON（REST + MCP） |
| `detect-project-kind.js` | 工程类型判定 |
| `get_repo_info.py` | 产品关联仓库列表 |
| `get_doc.py` | 产品文档下载（会议室场景优先读工单 `doc/`，少用本脚本） |
| `hybrid_query.py` | 历史工单混合检索 |
| `relation_query.py` | 历史工单拓扑关联 |
| `cypher_query.py` | 历史工单 Cypher 查询 |

## `references/` 说明文档

| 文件 | 对应脚本 |
|------|----------|
| [references/gnx-tools.md](references/gnx-tools.md) | `gnx-tools.js` / `detect-project-kind.js` |
| [references/get_repo_info.md](references/get_repo_info.md) | `get_repo_info.py` |
| [references/get_doc.md](references/get_doc.md) | `get_doc.py` |
| [references/hybrid_query.md](references/hybrid_query.md) | `hybrid_query.py` |
| [references/relation_query.md](references/relation_query.md) | `relation_query.py` |
| [references/cypher_query.md](references/cypher_query.md) | `cypher_query.py` |

> 业务技能目录下**没有**上述脚本的副本；勿写 `skills/...` 相对路径或让用户手填绝对路径。
