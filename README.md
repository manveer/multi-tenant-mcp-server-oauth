# Build a Multi-Tenant MCP Server with OAuth Using Clerk and Arcade Cloud

A complete, runnable example of a multi-tenant Model Context Protocol (MCP) server: Python tools on **Arcade Cloud**, **OAuth** via **Clerk**, and a backend API that enforces tenant isolation and plan tiers on every call. Customers connect **Claude** — or ChatGPT, or any MCP client — with their existing SaaS login, each tool call carries that user's delegated OAuth token, and the model never handles a credential or gets to claim an identity.

All reports, memberships, and tiers are synthetic fixtures — no real product code, services, or data required.

---

## 📚 Tutorial

This repo is the companion code for the full walkthrough:

👉 **[Build a Multi-Tenant MCP Server with OAuth Using Clerk and Arcade Cloud](https://manveerc.substack.com/p/multi-tenant-mcp-server-oauth)**

The tutorial covers every Clerk and Arcade configuration step, why MCP "sign-in" here means three separate credentials, troubleshooting, and the alternatives we weighed (Clerk-direct, fully self-hosted).

---

## 🔍 What This MCP Server Does

- **One gateway URL for any MCP client** — Claude Desktop, ChatGPT, or anything speaking Streamable HTTP connects through an Arcade MCP Gateway
- **Customers sign in with their existing login** — a Clerk-backed User Source, so end users never create an Arcade account
- **Per-user delegated OAuth** — Arcade obtains, stores, and refreshes each user's Clerk OAuth token and injects it into tool calls; the model never sees it
- **Tenant isolation enforced by the API, not the MCP server** — workspace membership and subscription tier are checked on every request; the backend rejects any caller merely claiming to be `user_123`
- **Long-running jobs over MCP** — the agent starts a report, polls with the job ID, and retrieves the result, with access re-checked each time
- **Browser-verified authorization** — a custom verifier binds tool authorization to a real Clerk session, so one user can't complete another user's flow

---

## 🔐 Multi-Tenant Permission Model

| Identity | Expected behavior |
| --- | --- |
| Alice (Team Red, Pro) | Creates basic or advanced reports in `team-red` |
| Bob (Team Red, Pro) | Reads Alice's report — shared workspace |
| Carol (Team Blue, Basic) | Creates basic reports; advanced creation denied by tier |
| Carol with Alice's report ID | Denied without revealing the report exists |
| Optional staff user | Both workspaces; tier limits still apply |

Knowing a report ID grants nothing — the API resolves the report's workspace and re-checks the caller on every status and result request.

---

## 🧱 Tech Stack

- **Arcade Cloud** — runs the Python MCP server and the multi-user MCP gateway; handles OAuth token storage, refresh, and injection
- **Clerk** — identity and OAuth issuer behind all three credentials: gateway login, delegated API token, and browser verification
- **Next.js companion app** — stands in for your existing backend: Clerk sign-in, the `/auth/verify` route, the reporting API, and in-memory report jobs

---

## ⚡ Quickstart

```bash
git clone https://github.com/manveer/multi-tenant-mcp-server-oauth.git
cd multi-tenant-mcp-server-oauth/web && npm ci && npm test
cd ../mcp && uv sync --locked --extra dev && uv run pytest
```

Requires Node.js 22–24 and Python 3.11–3.13 with [uv](https://docs.astral.sh/uv/getting-started/installation/). Tests run against synthetic identities — no accounts needed. To run the live flow (two Clerk OAuth apps, the Arcade provider, verifier, and User Source, deploy to Arcade Cloud, connect Claude), follow the [tutorial](https://manveerc.substack.com/p/multi-tenant-mcp-server-oauth) — it walks every step with the exact configuration values.

---

## 📁 Project Structure

```
multi-tenant-mcp-server-oauth/
├── mcp/         # Python MCP tools deployed to Arcade Cloud
├── web/         # Next.js app: Clerk sign-in, user verifier, reporting API, jobs
└── SOURCES.md   # Public docs behind the configuration details
```

---

## 🔑 Key Design Principles

- **Authorization lives in the API.** The MCP server exposes operations; the backend decides whether this user may perform them.
- **The model never handles credentials.** Tokens are injected at execution time; the API origin comes from configuration, not the model.
- **Identity is never an argument.** No tool accepts a user ID or an `is_admin` flag; staff access is a server-side fixture.
- **Report IDs are not capabilities.** Unauthorized and nonexistent look identical.
- **Honest demo scope.** In-memory jobs with 15-minute expiry — bring your own durable queue for production.

---

## License

MIT
