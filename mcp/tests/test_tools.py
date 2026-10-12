"""Behavioral checks for the API boundary; no account or network is needed."""

import asyncio
import json

import httpx
import pytest
from arcade_mcp_server.exceptions import FatalToolError, RetryableToolError

from report_demo_mcp import server

REPORT_ID = "ea1e0d4a-1314-4a67-97c9-142c47ace54f"


@pytest.mark.parametrize("tool", [server.get_current_user, server.start_report, server.get_report_status, server.get_report_result])
def test_all_published_tools_register_oauth_and_hosted_api_configuration(tool):
    # Check the SDK's materialized registration, not merely a local constant.
    requirement = server.app._catalog.find_tool_by_func(tool).requirements
    assert requirement.authorization.id == "report-demo-clerk"
    assert set(requirement.authorization.oauth2.scopes) == {"openid", "profile", "email", "offline_access"}
    assert [secret.key for secret in requirement.secrets] == ["REPORT_API_BASE_URL"]


class FakeContext:
    def __init__(self, token="synthetic-oauth-token", origin="https://reports.example"):
        self.token = token
        self.origin = origin

    def get_auth_token_or_empty(self):
        return self.token

    def get_secret(self, key):
        assert key == "REPORT_API_BASE_URL"
        if self.origin is None:
            raise ValueError("missing secret")
        return self.origin


@pytest.fixture
def api(monkeypatch):
    """Use real HTTPX request construction with an entirely local transport."""
    actual_client = httpx.AsyncClient
    calls = []
    reply = {"status_code": 200, "json": {"subject": "user_demo", "workspaces": []}}

    def handler(request):
        calls.append(request)
        if "error" in reply:
            raise reply["error"]
        return httpx.Response(**reply)

    def client(**options):
        return actual_client(transport=httpx.MockTransport(handler), **options)

    monkeypatch.setattr(server.httpx, "AsyncClient", client)
    return calls, reply


async def test_identity_comes_from_bearer_token_not_model_arguments(api):
    calls, _ = api
    result = await server.get_current_user(FakeContext())
    assert result == {"subject": "user_demo", "workspaces": []}
    assert len(calls) == 1
    assert str(calls[0].url) == "https://reports.example/api/me"
    assert calls[0].method == "GET"
    assert calls[0].headers["Authorization"] == "Bearer synthetic-oauth-token"
    assert not calls[0].url.params


async def test_report_submission_accepts_202_and_returns_job_handle(api):
    calls, reply = api
    reply.update(status_code=202, json={"report_id": REPORT_ID, "status": "queued", "poll_after_seconds": 2})
    result = await server.start_report(FakeContext(), "team-red", "  Agents and auth  ")
    assert result == reply["json"]
    assert len(calls) == 1
    assert str(calls[0].url) == "https://reports.example/api/reports"
    assert calls[0].method == "POST"
    assert json.loads(calls[0].content) == {
        "workspace_id": "team-red", "topic": "Agents and auth", "report_type": "basic"
    }


async def test_advanced_report_request_reaches_backend_for_entitlement_check(api):
    calls, reply = api
    reply.update(status_code=202, json={"report_id": REPORT_ID, "status": "queued", "poll_after_seconds": 2})
    await server.start_report(FakeContext(), "team-red", "A topic", "advanced")
    assert json.loads(calls[0].content)["report_type"] == "advanced"


@pytest.mark.parametrize("status", ["queued", "running", "completed", "failed"])
async def test_status_uses_safe_uuid_path_and_preserves_state(api, status):
    calls, reply = api
    reply["json"] = {"report_id": REPORT_ID, "status": status}
    assert await server.get_report_status(FakeContext(), REPORT_ID) == reply["json"]
    assert calls[0].url.path == f"/api/reports/{REPORT_ID}/status"


@pytest.mark.parametrize("http_status,job_status", [(202, "queued"), (202, "running"), (200, "completed")])
async def test_result_distinguishes_pending_and_completed(api, http_status, job_status):
    calls, reply = api
    reply.update(status_code=http_status, json={"report_id": REPORT_ID, "status": job_status})
    assert await server.get_report_result(FakeContext(), REPORT_ID) == reply["json"]
    assert calls[0].url.path == f"/api/reports/{REPORT_ID}/result"


@pytest.mark.parametrize("token", ["", " "])
async def test_empty_token_stops_before_any_request(api, token):
    calls, _ = api
    with pytest.raises(FatalToolError, match="UNAUTHENTICATED"):
        await server.get_current_user(FakeContext(token=token))
    assert calls == []


@pytest.mark.parametrize("origin", [None, "", "http://reports.example", "https://name:password@reports.example", "https://reports.example/api", "https://reports.example?url=other", "https://reports.example/#fragment", "https://reports.example:invalid", "https://reports.example\\@other.example"])
async def test_misconfigured_api_origin_stops_before_outbound_request(api, origin):
    calls, _ = api
    with pytest.raises(FatalToolError, match="SERVER_MISCONFIGURED"):
        await server.get_current_user(FakeContext(origin=origin))
    assert calls == []


