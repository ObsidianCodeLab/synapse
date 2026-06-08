"""product_knowledge/generate 全量 repo_info 解析与 prompt 注入。"""

from pathlib import Path

from synapse.api.routes.dev_iwhalecloud_knowledge import (
    ProductKnowledgeRepoRow,
    _format_repo_info_for_prompt,
    _repo_names_from_repo_info,
    _resolve_main_repo_from_info,
)
from synapse.api.routes.dev_iwhalecloud_prompt import build_knowledge_generation_user_prompt


def test_repo_names_from_repo_info_dedupes_and_preserves_order() -> None:
    rows = [
        ProductKnowledgeRepoRow(
            repo_url="https://git.example.com/org/repo-a.git",
            repo_master="Y",
        ),
        ProductKnowledgeRepoRow(
            repo_url="https://git.example.com/org/repo-b.git",
            repo_master="N",
        ),
        ProductKnowledgeRepoRow(
            repo_url="https://git.example.com/org/repo-a.git",
            repo_master="N",
        ),
    ]
    assert _repo_names_from_repo_info(rows) == ["repo-a", "repo-b"]


def test_resolve_main_repo_prefers_master_flag() -> None:
    rows = [
        ProductKnowledgeRepoRow(
            repo_url="https://git.example.com/org/secondary.git",
            repo_master="N",
            code_path="/code/secondary",
        ),
        ProductKnowledgeRepoRow(
            repo_url="https://git.example.com/org/primary.git",
            repo_master="Y",
            code_path="/code/primary",
        ),
    ]
    name, main_row = _resolve_main_repo_from_info(
        rows, fallback_name="fallback", fallback_url=None
    )
    assert name == "primary"
    assert main_row is not None
    assert main_row.code_path == "/code/primary"


def test_prompt_includes_gnx_repo_list_and_repo_info_detail() -> None:
    rows = [
        ProductKnowledgeRepoRow(
            repo_url="https://git.example.com/org/repo-a.git",
            code_path="/a",
            repo_func="核心",
            repo_master="Y",
        ),
        ProductKnowledgeRepoRow(
            repo_url="https://git.example.com/org/repo-b.git",
            code_path="/b",
            repo_func="前端",
            repo_master="N",
        ),
    ]
    gnx_repo_list = _repo_names_from_repo_info(rows)
    prompt = build_knowledge_generation_user_prompt(
        gitnexus_url="http://127.0.0.1:11011/",
        repo_name="repo-a",
        gnx_repo_list=gnx_repo_list,
        repo_info_detail=_format_repo_info_for_prompt(rows),
        local_data_path=Path("/tmp/gitnexus/repo-a"),
        output_dir=Path("/tmp/docs/prod/arch"),
        prod_name="测试产品",
        doc_type="产品架构",
        request_repo_name="repo-a",
        product_desc="desc",
        code_path="/a",
        core_features="feat",
    )
    assert "GNX_REPO_LIST" in prompt
    assert "`repo-a, repo-b`" in prompt
    assert "repo-b" in prompt
    assert "产品关联仓库（请求体 repo_info" in prompt
    assert "不得遗漏任一仓库" in prompt
