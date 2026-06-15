"""platform_crawler 单元测试（不访问真实技能平台）。"""

from __future__ import annotations

from synapse.skills.platform_crawler import _format_skill, group_hot_columns


def test_format_skill_maps_platform_fields() -> None:
    skill = {
        "id": 4751,
        "displayName": "self-improving agent",
        "slug": "self-improving-agent",
        "descriptionZh": "记录经验教训",
        "downloads": 460145,
        "stars": 3767,
        "tagGroups": [{"tags": [{"tagName": "通用基础能力"}]}],
        "fetchedAt": "2026-04-02T19:40:47",
    }
    formatted = _format_skill(skill, "official", rank_type="downloads", rank=1)
    assert formatted["name"] == "self-improving agent"
    assert formatted["slug"] == "self-improving-agent"
    assert formatted["tags"] == "通用基础能力"
    assert formatted["rank_downloads"] == 1
    assert formatted["rank_stars"] is None


def test_group_hot_columns_matches_frontend_shape() -> None:
    flat = [
        {
            "id": 1,
            "name": "A",
            "slug": "a",
            "description": "desc",
            "tags": "",
            "downloads": 10,
            "stars": 2,
            "skill_type": "official",
            "rank_downloads": 2,
            "rank_stars": None,
            "rank_recent": None,
            "record_date": "2026-06-15",
            "fetched_At": "",
        },
        {
            "id": 2,
            "name": "B",
            "slug": "b",
            "description": "desc",
            "tags": "",
            "downloads": 20,
            "stars": 5,
            "skill_type": "official",
            "rank_downloads": 1,
            "rank_stars": 1,
            "rank_recent": None,
            "record_date": "2026-06-15",
            "fetched_At": "",
        },
        {
            "id": 3,
            "name": "C",
            "slug": "c",
            "description": "desc",
            "tags": "",
            "downloads": 1,
            "stars": 0,
            "skill_type": "official",
            "rank_downloads": None,
            "rank_stars": None,
            "rank_recent": 1,
            "record_date": "2026-06-15",
            "fetched_At": "",
        },
    ]
    columns = group_hot_columns(flat)
    assert [col["code"] for col in columns] == ["downloads", "stars", "recent"]
    assert [item["slug"] for item in columns[0]["items"]] == ["b", "a"]
    assert [item["slug"] for item in columns[1]["items"]] == ["b"]
    assert [item["slug"] for item in columns[2]["items"]] == ["c"]
