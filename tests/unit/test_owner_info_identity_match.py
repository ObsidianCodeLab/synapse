"""产品 owner_info 归属：解密后按姓名 + 工号比对。"""

from __future__ import annotations

import pytest

from synapse.api.routes.dev_iwhalecloud import (
    _owner_identities_match,
    _owner_identity_from_user_blob,
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
