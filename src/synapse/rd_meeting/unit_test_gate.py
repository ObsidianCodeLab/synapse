"""测试案例节点：结构化评审 payload、pytest 动态执行与人工裁决。"""

from __future__ import annotations

import json
import logging
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

from synapse.rd_meeting.paths import archive_node_dir
from synapse.rd_sop.nodes import stage_name_for_id

logger = logging.getLogger(__name__)

NODE_ID = "unit_test"
STAGE_NAME = stage_name_for_id(4)
JSON_NAME = "unit_test_review.json"
MD_NAME = "测试案例说明.md"
REVISION_CONTEXT_NAME = "revision_context.json"
SCHEMA_VERSION = 1
REVISION_CONTEXT_SCHEMA_VERSION = 1
MIN_HUMAN_REVIEW_COMMENT_LEN = 20
MAX_RAW_OUTPUT_TAIL = 12000

CaseReviewStatus = Literal["pending", "approved", "needs_change"]
TestResultStatus = Literal["pending", "passed", "failed", "skipped", "error"]

_UNIT_TEST_HITL_FORBIDDEN = (
    "unit_test 节点禁止使用 submit_hitl_questionnaire。"
    "请先产出 unit_test_review.json 与 测试案例说明.md；"
    "人工在「测试案例评审」面板逐条确认用例并执行测试。"
)
UNIT_TEST_HITL_FORBIDDEN = _UNIT_TEST_HITL_FORBIDDEN


def uses_unit_test_gate(node_id: str) -> bool:
    """该节点走专用测试案例评审门控，不走 NODE_REVIEW / generate_agent_summaries。"""
    return (node_id or "").strip() == NODE_ID


def archive_dir(scope_id: str) -> Path:
    return archive_node_dir(scope_id, STAGE_NAME, NODE_ID)


def json_path(scope_id: str) -> Path:
    return archive_dir(scope_id) / JSON_NAME


def md_path(scope_id: str) -> Path:
    return archive_dir(scope_id) / MD_NAME


def revision_context_path(scope_id: str) -> Path:
    return archive_dir(scope_id) / REVISION_CONTEXT_NAME


