import test from "node:test";
import assert from "node:assert/strict";
import { verify, type VerifierDependencies } from "../lib/verifier";
import { arcadeVerifier } from "../lib/arcade-verifier";
import { PublicError } from "../lib/http";

function deps(overrides: Partial<VerifierDependencies> = {}): VerifierDependencies {
  return { appUrl: "https://demo.example", sessionUser: async () => "user_alice",
    confirmUser: async () => ({ auth_id: "auth_123" }), status: async () => "completed", ...overrides };
}
const request = (query = "flow_id=flow_123") => new Request(`https://untrusted-host.example/auth/verify?${query}`);

test("missing, malformed, or duplicated flow_id does not call Arcade", async () => {
  let called = false;
  for (const query of ["", "flow_id=", "flow_id=a&flow_id=b", "flow_id=https://attacker.example"]) {
    const result = await verify(request(query), deps({ confirmUser: async () => { called = true; return { auth_id: "a" }; } }));
    assert.equal(result.status, 400);
  }
  assert.equal(called, false);
});

test("no browser session preserves flow_id through a local sign-in path and ignores supplied redirects", async () => {
  const result = await verify(request("flow_id=flow_123&next_uri=https://attacker.example&user_id=user_bob"), deps({ sessionUser: async () => null }));
  assert.equal(result.status, 303);
  assert.equal(result.headers.get("location"), "https://demo.example/sign-in?flow_id=flow_123");
  assert.equal(result.headers.get("referrer-policy"), "no-referrer");
  assert.match(result.headers.get("set-cookie") ?? "", /report_demo_auth_flow=flow_123;.*HttpOnly; Secure; SameSite=Lax/);
});

test("confirm receives only the verified session subject, never a query-string user", async () => {
  let values: string[] = [];
  const result = await verify(request("flow_id=flow_123&user_id=user_bob"), deps({ confirmUser: async (...args) => {
    values = args; return { auth_id: "auth_123" };
  } }));
  assert.deepEqual(values, ["flow_123", "user_alice"]);
  assert.equal(result.status, 200);
  assert.match(await result.text(), /Authorization completed/);
});

test("user mismatch never becomes a success or blind login loop", async () => {
  const result = await verify(request(), deps({ confirmUser: async () => { throw new PublicError(403, "USER_MISMATCH", "secret provider text"); } }));
  assert.equal(result.status, 403);
  const body = await result.text();
  assert.match(body, /different user/);
  assert.doesNotMatch(body, /secret provider text/);
});

test("redirect uses only confirmed server next_uri; unsafe protocols are rejected", async () => {
  const response = await verify(request("flow_id=flow_123&next_uri=https://attacker.example"), deps({ confirmUser: async () => ({ auth_id: "auth_123", next_uri: "https://cloud.arcade.dev/complete" }) }));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://cloud.arcade.dev/complete");
  for (const uri of ["javascript:alert(1)", "http://cloud.arcade.dev/complete", "https://user:pass@cloud.arcade.dev/"]) {
    assert.equal((await verify(request(), deps({ confirmUser: async () => ({ auth_id: "auth_123", next_uri: uri }) }))).status, 502);
  }
});

test("pending status does not announce completion; polling is bounded", async () => {
  let calls = 0;
  const result = await verify(request(), deps({ status: async () => { calls++; return "pending"; } }));
  assert.equal(calls, 3);
  assert.equal(result.status, 202);
  assert.doesNotMatch(await result.text(), /Authorization completed/);
});

test("delayed completion succeeds; terminal and transport failures fail safely", async () => {
  let calls = 0;
  assert.equal((await verify(request(), deps({ status: async () => ++calls === 2 ? "completed" : "pending" }))).status, 200);
  assert.equal((await verify(request(), deps({ status: async () => "failed" }))).status, 400);
  const failure = await verify(request(), deps({ confirmUser: async () => { throw new Error("private key"); } }));
  assert.equal(failure.status, 502);
  assert.doesNotMatch(await failure.text(), /private key/);
});

test("REST adapter sends the API key only to fixed Arcade endpoints and preserves user_mismatch", async () => {
  const calls: { url: string; options?: RequestInit }[] = [];
  const fetcher: typeof fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json({ auth_id: "auth_123" });
  };
  const api = arcadeVerifier("test-project-key", fetcher);
  assert.deepEqual(await api.confirmUser("flow_123", "user_alice"), { auth_id: "auth_123", next_uri: undefined });
  assert.equal(calls[0].url, "https://api.arcade.dev/v1/auth/confirm_user");
  assert.equal(calls[0].options?.redirect, "error");
  assert.deepEqual(JSON.parse(String(calls[0].options?.body)), { flow_id: "flow_123", user_id: "user_alice" });
  const mismatch = arcadeVerifier("key", async () => Response.json({ error: "user_mismatch" }, { status: 400 }));
  await assert.rejects(mismatch.confirmUser("flow", "user"), error => error instanceof PublicError && error.code === "USER_MISMATCH");
});
