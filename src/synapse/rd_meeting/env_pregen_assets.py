"""环境预生成：控熵归档 + 工程落盘（产品文档沿用开门 ``doc/``）。"""

from __future__ import annotations

import logging
import os
import shutil
import time
from pathlib import Path
from typing import Any

from synapse.rd_meeting.paths import (
    archive_node_dir,
    env_entropy_dir,
    env_root,
    product_doc_root,
    scope_dir,
)
from synapse.rd_meeting.product_assets import (
    _materialize_doc,
    _now_iso,
)
from synapse.rd_meeting.product_context import (
    _normalize_product_wire,
    match_prod_row_by_prod,
)
from synapse.rd_sop.nodes import stage_name_for_id

logger = logging.getLogger(__name__)

# 测试用阻塞时长（秒）；设置环境变量 SYNAPSE_ENV_PREGEN_TEST_SLEEP=1 后生效
_ENV_PREGEN_TEST_SLEEP_SECONDS = 100_000


def _env_pregen_test_sleep() -> None:
    """测试用：环境预生成开始前阻塞，便于观察/中断流程。"""
    flag = os.environ.get("SYNAPSE_ENV_PREGEN_TEST_SLEEP", "").strip().lower()
    if flag not in ("1", "true", "yes", "on"):
        return
    logger.warning(
        "env_pregen: test sleep %ss (SYNAPSE_ENV_PREGEN_TEST_SLEEP=%s)",
        _ENV_PREGEN_TEST_SLEEP_SECONDS,
        flag,
    )
    time.sleep(_ENV_PREGEN_TEST_SLEEP_SECONDS)

_ENTROPY_SOURCE_NODE = "entropy_gen"
_ENTROPY_SOURCE_STAGE_ID = 2


def _copy_tree_files(src: Path, dest: Path) -> list[str]:
    """递归复制 ``src`` 下文件至 ``dest``，返回相对路径列表。"""
    copied: list[str] = []
    if not src.is_dir():
        return copied
    dest.mkdir(parents=True, exist_ok=True)
    for path in src.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(src)
        target = dest / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        try:
            shutil.copy2(path, target)
            copied.append(str(rel).replace("\\", "/"))
        except OSError as exc:
            logger.warning("env copy failed %s -> %s: %s", path, target, exc)
    return copied


def _inventory_product_docs(scope_id: str) -> dict[str, Any]:
    """盘点开门已落盘的 ``doc/`` 目录（仅列举，不复制）。"""
    doc_root = product_doc_root(scope_id)
    entry: dict[str, Any] = {
        "local_path": str(doc_root),
        "doc_types": [],
        "status": "skipped",
        "error": "",
    }
    if not doc_root.is_dir():
        entry["error"] = "产品文档根目录不存在"
        return entry
    doc_types: list[str] = []
    for sub in sorted(doc_root.iterdir()):
        if not sub.is_dir():
            continue
        if any(path.is_file() for path in sub.rglob("*")):
            doc_types.append(sub.name)
    if not doc_types:
        entry["error"] = "产品文档目录为空"
        return entry
    entry["doc_types"] = doc_types
    entry["status"] = "ok"
    return entry


def _copy_entropy_from_archive(scope_id: str) -> dict[str, Any]:
    """从 ``archive/<需求设计>/entropy_gen/`` 复制控熵文件至 ``env/entropy/``。"""
    stage_name = stage_name_for_id(_ENTROPY_SOURCE_STAGE_ID)
    src = archive_node_dir(scope_id, stage_name, _ENTROPY_SOURCE_NODE)
    dest = env_entropy_dir(scope_id)
    entry: dict[str, Any] = {
        "source_dir": str(src),
        "local_path": str(dest),
        "files": [],
        "status": "skipped",
        "error": "",
    }
    if not src.is_dir():
        entry["error"] = f"控熵归档目录不存在: {src}"
        return entry
    files = _copy_tree_files(src, dest)
    if not files:
        entry["error"] = "控熵归档目录为空"
        return entry
    entry["files"] = files
    entry["status"] = "ok"
    return entry


