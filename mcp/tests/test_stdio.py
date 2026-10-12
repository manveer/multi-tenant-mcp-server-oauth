"""Use an actual MCP session to exercise local discovery and the hello call."""

import asyncio
import os
import sys
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

PROJECT = Path(__file__).resolve().parents[1]


def offline_environment():
    return {
        key: os.environ[key]
        for key in ("ARCADE_WORK_DIR", "ARCADE_USAGE_TRACKING", "ARCADE_API_KEY", "ARCADE_API_URL")
    } | {"REPORT_API_BASE_URL": "http://127.0.0.1:3000"}


async def test_hello_tool_over_stdio():
    parameters = StdioServerParameters(command=sys.executable, args=[str(PROJECT / "hello.py")], cwd=str(PROJECT), env=offline_environment())
    async with asyncio.timeout(20):
        async with stdio_client(parameters) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                discovered = await session.list_tools()
                assert [tool.name for tool in discovered.tools] == ["HelloDemo_Greet"]
                result = await session.call_tool(discovered.tools[0].name, {"name": "Reader"})
                assert not result.isError
                assert "Hello, Reader!" in result.content[0].text


async def test_protected_tool_discovery_has_no_model_supplied_identity_or_token():
    parameters = StdioServerParameters(
        command=sys.executable,
        args=[str(PROJECT / "src/report_demo_mcp/server.py")],
        cwd=str(PROJECT),
        env=offline_environment(),
    )
    async with asyncio.timeout(20):
        async with stdio_client(parameters) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.list_tools()
                assert len(result.tools) == 4
                schemas = {tool.name: tool.inputSchema["properties"] for tool in result.tools}
                assert schemas["ReportDemo_GetCurrentUser"] == {}
                assert set(schemas["ReportDemo_StartReport"]) == {"workspace_id", "topic", "report_type"}
                assert set(schemas["ReportDemo_GetReportStatus"]) == {"report_id"}
                assert set(schemas["ReportDemo_GetReportResult"]) == {"report_id"}
                assert schemas["ReportDemo_StartReport"]["report_type"]["enum"] == ["basic", "advanced"]
