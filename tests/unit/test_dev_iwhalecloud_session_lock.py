"""研发云会话锁：threading.Lock 跨 event loop 串行 Playwright 登录。"""

from __future__ import annotations

import asyncio
import threading
import time

import pytest

from synapse.api.routes.dev_iwhalecloud import (
    _IWHALECLOUD_SESSION_LOCK,
    _acquire_iwhalecloud_session_lock,
)


def test_iwhalecloud_session_lock_is_singleton_threading_lock() -> None:
    assert hasattr(_IWHALECLOUD_SESSION_LOCK, "acquire")
    assert hasattr(_IWHALECLOUD_SESSION_LOCK, "release")


@pytest.mark.asyncio
async def test_iwhalecloud_session_lock_serializes_concurrent_acquires() -> None:
    order: list[str] = []

    async def worker(name: str, hold: float) -> None:
        async with _acquire_iwhalecloud_session_lock():
            order.append(f"{name}-start")
            await asyncio.sleep(hold)
            order.append(f"{name}-end")

    await asyncio.gather(worker("a", 0.05), worker("b", 0.01))

    assert order.index("a-end") < order.index("b-start") or order.index("b-end") < order.index("a-start")


def test_iwhalecloud_session_lock_works_from_different_event_loops() -> None:
    """两个 loop 争用同一把 threading.Lock，后进入者需等待。"""
    entered_second = threading.Event()
    release_first = threading.Event()
    order: list[str] = []

    def hold_in_loop1() -> None:
        loop = asyncio.new_event_loop()
        try:

            async def run() -> None:
                async with _acquire_iwhalecloud_session_lock():
                    order.append("loop1-start")
                    release_first.set()
                    await asyncio.to_thread(entered_second.wait, 5)
                    order.append("loop1-end")

            loop.run_until_complete(run())
        finally:
            loop.close()

    def wait_in_loop2() -> None:
        loop = asyncio.new_event_loop()
        try:

            async def run() -> None:
                release_first.wait(5)
                async with _acquire_iwhalecloud_session_lock():
                    order.append("loop2-start")

            loop.run_until_complete(run())
        finally:
            loop.close()

    t1 = threading.Thread(target=hold_in_loop1)
    t2 = threading.Thread(target=wait_in_loop2)
    t1.start()
    t2.start()
    time.sleep(0.05)
    entered_second.set()
    t1.join(timeout=5)
    t2.join(timeout=5)

    assert order == ["loop1-start", "loop1-end", "loop2-start"]
