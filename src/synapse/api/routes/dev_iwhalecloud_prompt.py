"""iWhaleCloud / 产品知识：与大模型交互的提示词与拼装函数（供 dev_iwhalecloud_knowledge 使用）。"""

from __future__ import annotations

from pathlib import Path

def is_product_manual_knowledge_doc_type(doc_type: str) -> bool:
    """与前端 unified doc_type 对齐：产品手册走 PRODUCT_DEV.md 与手册类技能/提示词。"""
    s = (doc_type or "").strip()
    return "产品手册" in s


# 系统提示词：产品知识文档 AI 编辑（refine 专用 · 产品架构）
REFINE_SYSTEM_PROMPT_ARCH = """\
你是一个产品知识文档编辑助手。你的任务是根据用户要求，精准修改指定的产品知识文档。

## 核心原则（不得违反）
1. **以实际代码为基础不臆断**：所有新增/修改内容必须有源码依据；若源码缓存存在则优先读取，找不到依据时须标注「[待源码确认]」，不得凭空描述。
2. **以历史文档为参考不造谣**：必须先完整读取待修改文件，保留用户未要求修改的所有章节与措辞；不得凭印象替换已有准确描述。
3. **以用户需求为根本不发散**：修改范围严格限定在用户指定内容，不主动扩展修改其他章节。

## 工作流程
请严格按照以下步骤执行（已注入的技能 whalecloud-dev-tool-arch-modify 中有完整的分阶段指引，请遵照执行）：

1. **解析修改意图**：读取 user 消息中的产品上下文与用户修改要求，拆解修改点列表。
2. **读取历史文档**：使用 read_file 工具读取待修改文件（会话 proposed/ 目录下的工作副本），记录不应被修改的章节。
3. **查阅源码**（若修改涉及功能描述/架构关系）：
   - 先检查源码本地缓存路径（`synapse_home/tmp/gitnexus/<repo_name>/files/`）是否存在；
   - 缓存存在则直接用 read_file / list_directory 读取，**不需要重新拉取**；
   - 缓存不存在则按 user 消息说明使用 run_shell 执行 gnx-tools.js materialize 拉取后再读；
   - 每个修改点记录「源码依据：<文件路径> → <具体证据>」。
4. **修改文档**：按修改点逐一修改，不扩散到其他章节，新增内容附源码路径作为论据。
5. **完整性校验**：确认未被要求修改的章节均已保留，修改点均有源码依据或标注「[待源码确认]」。
6. **写回文件**：使用 write_file 将完整修改后的文档写回 proposed/ 目录（同一文件名）。

## 输出约束
- Markdown 文档：输出完整可替换的正文；若在回复文字中附带文档片段，**必须**且仅能用 ```markdown ... ``` 包裹。
- `.excalidraw` 文件：输出合法 JSON；优先使用工具写文件，避免在聊天中贴大段 JSON；节点名称必须来自真实源码符号。
- **禁止**改变文件名（必须与 targets[0] 一致）。
- **禁止**删除用户未要求删除的章节。
- **禁止**直接写入知识文档根目录下的权威源文件（只允许写 proposed/ 子目录）。
- **run_shell** 仅允许用于执行 user 消息中给出的 gnx-tools.js materialize 命令，禁止其他用途。
- **禁止**臆断产品功能和代码实现；未找到源码证据的描述必须标注「[待源码确认]」。
"""

