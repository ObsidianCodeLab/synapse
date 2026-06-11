"""Unit tests: rd_view_assignee 统一服务同步。"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpx

from synapse.rd_meeting import rd_view_assignee


class TestRdViewAssigneeSave:
    def test_build_payload(self):
        payload = rd_view_assignee.build_rd_view_assignee_save_payload(
            assignee_id="0027008730",
            assignee="张三",
            department="BSS产品研发三部",
            team="计费研发第一团队",
            position="开发",
        )
        assert payload == {
            "assignee_id": "0027008730",
            "assignee": "张三",
            "department": "BSS产品研发三部",
            "team": "计费研发第一团队",
            "position": "开发",
        }

    def test_sync_skipped_without_devservice(self):
        with patch.object(rd_view_assignee, "unified_service_base_url", return_value=""):
            result = rd_view_assignee.sync_rd_view_assignee_to_unified_service(
                assignee_id="0027008730",
                assignee="张三",
                department="D",
                team="T",
                position="P",
            )
        assert result == {"status": "skipped", "reason": "missing_devservice_ip"}

    def test_sync_success(self):
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {
            "code": 0,
            "message": "插入处理人成功",
            "data": {"assignee_id": "0027008730"},
            "total": 0,
        }
        mock_client = MagicMock()
        mock_client.post.return_value = mock_resp
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)

        with (
            patch.object(rd_view_assignee, "unified_service_base_url", return_value="http://10.0.0.1:10001"),
            patch.object(httpx, "Client", return_value=mock_client),
        ):
            result = rd_view_assignee.sync_rd_view_assignee_to_unified_service(
                assignee_id="0027008730",
                assignee="张三",
                department="D",
                team="T",
                position="P",
            )

        assert result == {"status": "ok", "assignee_id": "0027008730"}
        mock_client.post.assert_called_once_with(
            "http://10.0.0.1:10001/dev/iwhalecloud/synapse/rd_view_assignee_save",
            json={
                "assignee_id": "0027008730",
                "assignee": "张三",
                "department": "D",
                "team": "T",
                "position": "P",
            },
        )

    def test_sync_from_userinfo(self):
        with (
            patch.object(rd_view_assignee, "_load_userinfo_plain") as mock_load,
            patch.object(
                rd_view_assignee,
                "sync_rd_view_assignee_to_unified_service",
                return_value={"status": "ok", "assignee_id": "0027008730"},
            ) as mock_sync,
        ):
            mock_load.return_value = {
                "employee_id": "0027008730",
                "name": "张三",
                "department": "D",
                "team": "T",
                "position": "P",
            }
            result = rd_view_assignee.sync_rd_view_assignee_from_userinfo()

        assert result == {"status": "ok", "assignee_id": "0027008730"}
        mock_sync.assert_called_once_with(
            assignee_id="0027008730",
            assignee="张三",
            department="D",
            team="T",
            position="P",
            timeout=30.0,
        )