@pytest.mark.parametrize("origin", ["http://127.0.0.1:3000", "http://localhost:3000", "http://[::1]:3000", "https://reports.example/"])
async def test_supported_local_and_hosted_origins(api, origin):
    calls, _ = api
    await server.get_current_user(FakeContext(origin=origin))
    assert str(calls[0].url) == origin.rstrip("/") + "/api/me"


@pytest.mark.parametrize("changes", [{"workspace_id": "../team-red"}, {"workspace_id": "a" * 65}, {"topic": " "}, {"topic": "x" * 2001}, {"report_type": "admin"}])
async def test_invalid_arguments_are_fixable_and_never_submitted(api, changes):
    calls, _ = api
    inputs = {"workspace_id": "team-red", "topic": "A topic", "report_type": "basic"} | changes
    with pytest.raises(RetryableToolError, match="INVALID_ARGUMENT"):
        await server.start_report(FakeContext(), **inputs)
    assert calls == []


@pytest.mark.parametrize("report_id", ["../me", "bad?workspace_id=team-blue", "", "https://another.example/id"])
async def test_report_ids_cannot_change_the_request_path(api, report_id):
    calls, _ = api
    with pytest.raises(RetryableToolError, match="INVALID_ARGUMENT"):
        await server.get_report_result(FakeContext(), report_id)
    assert calls == []


@pytest.mark.parametrize("status,exception,code", [(400, RetryableToolError, "INVALID_ARGUMENT"), (422, RetryableToolError, "INVALID_ARGUMENT"), (401, FatalToolError, "UNAUTHENTICATED"), (403, FatalToolError, "ACCESS_DENIED"), (404, FatalToolError, "NOT_FOUND"), (429, FatalToolError, "BACKEND_UNAVAILABLE"), (503, FatalToolError, "BACKEND_UNAVAILABLE")])
async def test_api_errors_are_classified_without_leaking_backend_content(api, status, exception, code):
    _, reply = api
    reply.update(status_code=status, json={"internal_error": "sensitive-backend-detail"})
    with pytest.raises(exception, match=code) as caught:
        await server.get_report_status(FakeContext(), REPORT_ID)
    assert "sensitive-backend-detail" not in str(caught.value)


async def test_redirects_are_not_followed_with_user_credentials(api):
    calls, reply = api
    reply.update(status_code=307, headers={"Location": "https://untrusted.example/collect"})
    with pytest.raises(FatalToolError, match="BACKEND_RESPONSE_INVALID"):
        await server.get_current_user(FakeContext())
    assert len(calls) == 1


@pytest.mark.parametrize("failure", ["timeout", "server"])
async def test_uncertain_post_is_never_automatically_retried(api, failure):
    calls, reply = api
    if failure == "timeout":
        reply["error"] = httpx.ReadTimeout("sensitive-network-detail")
    else:
        reply["status_code"] = 503
    with pytest.raises(FatalToolError, match="Do not automatically resubmit") as caught:
        await server.start_report(FakeContext(), "team-red", "A topic")
    assert len(calls) == 1
    assert "sensitive-network-detail" not in str(caught.value)


async def test_response_size_limit_stops_large_output(api):
    _, reply = api
    reply["json"] = {"large": "x" * server.MAX_RESPONSE_BYTES}
    with pytest.raises(FatalToolError, match="BACKEND_RESPONSE_TOO_LARGE"):
        await server.get_current_user(FakeContext())


@pytest.mark.parametrize("payload", [[], "not an object", None])
async def test_success_must_be_a_json_object(api, payload):
    _, reply = api
    reply.clear()
    reply.update(status_code=200, content=json.dumps(payload).encode())
    with pytest.raises(FatalToolError, match="BACKEND_RESPONSE_INVALID"):
        await server.get_current_user(FakeContext())


async def test_invalid_json_is_sanitized(api):
    _, reply = api
    reply.clear()
    reply.update(status_code=200, content=b"private HTML error")
    with pytest.raises(FatalToolError, match="BACKEND_RESPONSE_INVALID") as caught:
        await server.get_current_user(FakeContext())
    assert "private HTML" not in str(caught.value)


async def test_wall_clock_deadline_bounds_slow_responses(monkeypatch):
    actual_client = httpx.AsyncClient

    async def slow_response(request):
        await asyncio.sleep(0.05)
        return httpx.Response(200, json={})

    monkeypatch.setattr(server, "REQUEST_TIMEOUT_SECONDS", 0.01)
    monkeypatch.setattr(server.httpx, "AsyncClient", lambda **kw: actual_client(transport=httpx.MockTransport(slow_response), **kw))
    with pytest.raises(FatalToolError, match="BACKEND_UNAVAILABLE"):
        await server.get_current_user(FakeContext())