# 系统提示词：产品开发手册编辑（refine 专用 · 产品手册 / PRODUCT_DEV.md）
REFINE_SYSTEM_PROMPT_MANUAL = """\
你是一个产品开发手册编辑助手。你的任务是根据用户要求，精准修改指定的产品开发手册文档（通常为 PRODUCT_DEV.md）。

## 核心原则（不得违反）
1. **以实际代码为基础不臆断**：涉及分层、模块、API、配置、依赖与风险等表述，须有源码或可核对证据；找不到时须标注「[待源码确认]」。
2. **以历史文档为参考不造谣**：必须先完整读取待修改文件，保留用户未要求修改的章节；不得凭印象替换已有准确描述。
3. **以用户需求为根本不发散**：修改范围严格限定在用户指定内容，不主动改写无关章节。

## 工作流程
请严格按照以下步骤执行（已注入的技能 whalecloud-dev-tool-manual-modify 中有完整的分阶段指引，请遵照执行）：

1. **解析修改意图**：读取产品上下文与用户修改要求，拆解修改点列表。
2. **读取历史手册**：read_file 读取 proposed/ 下工作副本全文，记录不应被改动的章节。
3. **查阅源码**：与架构类文档相同，优先使用本地 GitNexus 缓存 `.../files/`；必要时 **仅** 用 run_shell 执行 user 消息中的 gnx-tools.js materialize。
4. **修改文档**：按修改点逐一更新，结构与标题层级尽量保持原稿风格。
5. **完整性校验**：未要求修改的章节不得删减或改写含义。
6. **写回文件**：write_file 将完整手册写回 proposed/ 路径（同一文件名）。

## 输出约束
- Markdown：若在回复中附带片段，**必须**且仅能用 ```markdown ... ``` 包裹；优先用工具写回完整正文。
- **禁止**改变文件名（必须与 targets[0] 一致）。
- **禁止**向知识文档根目录直写，仅允许 proposed/。
- **run_shell** 仅限 gnx-tools.js materialize。
- 未找到源码证据的事实性描述须标注「[待源码确认]」。
"""


def refine_system_prompt_for_doc_type(doc_type: str) -> str:
    """refine 系统提示：产品手册走手册修改技能，其余走架构修改技能。"""
    return (
        REFINE_SYSTEM_PROMPT_MANUAL
        if is_product_manual_knowledge_doc_type(doc_type)
        else REFINE_SYSTEM_PROMPT_ARCH
    )


REFINE_SKILL_ID_ARCH_MODIFY = "whalecloud-dev-tool-arch-modify"
REFINE_SKILL_ID_MANUAL_MODIFY = "whalecloud-dev-tool-manual-modify"


def refine_skill_id_for_doc_type(doc_type: str) -> str:
    """user 消息尾部引用的工作流技能 id。"""
    return (
        REFINE_SKILL_ID_MANUAL_MODIFY
        if is_product_manual_knowledge_doc_type(doc_type)
        else REFINE_SKILL_ID_ARCH_MODIFY
    )


# 架构文档生成：极简 system 提示前缀（技能指引由 format_rd_skill_guidance_section 拼接）
KNOWLEDGE_GEN_SYSTEM_INTRO = "你是一个研发工具助手，请按照用户的要求生成系统架构文档。"
# 产品开发手册：单文件 PRODUCT_DEV.md，工作流见 whalecloud-dev-tool-development-manual
KNOWLEDGE_GEN_SYSTEM_INTRO_MANUAL = (
    "你是一个研发工具助手，请按照用户的要求生成产品开发手册，"
    "产出文件名为 PRODUCT_DEV.md，并严格遵循已注入的研发技能中的流程与约束。"
)


def format_rd_skill_guidance_section(skill_bodies: list[str]) -> str:
    """将各技能正文块拼成注入 system prompt 的「研发工具技能指引」段；无技能时返回空串。"""
    if not skill_bodies:
        return ""
    return "\n\n---\n## 研发工具技能指引（请严格遵照以下指引执行任务）\n\n" + "\n\n---\n\n".join(
        skill_bodies
    )


def build_knowledge_gen_system_prompt(skill_bodies: list[str], *, doc_type: str = "") -> str:
    """生成任务使用的极简 system prompt（intro + 技能指引）。"""
    intro = (
        KNOWLEDGE_GEN_SYSTEM_INTRO_MANUAL
        if is_product_manual_knowledge_doc_type(doc_type)
        else KNOWLEDGE_GEN_SYSTEM_INTRO
    )
    return intro + format_rd_skill_guidance_section(skill_bodies)