def bootstrap_env_pregen(
    scope_id: str,
    prod: str,
    *,
    wire_row: dict[str, Any] | None = None,
    catalog_rows: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """环境预生成：补拉 catalog 文档至 ``doc/``、控熵至 ``env/``、工程落盘至 ``sandbox/``。"""
    _env_pregen_test_sleep()
    sid = (scope_id or "").strip()
    prod_key = (prod or "").strip()
    scope_dir(sid).mkdir(parents=True, exist_ok=True)
    root = env_root(sid)
    root.mkdir(parents=True, exist_ok=True)
    doc_root = product_doc_root(sid)

    result: dict[str, Any] = {
        "prod": prod_key,
        "env_root": str(root),
        "doc_root": str(doc_root),
        "docs": [],
        "entropy": {},
        "product_docs": {},
        "status": "ok",
        "errors": [],
        "materialized_at": _now_iso(),
    }

    if not sid or not prod_key:
        result["status"] = "failed"
        result["errors"].append("scope_id 或 prod 为空")
        return result

    hit = wire_row
    if hit is None and catalog_rows:
        hit = match_prod_row_by_prod(catalog_rows, prod_key)
    if hit is None:
        result["status"] = "failed"
        result["errors"].append(f"产品「{prod_key}」不在 catalog 中，无法拉取文档")
        return result

    normalized = _normalize_product_wire(hit)
    doc_entries = [d for d in (normalized.get("docs") or []) if isinstance(d, dict)]

    for doc in doc_entries:
        row = _materialize_doc(sid, prod_key, doc)
        result["docs"].append(row)
        if row.get("status") == "failed":
            result["errors"].append(f"文档 {row.get('doc_type')}: {row.get('error')}")

    product_docs = _inventory_product_docs(sid)
    result["product_docs"] = product_docs

    entropy = _copy_entropy_from_archive(sid)
    result["entropy"] = entropy
    if entropy.get("status") != "ok":
        result["errors"].append(f"控熵: {entropy.get('error')}")

    from synapse.rd_meeting.env_pregen_layout import bootstrap_engineering_layout

    engineering = bootstrap_engineering_layout(sid, hit)
    result["engineering"] = engineering
    if engineering.get("status") == "failed":
        result["errors"].extend(engineering.get("errors") or [])

    has_doc_ok = any(d.get("status") == "ok" for d in result["docs"])
    has_product_docs_ok = product_docs.get("status") == "ok"
    has_entropy_ok = entropy.get("status") == "ok"
    has_engineering_ok = engineering.get("status") in ("ok", "partial")

    if result["errors"]:
        if has_doc_ok or has_product_docs_ok or has_entropy_ok or has_engineering_ok:
            result["status"] = "partial"
        else:
            result["status"] = "failed"
    return result


def format_env_pregen_report(assets: dict[str, Any], *, node_name: str) -> str:
    """生成 ``环境预生成报告.md`` 正文。"""
    lines = [
        f"# {node_name} — 环境预生成",
        "",
        "本节点由系统脚本执行（文档拉取 + 控熵归档），未调用大模型与人工确认。",
        "",
        f"- **环境目录**：`{assets.get('env_root') or ''}`（控熵）",
        f"- **文档目录**：`{assets.get('doc_root') or ''}`",
        f"- **产品**：{assets.get('prod') or '—'}",
        f"- **落盘时间**：{assets.get('materialized_at') or '—'}",
        f"- **总体状态**：{assets.get('status') or '—'}",
        "",
        "## 文档",
        "",
    ]
    docs = assets.get("docs") if isinstance(assets.get("docs"), list) else []
    if not docs:
        lines.append("（无 catalog 文档项）")
    else:
        for row in docs:
            if not isinstance(row, dict):
                continue
            lines.append(
                f"- **{row.get('doc_type') or '—'}**：`{row.get('local_path') or '—'}` "
                f"— {row.get('status') or '—'}"
                + (f"（{row.get('error')}）" if row.get("error") else "")
            )

    product_docs = assets.get("product_docs") if isinstance(assets.get("product_docs"), dict) else {}
    if product_docs.get("status") == "ok":
        types = product_docs.get("doc_types") or []
        lines.extend(
            ["", f"- **开门文档**：`{product_docs.get('local_path') or ''}`（{len(types)} 类）"]
        )

    entropy = assets.get("entropy") if isinstance(assets.get("entropy"), dict) else {}
    lines.extend(["", "## 控熵文件", ""])
    if entropy.get("status") == "ok":
        files = entropy.get("files") or []
        lines.append(f"- **目录**：`{entropy.get('local_path') or ''}`")
        lines.append(f"- **文件数**：{len(files)}")
        for name in files[:20]:
            lines.append(f"  - `{name}`")
        if len(files) > 20:
            lines.append(f"  - …共 {len(files)} 个文件")
    else:
        lines.append(f"（{entropy.get('error') or '未复制'}）")

    engineering = assets.get("engineering") if isinstance(assets.get("engineering"), dict) else {}
    lines.extend(["", "## 沙箱工程路径", ""])
    targets = engineering.get("targets") if isinstance(engineering.get("targets"), list) else []
    if not targets:
        lines.append("（未解析到 catalog 关联仓库工程路径）")
    else:
        for row in targets:
            if not isinstance(row, dict):
                continue
            mod = row.get("module") or "—"
            cp = row.get("code_path") or ""
            root = row.get("engineering_root") or "—"
            suffix = f"/{cp}" if cp else ""
            lines.append(f"- **{mod}**{suffix}：`{root}`")

    layouts = engineering.get("layouts") if isinstance(engineering.get("layouts"), list) else []
    if layouts:
        lines.append("")
        lines.append(f"- **工程落盘状态**：{engineering.get('status') or '—'}")
        for row in layouts:
            if not isinstance(row, dict):
                continue
            dev_t = row.get("dev_templates") if isinstance(row.get("dev_templates"), dict) else {}
            wo = row.get("work_order_docs") if isinstance(row.get("work_order_docs"), dict) else {}
            dev_files = dev_t.get("files") or []
            wo_files = wo.get("files") or []
            lines.append(
                f"  - `{row.get('engineering_root') or '—'}`："
                f"AGENTS/规范 {len(dev_files)} 个，归档文档 {len(wo_files)} 个 — {row.get('status') or '—'}"
            )

    lines.extend(
        [
            "",
            "## 结论",
            "",
            "环境预生成已完成：控熵已归档至 env 目录，产品文档沿用 doc 目录，"
            "研发文档与 AGENTS.md 已落盘至沙箱工程路径，可进入下一 SOP 节点。",
            "",
        ]
    )
    return "\n".join(lines)
