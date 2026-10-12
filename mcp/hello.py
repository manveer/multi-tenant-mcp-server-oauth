"""First tutorial step: a local tool with no credentials or network calls."""

from typing import Annotated

from arcade_mcp_server import MCPApp

app = MCPApp(name="hello_demo", version="1.0.0")


@app.tool
def greet(name: Annotated[str, "Name to include in the greeting."]) -> str:
    """Return a greeting to verify that a client can call this local tool."""
    return f"Hello, {name}!"


if __name__ == "__main__":
    app.run(transport="stdio")