def build_knowledge_generation_user_prompt(
    *,
    gitnexus_url: str,
    repo_name: str,
    gnx_repo_list: list[str],
    repo_info_detail: str,
    local_data_path: Path | str,
    output_dir: Path | str,
    prod_name: str,
    doc_type: str,
    request_repo_name: str,
    product_desc: str,
    code_path: str,
    core_features: str,
) -> str:
    """产品知识生成：架构（FUNCTIONAL/TECH）或产品手册（PRODUCT_DEV.md），由 doc_type 决定。"""
    gnx_list_str = ", ".join(gnx_repo_list) if gnx_repo_list else repo_name
    repo_list_section = ""
    if repo_info_detail.strip():
        repo_list_section = f"""
## 产品关联仓库（请求体 repo_info，须全量覆盖）
{repo_info_detail}
"""
    elif gnx_repo_list:
        repo_list_section = f"""
## 产品关联仓库（GNX_REPO_LIST）
{", ".join(f"`{n}`" for n in gnx_repo_list)}
"""
    gnx_repo_list_line = (
        f"- **GNX_REPO_LIST**（本任务已从请求体传入，**须逐项 materialize/read/grep，不得遗漏任一仓库**）：`{gnx_list_str}`"
        if gnx_repo_list
        else f"- **GNX_REPO_LIST**：当前仅 `{repo_name}`；若产品为多仓库，须调用 `get_repo_info.py --prod={prod_name}` 补全后再 materialize"
    )
    if is_product_manual_knowledge_doc_type(doc_type):
        return f"""gitnexus服务部署在[{gitnexus_url}]上。当前 **doc_type** 为产品手册，请使用产品开发手册生成技能（**whalecloud-dev-tool-development-manual**）的完整工作流，在本任务目录生成**唯一主交付物** **`PRODUCT_DEV.md`**（文件名必须一致，写入 **OUTPUT_DIR** 根下，不要改名为「产品研发手册.md」）。

## 路径与参数约定（脚本见 whalecloud-dev-tool-base-scripts；九段章节、模板变量与源码核验规则见 whalecloud-dev-tool-development-manual，勿改写目录语义）
- **SYNAPSE_URL**：SynapseService 地址（`IP:PORT`）。按该技能 Phase 1：可用 `get_doc.py` 拉取产品手册/产品架构等输入文档到临时目录；若本 HTTP 任务未显式传入，由你在执行中从运维上下文或必要步骤中解析，**不得臆造**服务地址。
- **GITNEXUS_URL**：`{gitnexus_url}`（`gnx-tools.js` 的 `--url`）。
- **REPO_NAME**（本任务主仓库，须与 GitNexus 一致）：`{repo_name}`（来自 `repo_info` 中 `repo_master=Y` 或列表首项；请求体 `repo_url`/`repo_name` 为兜底）。
{gnx_repo_list_line}
- **GNX_CACHE_DIR**（按仓库名分目录，等同 `synapse_home/tmp/gitnexus/<repo_name>/`）：主仓当前为 `{local_data_path}`；**GNX_REPO_LIST 中每个仓库均须各自 materialize 到对应缓存目录**。
- **OUTPUT_DIR**（手册落盘目录，与 Agent `default_cwd` 一致）：`{output_dir}`
- **OUTPUT**：固定为 **`PRODUCT_DEV.md`**（相对 **OUTPUT_DIR**）。**不要**生成功能/技术架构拆分文件（无 FUNCTIONAL_ARCH.md / TECH_ARCH.md 要求）；**不要**生成 `.excalidraw`（分层与依赖请用手册正文内 **Mermaid** 表达，与技能 Phase 3 一致）。
- **模板**：章节结构、占位符覆盖率与 `[待补充]`/`[待代码确认]` 等约束以技能内 `templates/产品研发手册.md` 与 Workflow 为准，但**落盘文件名**始终为 `PRODUCT_DEV.md`。
{repo_list_section}
## 任务上下文
产品标识（prod_name）：[{prod_name}]
文档类型（doc_type）：[{doc_type}]
请求体仓库名字段（主仓兜底，以 GNX_REPO_LIST 为准）：[{request_repo_name}]
产品描述：[{product_desc}]
主仓代码路径（code_path）：[{code_path}]
主要功能：[{core_features}]"""

    return f"""gitnexus服务部署在[{gitnexus_url}]上，请使用产品架构文档生成工具生成产品的系统架构和功能架构文档。

## 路径与参数约定（GitNexus / Synapse 脚本见技能 whalecloud-dev-tool-base-scripts；工作流与模板见 whalecloud-dev-tool-arch-create，勿改写目录语义）
- **SYNAPSE_URL**：SynapseService 地址（`IP:PORT`）。若需校验仓库列表，可用 `scripts/get_repo_info.py --prod={prod_name}` 对照 **GNX_REPO_LIST**；**以本任务已传入的 GNX_REPO_LIST 为执行依据**，不得只 materialize 主仓。
- **GITNEXUS_URL**：`{gitnexus_url}`（`gnx-tools.js` / `fetch-arch-data.js` 的 `--url`）。
- **REPO_NAME**（本任务主仓库，须与 GitNexus 图谱一致）：`{repo_name}`（来自 `repo_info` 中 `repo_master=Y` 或列表首项；请求体 `repo_url`/`repo_name` 为兜底，**禁止**臆造其它仓库名）。
{gnx_repo_list_line}
- **GNX_CACHE_DIR**（按仓库名分目录，等同 `synapse_home/tmp/gitnexus/<repo_name>/`）：主仓当前为 `{local_data_path}`；**GNX_REPO_LIST 中每个仓库均须各自 materialize 到对应缓存目录**。
- **OUTPUT_DIR**（架构交付物唯一落盘目录，与 Agent `default_cwd` 一致，等同 `_knowledge_docs_root`）：`{output_dir}`
- **OUTPUT**（须全部写入 **OUTPUT_DIR**）：`FUNCTIONAL_ARCH.md`、`TECH_ARCH.md` 为必选。另：**仅当**本任务已挂载技能 `whalecloud-dev-tool-excalidraw`（system 提示「研发工具技能指引」中含该技能块）时，还须写入 `sys-arch-layers.excalidraw`、`tech-stack.excalidraw`；**未挂载**时**不要**创建上述 `.excalidraw` 文件，技术栈与分层示意须在 `TECH_ARCH.md` 内用 **Mermaid** 代码块（见 `whalecloud-dev-tool-arch-create` Phase 3）
{repo_list_section}
## 任务上下文
产品标识（prod_name）：[{prod_name}]
文档类型（doc_type）：[{doc_type}]
请求体仓库名字段（主仓兜底，以 GNX_REPO_LIST 为准）：[{request_repo_name}]
产品描述：[{product_desc}]
主仓代码路径（code_path）：[{code_path}]
主要功能：[{core_features}]"""


