"""Client-side inbox support for Synapse."""

from .service import InboxService, get_inbox_service

__all__ = ["InboxService", "get_inbox_service"]
