"""产品 owner_info 归属：解密后按姓名 + 工号比对，及团队/部门管理范围继承。"""

from __future__ import annotations

import pytest

from synapse.api.routes.dev_iwhalecloud import (
    _org_fields_from_user_blob,
    _owner_identities_match,
    _owner_identity_from_user_blob,
    _resolve_product_manage_scope,
)


def test_owner_identity_from_user_blob_prefers_employee_id():
    name, eid = _owner_identity_from_user_blob(
        {"name": " 张三 ", "employee_id": "0027012345", "username": "other"}
    )
    assert name == "张三"
    assert eid == "0027012345"


def test_owner_identity_from_user_blob_falls_back_to_username():
    name, eid = _owner_identity_from_user_blob({"name": "李四", "username": "0027099999"})
    assert name == "李四"
    assert eid == "0027099999"


@pytest.mark.parametrize(
    ("local", "stored_cipher", "decrypt_side_effect", "expected"),
    [
        (
            {"name": "张三", "employee_id": "001"},
            "cipher-a",
            {"name": "张三", "employee_id": "001"},
            True,
        ),
        (
            {"name": "张三", "employee_id": "001"},
            "cipher-a",
            {"name": "张三", "employee_id": "002"},
            False,
        ),
        (
            {"name": "张三", "employee_id": "001"},
            "cipher-a",
            {"name": "李四", "employee_id": "001"},
            False,
        ),
        (
            {"name": "张三", "employee_id": "001", "password": "new"},
            "cipher-old",
            {"name": "张三", "employee_id": "001", "password": "old"},
            True,
        ),
    ],
)
def test_owner_identities_match_by_name_and_employee_id(
    monkeypatch,
    local,
    stored_cipher,
    decrypt_side_effect,
    expected,
):
    def fake_decrypt(raw_cipher: str):
        if raw_cipher == stored_cipher:
            return decrypt_side_effect
        raise ValueError("unexpected cipher")

    monkeypatch.setattr(
        "synapse.api.routes.dev_iwhalecloud._decrypt_owner_info_blob",
        fake_decrypt,
    )
    assert _owner_identities_match(local, stored_cipher) is expected


def test_owner_identities_match_decrypt_failure_is_false(monkeypatch):
    monkeypatch.setattr(
        "synapse.api.routes.dev_iwhalecloud._decrypt_owner_info_blob",
        lambda _cipher: (_ for _ in ()).throw(ValueError("bad cipher")),
    )
    assert _owner_identities_match({"name": "张三", "employee_id": "001"}, "bad") is False


def test_org_fields_from_user_blob():
    dept, team, pos = _org_fields_from_user_blob(
        {"department": " 研发三部 ", "team": "计费一团队", "position": "团队负责人"}
    )
    assert dept == "研发三部"
    assert team == "计费一团队"
    assert pos == "团队负责人"


@pytest.mark.parametrize(
    ("local", "stored_cipher", "decrypt_side_effect", "expected"),
    [
        (
            {"name": "张三", "employee_id": "001"},
            "cipher-a",
            {"name": "张三", "employee_id": "001"},
            "mine",
        ),
        (
            {
                "name": "王经理",
                "employee_id": "100",
                "department": "BSS产品研发三部",
                "team": "计费研发第一团队",
                "position": "团队负责人",
            },
            "cipher-member",
            {
                "name": "李四",
                "employee_id": "200",
                "department": "BSS产品研发三部",
                "team": "计费研发第一团队",
                "position": "开发",
            },
            "team",
        ),
        (
            {
                "name": "赵总监",
                "employee_id": "300",
                "department": "BSS产品研发三部",
                "team": "计费研发第一团队",
                "position": "部门领导",
            },
            "cipher-member2",
            {
                "name": "李四",
                "employee_id": "200",
                "department": "BSS产品研发三部",
                "team": "计费研发第二团队",
                "position": "开发",
            },
            "department",
        ),
        (
            {
                "name": "王经理",
                "employee_id": "100",
                "department": "BSS产品研发三部",
                "team": "计费研发第一团队",
                "position": "团队负责人",
            },
            "cipher-other-team",
            {
                "name": "李四",
                "employee_id": "200",
                "department": "BSS产品研发三部",
                "team": "计费研发第二团队",
                "position": "开发",
            },
            "none",
        ),
        (
            {
                "name": "开发甲",
                "employee_id": "400",
                "department": "BSS产品研发三部",
                "team": "计费研发第一团队",
                "position": "开发",
            },
            "cipher-not-owner",
            {
                "name": "李四",
                "employee_id": "200",
                "department": "BSS产品研发三部",
                "team": "计费研发第一团队",
                "position": "开发",
            },
            "none",
        ),
    ],
)
def test_resolve_product_manage_scope(
    monkeypatch,
    local,
    stored_cipher,
    decrypt_side_effect,
    expected,
):
    def fake_decrypt(raw_cipher: str):
        if raw_cipher == stored_cipher:
            return decrypt_side_effect
        raise ValueError("unexpected cipher")

    monkeypatch.setattr(
        "synapse.api.routes.dev_iwhalecloud._decrypt_owner_info_blob",
        fake_decrypt,
    )
    assert _resolve_product_manage_scope(local, stored_cipher) == expected
