"""API 适配器子包。"""

from synapse.integrations import APIError, AuthenticationError, BaseAPIAdapter, RateLimitError

__all__ = ["BaseAPIAdapter", "APIError", "AuthenticationError", "RateLimitError"]
