"""ChatRequest schema 与前端/chat 路由字段对齐。"""

from synapse.api.schemas import ChatRequest


def test_chat_request_accepts_org_mode_fields():
    body = ChatRequest.model_validate(
        {
            "message": "hi",
            "org_mode": True,
            "org_id": "org-1",
            "org_node_id": "node-1",
            "endpoint_policy": "require",
            "turn_id": "turn-abc",
        }
    )
    assert body.org_mode is True
    assert body.org_id == "org-1"
    assert body.org_node_id == "node-1"
    assert body.endpoint_policy == "require"
    assert body.turn_id == "turn-abc"


def test_chat_request_accepts_camel_case_aliases():
    body = ChatRequest.model_validate(
        {
            "message": "hi",
            "orgMode": True,
            "orgId": "org-2",
            "orgNodeId": "node-2",
            "turnId": "turn-xyz",
        }
    )
    assert body.org_mode is True
    assert body.org_id == "org-2"
    assert body.org_node_id == "node-2"
    assert body.turn_id == "turn-xyz"