def _now_iso() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _read_json_file(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("unit_test_review json read failed %s: %s", path, exc)
        return None
    return data if isinstance(data, dict) else None


def _write_json_file(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _normalize_case(row: dict[str, Any], *, fallback_id: str) -> dict[str, Any] | None:
    name = str(row.get("name") or row.get("title") or "").strip()
    if not name:
        return None
    review = row.get("human_review") if isinstance(row.get("human_review"), dict) else {}
    status = str(review.get("status") or "pending").strip().lower()
    if status not in ("pending", "approved", "needs_change"):
        status = "pending"
    last = row.get("last_result") if isinstance(row.get("last_result"), dict) else {}
    result_status = str(last.get("status") or "pending").strip().lower()
    if result_status not in ("pending", "passed", "failed", "skipped", "error"):
        result_status = "pending"
    return {
        "id": str(row.get("id") or fallback_id).strip() or fallback_id,
        "name": name,
        "scenario": str(row.get("scenario") or row.get("description") or "").strip(),
        "requirements": str(row.get("requirements") or row.get("requirement") or "").strip(),
        "acceptance_ref": str(row.get("acceptance_ref") or row.get("acceptance") or "").strip(),
        "test_file": str(row.get("test_file") or row.get("file") or "").strip(),
        "test_function": str(row.get("test_function") or row.get("function") or "").strip(),
        "last_result": {
            "status": result_status,
            "message": str(last.get("message") or "").strip(),
            "duration_ms": int(last.get("duration_ms") or 0),
            "ran_at": last.get("ran_at"),
        },
        "human_review": {
            "status": status,
            "comment": str(review.get("comment") or "").strip(),
        },
    }


def normalize_payload(payload: dict[str, Any]) -> dict[str, Any]:
    out = dict(payload)
    out["schema_version"] = int(out.get("schema_version") or SCHEMA_VERSION)
    suite = out.get("test_suite") if isinstance(out.get("test_suite"), dict) else {}
    files = suite.get("test_files")
    if not isinstance(files, list):
        files = []
    suite["test_files"] = [str(x).strip() for x in files if str(x).strip()]
    suite.setdefault("test_list_path", "tests/单元测试用例列表.md")
    suite.setdefault("run_command", "")
    out["test_suite"] = suite
    cases_in = out.get("test_cases") if isinstance(out.get("test_cases"), list) else []
    cases: list[dict[str, Any]] = []
    for i, row in enumerate(cases_in):
        if not isinstance(row, dict):
            continue
        norm = _normalize_case(row, fallback_id=f"tc-{i + 1}")
        if norm:
            cases.append(norm)
    out["test_cases"] = cases
    hr = out.get("human_review") if isinstance(out.get("human_review"), dict) else {}
    hr.setdefault("comment", "")
    hr.setdefault("decision", hr.get("decision"))
    hr.setdefault("decided_at", hr.get("decided_at"))
    out["human_review"] = hr
    last_run = out.get("last_run") if isinstance(out.get("last_run"), dict) else {}
    for key in ("passed", "failed", "skipped", "total"):
        last_run.setdefault(key, int(last_run.get(key) or 0))
    last_run.setdefault("exit_code", last_run.get("exit_code"))
    last_run.setdefault("ran_at", last_run.get("ran_at"))
    last_run.setdefault("raw_output_tail", str(last_run.get("raw_output_tail") or ""))
    out["last_run"] = last_run
    return out


def load_unit_test_review_payload(scope_id: str) -> dict[str, Any] | None:
    data = _read_json_file(json_path(scope_id))
    if not data:
        return None
    return normalize_payload(data)


def validate_unit_test_review_json(scope_id: str) -> tuple[bool, list[str]]:
    """校验 AI 阶段应落盘的双文件结构。"""
    errors: list[str] = []
    jp = json_path(scope_id)
    mp = md_path(scope_id)
    if not jp.is_file():
        errors.append(f"缺少 {JSON_NAME}")
    else:
        data = _read_json_file(jp)
        if not data:
            errors.append(f"{JSON_NAME} 无法解析")
        else:
            payload = normalize_payload(data)
            if not payload.get("test_cases"):
                errors.append("test_cases 至少 1 条")
            suite = payload.get("test_suite") if isinstance(payload.get("test_suite"), dict) else {}
            if not suite.get("test_files"):
                errors.append("test_suite.test_files 不能为空")
    if not mp.is_file():
        errors.append(f"缺少 {MD_NAME}")
    elif mp.stat().st_size < 200:
        errors.append(f"{MD_NAME} 体积过小（<200B）")
    return (len(errors) == 0, errors)


def resolve_test_cwd(scope_id: str) -> Path | None:
    """解析 pytest 工作目录：优先环境预生成 engineering_root，其次 product code_root。"""
    sid = (scope_id or "").strip()
    if not sid:
        return None
    try:
        from synapse.rd_meeting.room_runtime import read_meeting_pipeline_json
        from synapse.rd_meeting.system_node_display import _first_engineering_root

        pipe = read_meeting_pipeline_json(sid) or {}
        ctx = pipe.get("context") if isinstance(pipe.get("context"), dict) else {}
        env_assets = ctx.get("env_pregen_assets") if isinstance(ctx.get("env_pregen_assets"), dict) else {}
        eng_root = _first_engineering_root(env_assets)
        if eng_root:
            p = Path(eng_root)
            if p.is_dir():
                return p
    except Exception as exc:
        logger.warning("unit_test resolve engineering_root failed scope=%s: %s", sid, exc)

    try:
        from synapse.rd_meeting.product_assets import load_product_assets_from_pipeline

        assets = load_product_assets_from_pipeline(sid)
        if isinstance(assets, dict):
            code_root = str(assets.get("code_root") or "").strip()
            if code_root:
                p = Path(code_root)
                if p.is_dir():
                    return p
    except Exception as exc:
        logger.warning("unit_test resolve code_root failed scope=%s: %s", sid, exc)
    return None


def _collect_test_targets(payload: dict[str, Any]) -> list[str]:
    suite = payload.get("test_suite") if isinstance(payload.get("test_suite"), dict) else {}
    files = [str(x).strip() for x in (suite.get("test_files") or []) if str(x).strip()]
    if files:
        return files
    cases = payload.get("test_cases") if isinstance(payload.get("test_cases"), list) else []
    out: list[str] = []
    seen: set[str] = set()
    for row in cases:
        if not isinstance(row, dict):
            continue
        tf = str(row.get("test_file") or "").strip()
        fn = str(row.get("test_function") or "").strip()
        if tf and fn:
            target = f"{tf}::{fn}"
        elif tf:
            target = tf
        else:
            continue
        if target not in seen:
            seen.add(target)
            out.append(target)
    return out


def _match_case_to_junit(case: dict[str, Any], testcase_el: ET.Element) -> bool:
    classname = str(testcase_el.get("classname") or "")
    name = str(testcase_el.get("name") or "")
    file_attr = str(testcase_el.get("file") or "")
    fn = str(case.get("test_function") or "").strip()
    tf = str(case.get("test_file") or "").strip().replace("\\", "/")
    nodeid = f"{classname}::{name}" if classname else name
    hay = f"{file_attr} {classname} {name} {nodeid}".replace("\\", "/")
    if fn and fn not in hay:
        return False
    if tf:
        tail = tf.split("/")[-1]
        stem = tail.rsplit(".", 1)[0] if tail else ""
        return tf in hay or (tail and tail in hay) or (stem and stem in hay)
    return bool(fn)


def _parse_junit_results(xml_path: Path, payload: dict[str, Any]) -> dict[str, Any]:
    cases = payload.get("test_cases") if isinstance(payload.get("test_cases"), list) else []
    by_case: dict[str, dict[str, Any]] = {str(c.get("id") or ""): c for c in cases if isinstance(c, dict)}
    unmatched: list[ET.Element] = []
    try:
        root = ET.parse(xml_path).getroot()
    except (ET.ParseError, OSError) as exc:
        return {
            "matched": 0,
            "error": f"junit 解析失败: {exc}",
            "passed": 0,
            "failed": 0,
            "skipped": 0,
            "total": 0,
        }

    passed = failed = skipped = 0
    for testcase in root.iter("testcase"):
        if testcase.tag != "testcase":
            continue
        matched_id: str | None = None
        for cid, case in by_case.items():
            if _match_case_to_junit(case, testcase):
                matched_id = cid
                break
        status: TestResultStatus = "passed"
        message = ""
        if testcase.find("failure") is not None:
            status = "failed"
            message = str(testcase.find("failure").get("message") or testcase.find("failure").text or "")
            failed += 1
        elif testcase.find("error") is not None:
            status = "error"
            message = str(testcase.find("error").get("message") or testcase.find("error").text or "")
            failed += 1
        elif testcase.find("skipped") is not None:
            status = "skipped"
            message = str(testcase.find("skipped").get("message") or "")
            skipped += 1
        else:
            passed += 1
        if matched_id and matched_id in by_case:
            case = by_case[matched_id]
            case["last_result"] = {
                "status": status,
                "message": message.strip()[:2000],
                "duration_ms": int(float(testcase.get("time") or 0) * 1000),
                "ran_at": _now_iso(),
            }
        else:
            unmatched.append(testcase)

    total = passed + failed + skipped
    return {
        "matched": len(cases) - len(unmatched),
        "passed": passed,
        "failed": failed,
        "skipped": skipped,
        "total": total,
    }


def run_unit_tests(scope_id: str, *, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    """在工程目录执行 pytest，回写各用例 last_result 与 last_run 汇总。"""
    sid = (scope_id or "").strip()
    data = normalize_payload(payload) if payload else load_unit_test_review_payload(sid)
    if not data:
        raise ValueError("unit_test_review_not_found")

    cwd = resolve_test_cwd(sid)
    if cwd is None or not cwd.is_dir():
        raise ValueError("test_cwd_not_found")

    targets = _collect_test_targets(data)
    if not targets:
        raise ValueError("no_test_targets")

    suite = data.setdefault("test_suite", {})
    if isinstance(suite, dict):
        suite["code_root"] = str(cwd)

    with tempfile.NamedTemporaryFile(suffix=".xml", delete=False) as tmp:
        junit_path = Path(tmp.name)

    cmd = [
        sys.executable,
        "-m",
        "pytest",
        *targets,
        "-v",
        "--tb=short",
        f"--junitxml={junit_path}",
    ]
    suite_cmd = str((suite or {}).get("run_command") or "").strip() if isinstance(suite, dict) else ""
    if suite_cmd:
        cmd_note = suite_cmd
    else:
        cmd_note = " ".join(cmd)

    try:
        proc = subprocess.run(
            cmd,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=600,
        )
    except subprocess.TimeoutExpired:
        raise ValueError("pytest_timeout") from None
    except OSError as exc:
        raise ValueError(f"pytest_start_failed: {exc}") from exc

    raw = ((proc.stdout or "") + "\n" + (proc.stderr or "")).strip()
    summary = _parse_junit_results(junit_path, data)
    try:
        junit_path.unlink(missing_ok=True)
    except OSError:
        pass

    data["last_run"] = {
        "ran_at": _now_iso(),
        "exit_code": int(proc.returncode),
        "passed": int(summary.get("passed") or 0),
        "failed": int(summary.get("failed") or 0),
        "skipped": int(summary.get("skipped") or 0),
        "total": int(summary.get("total") or 0),
        "command": cmd_note,
        "raw_output_tail": raw[-MAX_RAW_OUTPUT_TAIL:],
    }
    _write_json_file(json_path(sid), data)
    return data


def ensure_human_review_pending_for_gate(scope_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    out = normalize_payload(payload)
    hr = out.get("human_review") if isinstance(out.get("human_review"), dict) else {}
    if str(hr.get("decision") or "").strip().lower() == "approve":
        return out
    hr["decision"] = None
    hr.setdefault("comment", "")
    hr["decided_at"] = None
    out["human_review"] = hr
    for case in out.get("test_cases") or []:
        if not isinstance(case, dict):
            continue
        review = case.get("human_review") if isinstance(case.get("human_review"), dict) else {}
        if str(review.get("status") or "pending") != "approved":
            review["status"] = "pending"
        case["human_review"] = review
    _write_json_file(json_path(scope_id), out)
    return out


def save_case_reviews(scope_id: str, case_updates: list[dict[str, Any]]) -> dict[str, Any]:
    payload = load_unit_test_review_payload(scope_id)
    if not payload:
        raise ValueError("unit_test_review_not_found")
    by_id = {str(c.get("id") or ""): c for c in payload.get("test_cases") or []}
    for upd in case_updates:
        if not isinstance(upd, dict):
            continue
        cid = str(upd.get("id") or "").strip()
        if not cid or cid not in by_id:
            continue
        case = by_id[cid]
        review = case.get("human_review") if isinstance(case.get("human_review"), dict) else {}
        if "status" in upd:
            st = str(upd.get("status") or "pending").strip().lower()
            if st in ("pending", "approved", "needs_change"):
                review["status"] = st
        if "comment" in upd:
            review["comment"] = str(upd.get("comment") or "").strip()
        case["human_review"] = review
    _write_json_file(json_path(scope_id), payload)
    return payload


def apply_human_decision(
    scope_id: str,
    *,
    decision: Literal["approve", "revise"],
    comment: str = "",
    case_updates: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    payload = load_unit_test_review_payload(scope_id)
    if not payload:
        raise ValueError("unit_test_review_not_found")
    if case_updates:
        save_case_reviews(scope_id, case_updates)
        payload = load_unit_test_review_payload(scope_id) or payload

    cases = payload.get("test_cases") if isinstance(payload.get("test_cases"), list) else []
    if decision == "approve":
        not_approved = [
            str(c.get("name") or c.get("id") or "")
            for c in cases
            if isinstance(c, dict)
            and str((c.get("human_review") or {}).get("status") or "pending") != "approved"
        ]
        if not_approved:
            raise ValueError("not_all_cases_approved")
        last_run = payload.get("last_run") if isinstance(payload.get("last_run"), dict) else {}
        failed = int(last_run.get("failed") or 0)
        if failed > 0:
            raise ValueError("tests_still_failing")
        if len(comment.strip()) < MIN_HUMAN_REVIEW_COMMENT_LEN:
            raise ValueError("comment_too_short")
    else:
        needs_change = [
            c
            for c in cases
            if isinstance(c, dict)
            and str((c.get("human_review") or {}).get("status") or "") == "needs_change"
        ]
        if not needs_change:
            raise ValueError("no_cases_need_change")
        for row in needs_change:
            review = row.get("human_review") if isinstance(row.get("human_review"), dict) else {}
            if len(str(review.get("comment") or "").strip()) < 8:
                raise ValueError("case_comment_required")

    hr = payload.get("human_review") if isinstance(payload.get("human_review"), dict) else {}
    hr["decision"] = "approve" if decision == "approve" else "revise"
    hr["comment"] = comment.strip()
    hr["decided_at"] = _now_iso()
    payload["human_review"] = hr
    _write_json_file(json_path(scope_id), payload)
    return payload


def write_revision_context(scope_id: str, payload: dict[str, Any], comment: str) -> None:
    cases = payload.get("test_cases") if isinstance(payload.get("test_cases"), list) else []
    to_revise = [
        {
            "id": str(c.get("id") or ""),
            "name": str(c.get("name") or ""),
            "comment": str((c.get("human_review") or {}).get("comment") or ""),
        }
        for c in cases
        if isinstance(c, dict)
        and str((c.get("human_review") or {}).get("status") or "") == "needs_change"
    ]
    ctx = {
        "schema_version": REVISION_CONTEXT_SCHEMA_VERSION,
        "node_id": NODE_ID,
        "written_at": _now_iso(),
        "overall_comment": comment.strip(),
        "cases_to_revise": to_revise,
    }
    _write_json_file(revision_context_path(scope_id), ctx)


def has_revision_context(scope_id: str) -> bool:
    data = _read_json_file(revision_context_path(scope_id))
    if not isinstance(data, dict):
        return False
    cases = data.get("cases_to_revise")
    return isinstance(cases, list) and len(cases) > 0


def load_revision_context(scope_id: str) -> dict[str, Any] | None:
    data = _read_json_file(revision_context_path(scope_id))
    return data if isinstance(data, dict) else None


def clear_revision_context(scope_id: str) -> None:
    path = revision_context_path(scope_id)
    if path.is_file():
        try:
            path.unlink()
        except OSError as exc:
            logger.warning("unit_test clear revision_context failed %s: %s", path, exc)


def format_revision_prompt_block(scope_id: str) -> str:
    ctx = load_revision_context(scope_id)
    if not ctx:
        return ""
    lines = ["## 测试案例增量修订要点", ""]
    overall = str(ctx.get("overall_comment") or "").strip()
    if overall:
        lines.extend([f"**总体意见**：{overall}", ""])
    lines.append("须逐条修订以下用例（完善测试代码与 JSON/Markdown 描述）：")
    for row in ctx.get("cases_to_revise") or []:
        if not isinstance(row, dict):
            continue
        name = str(row.get("name") or row.get("id") or "").strip()
        cmt = str(row.get("comment") or "").strip()
        lines.append(f"- **{name}**：{cmt or '（请补充评审意见）'}")
    lines.append("")
    return "\n".join(lines)
