import { PublicError } from "./http";

export type Confirmation = { auth_id: string; next_uri?: string };
export const FLOW_COOKIE = "report_demo_auth_flow";
const clearFlowCookie = `${FLOW_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
export type VerifierDependencies = {
  appUrl: string;
  sessionUser: () => Promise<string | null>;
  confirmUser: (flowId: string, userId: string) => Promise<Confirmation>;
  status: (authId: string) => Promise<string>;
};

export function parseFlowId(value: string | null): string {
  if (!value || !/^[A-Za-z0-9_.-]{1,256}$/.test(value)) {
    throw new PublicError(400, "INVALID_FLOW", "A valid flow_id is required. Restart authorization from your MCP client.");
  }
  return value;
}

function page(message: string, status: number): Response {
  // All messages here are fixed application text, never provider payloads or query strings.
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Report demo authorization</title><body style="font:18px system-ui;max-width:42rem;margin:12vh auto;padding:1.5rem"><h1>Report demo authorization</h1><p>${message}</p><p><a href="/">Return to the demo</a></p></body></html>`, {
    status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer", "Set-Cookie": clearFlowCookie,
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" },
  });
}

function redirect(location: string, cookie: string = clearFlowCookie): Response {
  return new Response(null, { status: 303, headers: {
    Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
    ...(cookie ? { "Set-Cookie": cookie } : {}),
  } });
}

export async function verify(request: Request, dependencies: VerifierDependencies): Promise<Response> {
  try {
    const incoming = new URL(request.url);
    if (incoming.searchParams.getAll("flow_id").length !== 1) {
      return page("A single flow_id is required. Restart authorization from your MCP client.", 400);
    }
    const flowId = parseFlowId(incoming.searchParams.get("flow_id"));
    // This adapter must validate the browser session; never use a query-string user ID.
    const userId = await dependencies.sessionUser();
    if (!userId) {
      const login = new URL("/sign-in", dependencies.appUrl);
      login.searchParams.set("flow_id", flowId);
      // The cookie preserves the flow across Clerk's multi-step sign-in routes.
      // It is an opaque flow handle, not proof of identity; Arcade validates ownership.
      return redirect(login.toString(), `${FLOW_COOKIE}=${encodeURIComponent(flowId)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
    }

    // Arcade compares this verified subject with the user who started the flow.
    const confirmed = await dependencies.confirmUser(flowId, userId);
    if (!confirmed.auth_id) throw new Error("Missing authorization ID");
    if (confirmed.next_uri) {
      // Trust only the URI returned by the authenticated Arcade server call.
      // No return/next URL from the browser request is read or forwarded.
      const next = new URL(confirmed.next_uri);
      if (next.protocol !== "https:" || next.username || next.password) {
        throw new Error("Invalid Arcade redirect");
      }
      return redirect(next.toString());
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      const state = await dependencies.status(confirmed.auth_id);
      if (state === "completed") {
        return page("Authorization completed. Return to your MCP client and retry the tool call.", 200);
      }
      if (state === "failed" || state === "expired" || state === "cancelled") {
        return page("Authorization did not complete. Restart authorization from your MCP client.", 400);
      }
    }
    // A successful identity confirmation is not yet a completed authorization.
    return page("Your identity was confirmed, but authorization is still pending. Return to your MCP client to finish the flow. This page does not confirm success.", 202);
  } catch (error) {
    if (error instanceof PublicError && error.code === "USER_MISMATCH") {
      return page("This browser is signed in as a different user. Return to the demo, sign out, and sign in with the same Clerk account used for the gateway. Then restart authorization from your MCP client.", 403);
    }
    if (error instanceof PublicError && error.code === "INVALID_FLOW") return page(error.message, 400);
    return page("Verification could not be completed. Please restart authorization from your MCP client. No authorization success has been confirmed.", 502);
  }
}
