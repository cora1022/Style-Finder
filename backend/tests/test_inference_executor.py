import asyncio
import time
from threading import Event

import anyio
import pytest

from backend.app.core.errors import AppError
from backend.app.services.inference_executor import InferenceExecutor


async def test_queue_timeout_returns_search_busy():
    executor = InferenceExecutor(max_concurrency=1, queue_timeout_seconds=0.01)
    errors = []

    async def slow():
        await executor.run(time.sleep, 0.08)

    async def queued():
        await anyio.sleep(0.005)
        try:
            await executor.run(lambda: None)
        except AppError as exc:
            errors.append(exc.code)

    async with anyio.create_task_group() as group:
        group.start_soon(slow)
        group.start_soon(queued)

    assert errors == ["SEARCH_BUSY"]


async def test_execution_timeout_returns_504_without_releasing_active_slot_early():
    executor = InferenceExecutor(
        max_concurrency=1,
        queue_timeout_seconds=0.01,
        execution_timeout_seconds=0.015,
    )

    try:
        await executor.run(time.sleep, 0.08)
    except AppError as exc:
        assert exc.code == "SEARCH_TIMEOUT"
        assert exc.status_code == 504
    else:
        raise AssertionError("execution timeout was not enforced")

    try:
        await executor.run(lambda: None)
    except AppError as exc:
        assert exc.code == "SEARCH_BUSY"
    else:
        raise AssertionError("the running worker released its limiter slot too early")

    await anyio.sleep(0.09)
    assert await executor.run(lambda: "ready") == "ready"


async def test_inference_failure_does_not_block_later_requests():
    executor = InferenceExecutor(max_concurrency=1, queue_timeout_seconds=0.05)

    def broken_model():
        raise RuntimeError("model execution failed")

    with pytest.raises(RuntimeError, match="model execution failed"):
        await executor.run(broken_model)
    assert await executor.run(lambda: "next request completed") == "next request completed"


async def test_disconnected_request_does_not_release_a_still_running_worker_slot():
    executor = InferenceExecutor(max_concurrency=1, queue_timeout_seconds=0.05)
    started, release, finished = Event(), Event(), Event()

    def blocking_model():
        started.set()
        try:
            if not release.wait(10):
                raise TimeoutError("test did not release its worker")
        finally:
            finished.set()

    request = asyncio.create_task(executor.run(blocking_model))
    try:
        assert await anyio.to_thread.run_sync(started.wait, 5)
        request.cancel()
        with pytest.raises(asyncio.CancelledError):
            await request
        with pytest.raises(AppError) as busy:
            await executor.run(lambda: "must not start yet")
        assert busy.value.code == "SEARCH_BUSY"
        assert busy.value.status_code == 429
    finally:
        release.set()
        assert await anyio.to_thread.run_sync(finished.wait, 5)
    assert await executor.run(lambda: "ready") == "ready"
