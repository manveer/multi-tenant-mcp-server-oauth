# Report demo MCP server

This is an independently written public example for the fictional report API
in `../web`. Start with the companion's root README for the complete Clerk,
Arcade User Source, OAuth provider, backend, and gateway setup. No private
application or customer code is needed.

The main walkthrough deploys this project on **Arcade Cloud** and connects
customers through a gateway. The web application runs separately and handles
API authentication, browser verification, and report jobs.

Tools that declare `requires_auth` or `requires_secrets` cannot run over the
SDK's default HTTP path without a verified caller identity. Arcade Cloud
provides the authenticated execution path used here. Simply tunneling an
unprotected local HTTP MCP endpoint does not provide that setup. Secure HTTP
hosting elsewhere is possible with additional configuration.

## Install and check locally

Use Python 3.11–3.13 and `uv`. These commands run from this `mcp` directory:

```sh
uv sync --locked --extra dev
uv run pytest -q
```

Optional: start the local greeting example:

```sh
uv run hello.py
```

The greeting command uses local stdio. It waits for
an MCP client; press Ctrl-C to stop. The tests perform a real MCP initialize,
tool discovery, and greeting invocation. Starting a process alone does not
prove a client connection or OAuth flow.

The tests use synthetic credentials, an isolated temporary Arcade configuration,
disabled SDK usage tracking, and HTTPX's mock transport. They do not sign in to
Arcade or Clerk, create users, deploy, or submit jobs to a live API.

## Protected tools

`src/report_demo_mcp/server.py` registers four tools:

| Python function | Discovered MCP name | API request |
|---|---|---|
| `get_current_user` | `ReportDemo_GetCurrentUser` | `GET /api/me` |
| `start_report` | `ReportDemo_StartReport` | `POST /api/reports` |
| `get_report_status` | `ReportDemo_GetReportStatus` | `GET /api/reports/{id}/status` |
| `get_report_result` | `ReportDemo_GetReportResult` | `GET /api/reports/{id}/result` |

Every tool requires the custom Arcade OAuth provider ID `report-demo-clerk`,
with scopes `openid profile email offline_access`. The final scope enables the
delegated grant's refresh-token flow when configured in Clerk. The gateway's
Clerk User Source is configured separately; it does not replace this tool-level
OAuth provider.

`Context` supplies the delegated token, and the wrapper sends it only to the
configured API using `Authorization: Bearer ...`. The model supplies neither
the token nor the authenticated user ID. The backend validates the OAuth access
token and enforces current workspace membership and report-tier permission,
including on status and result reads.

`start_report` accepts `workspace_id`, `topic` (1–2000 characters after trimming),
and `report_type` (`basic` or `advanced`). It returns an accepted job handle.
The client respects `poll_after_seconds`, checks status, and retrieves the
completed result. The wrapper accepts an HTTP 202 pending result as a normal
response. It does not automatically retry a failed or uncertain POST.

## Deploy to Arcade Cloud

Each tool declares `requires_secrets=["REPORT_API_BASE_URL"]` and reads the value
through `context.get_secret`. Arcade supports secrets for static configuration
values as well as credentials. In your Arcade project's **Secrets**, set
`REPORT_API_BASE_URL` to the HTTPS origin of your deployed or tunneled backend,
with no path, query, or fragment. For example, use `https://reports.example`.
Hosted tools cannot call the API on your laptop's loopback address.

From this directory, select your demo project's ID from the list, then deploy:

```sh
uv run arcade login
uv run arcade project list
uv run arcade project set YOUR_DEMO_PROJECT_ID
uv run arcade deploy -e src/report_demo_mcp/server.py --secrets skip
```

Deployment uses the saved active project. Choose the same project that contains
your custom provider, verifier, and API origin.

`--secrets skip` preserves the hosted value you entered in the dashboard rather
than uploading values from a local `.env` file. The app name is `report_demo`
and its tool version is `1.0.0`. Add its four tools to the gateway associated
with your Clerk User Source. Do not deploy `hello.py` as part of that gateway.

The SDK supports the deployment validator's transport overrides even though
the script defaults to stdio. Arcade supplies the settings for hosted
execution; no local MCP process needs to stay running after deployment.

Wait for deployment success and check **Servers** in the Arcade dashboard.
Confirm the deployment is healthy and contains the four tools listed above.
`uv run arcade server list` lists registered servers in the active project.
Then use the root README's gateway connection and first protected-call check.
A healthy deployment or an unprotected greeting alone does not verify OAuth.

The demo's HTTPS tunnel serves the separate web application. Report jobs and
their in-memory state live there; they disappear on web-process restart.

## Boundaries and validation

The wrapper rejects missing tokens before contacting the API, allows plain
HTTP only for loopback development, validates report IDs as UUIDs, follows no
redirects, limits responses to 64 KiB, and uses request and overall timeouts.
Backend errors become safe local messages. Only argument failures are exposed
as retryable tool errors; permission failures do not trigger a login loop.

Offline tests cover these boundaries, tool schemas, declared auth/configuration,
job responses, and the MCP protocol. They do **not** verify a live Clerk grant,
token refresh, deployed hosting, or gateway User Source routing. Complete the
live acceptance steps in the root README before describing an integration as
verified end to end.

Tested pins: Arcade MCP server 1.32.1, Arcade CLI 1.16.2, HTTPX 0.28.1, official
MCP Python client 1.30.0, pytest 9.1.1, and pytest-asyncio 1.4.0. `uv.lock` pins
the resolved transitive dependencies.

Relevant official references:

- [Tool authorization](https://docs.arcade.dev/en/build/create-tools/tool-basics/create-tool-auth)
- [Static configuration and secrets](https://docs.arcade.dev/en/build/create-tools/tool-basics/create-tool-secrets)
- [Deploying a custom server](https://docs.arcade.dev/en/build/arcade-deploy)
- [CLI deployment options](https://docs.arcade.dev/en/references/arcade-cli)
