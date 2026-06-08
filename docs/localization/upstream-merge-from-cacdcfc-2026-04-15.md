# 上游合并说明：cacdcfc → upstream/main（6439b342）

## 引用范围

| 项目 | 值 |
|------|-----|
| 上游仓库 | `https://github.com/openakita/openakita`（本机 `D:/github/openakita` 与 `upstream/main` 一致） |
| 用户锚点提交 | `cacdcfc0372195dc1f9a8db8b51f7f4f4281844b`（feat: adaptive memory budget, task-relevant experience retrieval, proxy-aware HTTP clients） |
| 合并目标 | `upstream/main` @ `6439b3421afcec64c160d2f69557ea16bb34e68c` |
| 与 fork 的 merge-base | `56f9f5f48ffaba1eb910780836f3db233e844e55` |

**说明：** Git 合并对象为「merge-base 至 `upstream/main`」的完整上游历史；锚点 `cacdcfc` 用于限定**变更说明与验收关注点**（该点之后约 20 个提交，涵盖远程访问、安全策略、QQ 适配、提示词预算、LLM 错误类型、桌面端大量更新等）。与锚点之间的上游提交在本次合并中一并进入，未单独剔除。

## 合并策略摘要

1. **`src/openakita/`**  
   上游并行包路径未纳入 fork；冲突项以 `git rm` 删除，仅保留 **`src/synapse/`** 为唯一 Python 包实现。

2. **`src/synapse/`（除少数保护项）**  
   以 **upstream（theirs）** 为逻辑基底，对文本做 **品牌化替换**（`openakita` → `synapse`、`OpenAkita` → `Synapse`、`OPENAKITA_` → `SYNAPSE_` 等）。

3. **保护项（与根目录 `DIFF.md` 对齐）**  
   - `src/synapse/api/server.py`：手工合并。保留语雀 / GitNexus / 研发云路由与访问日志白名单；统一使用 `synapse` 导入与 API 线程名 `synapse-api`；保留上游插件路由与文档挂载等逻辑。  
   - `src/synapse/api/routes/identity.py`：在上游版本上恢复 **`DELETE /api/identity/file`**、`_PROTECTED_PERSONA_SLUGS`、`_sanitize_persona_upload_filename` 及导入人格文件名清洗逻辑。  
   - `src/synapse/llm/registries/providers.json`：保留 **WhaleCloud（iwhalecloud）** 提供商条目。  
   - `src/synapse/api/auth.py`：刷新 Cookie 名 **`synapse_refresh`**（与集成测试一致）。

4. **`apps/setup-center/`**  
   批量策略为 **`git checkout --ours`**，优先保留 fork 桌面端功能（产品工作台、引导、GitNexus 等）。上游不再跟踪的 **`dist-web/`** 静态产物按上游删除；若个别文件被误删，已从 **`HEAD`** 恢复 **`ToastContainer.tsx`**（与 `DIFF.md` 中「仅本仓库存在」组件一致）。

5. **自动化脚本**  
   `scripts/resolve_upstream_merge_synapse.py`：用于在类似合并中批量处理 `src/openakita` 删除、`src/synapse` theirs+品牌化、setup-center 优先 ours、以及接受上游删除的 `dist-web` 路径。后续合并可复用并根据 `DIFF.md` 调整保护列表。

6. **测试**  
   - `tests/unit/test_prompt_guard.py`：上游已删除该文件；合并结果跟随删除。  
   - `.env.bak`：未纳入本次合并提交（避免误提交本地环境备份）。

## 品牌化与验收清单（对照 SKILL）

- [x] 后端默认使用 `synapse` 包名与导入；`server` 中本地扩展路由保留。  
- [x] `DIFF.md` 中列出的关键路径已手工对照或保留（server、identity、providers、auth cookie）。  
- [x] 合并范围对应 `upstream/main` 当前 tip，未额外引入未 fetch 的远程提交。

## 残留风险与后续建议

- **桌面端**：大量文件采用 **ours**，上游在 `ChatView`、`SecurityView`、远程访问等处的交互改进**未自动合入**；若需某项上游 UI/行为，请对单文件做 `upstream/main` 与当前分支的增量 diff 再移植。  
- **`src/synapse/skills/registry.py`**：若未来合并时以 theirs 覆盖，需核对 **`_MARKETPLACE_HOSTS`** 是否仍为 fork 允许的 GitHub/域名集合。  
- **依赖与锁文件**：本次未强制用上游覆盖 `package.json` / `Cargo.toml`（setup-center 为 ours）；若需与上游桌面端构建完全一致，需单独对齐依赖版本。

## 参考命令（复现范围列表）

```bash
git -C D:/github/openakita log --oneline cacdcfc0372195dc1f9a8db8b51f7f4f4281844b..upstream/main
git -C D:/github/openakita diff --stat cacdcfc0372195dc1f9a8db8b51f7f4f4281844b..upstream/main
```

---

*文档生成：2026-04-15，与合并批次对应。*