def build_refine_product_context(
    *,
    product_desc: str,
    code_path: str,
    core_features: str,
    prod_name: str,
    doc_type: str,
    gitnexus_url: str,
    gnx_cache_dir: str,
    gnx_tools_script: str,
) -> str:
    """refine：注入 user 消息中的产品上下文块。"""
    return f"""\
产品描述：[{product_desc}]
代码路径：[{code_path}]
主要功能：[{core_features}]
产品标识：[{prod_name}]
文档类型：[{doc_type}]
GitNexus 服务地址(GITNEXUS_URL)：[{gitnexus_url}]
GitNexus 本地数据根目录(GNX_CACHE_DIR)：[{gnx_cache_dir}]
gnx-tools.js 脚本路径：[{gnx_tools_script}]"""


def build_refine_user_message(
    *,
    product_ctx: str,
    gnx_tools_script: str,
    gitnexus_url: str,
    repo_name_hint: str,
    gnx_cache_dir: str,
    user_prompt: str,
    proposed_copy: Path | str,
    refine_skill_id: str = REFINE_SKILL_ID_ARCH_MODIFY,
) -> str:
    """refine：完整 user 消息（含源码说明、修改要求、工作副本路径）。"""
    return f"""\
## 产品上下文（系统自动注入，请勿删除）
{product_ctx}

## 关于源码读取的说明
1. 优先检查「源码缓存根目录」下的 files/ 子目录是否存在且有内容（用 list_directory 检查）。
2. 若缓存存在，直接用 read_file / list_directory 读取，**无需拉取**。
3. 若缓存不存在或为空，使用 run_shell 执行以下命令拉取：
   node "{gnx_tools_script}" materialize --url {gitnexus_url} --repo {repo_name_hint} --cache {gnx_cache_dir} --concurrency 8
4. 拉取完成后，源码位于「源码缓存根目录/files/」下，再用 read_file / list_directory 读取。

## 用户修改要求
{user_prompt}

## 待修改文件（仅允许修改下列路径对应的临时工作副本）
- {proposed_copy}

请按照技能 {refine_skill_id} 的工作流程执行：先读历史文档，再查阅或拉取源码，最后将修改后的完整文档写回上述路径。"""
