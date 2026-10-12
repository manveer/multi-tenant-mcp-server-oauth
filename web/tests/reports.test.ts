import test from "node:test";
import assert from "node:assert/strict";
import { createReport, reportStatus, reportResult, me } from "../lib/api-handlers";
import { ReportStore } from "../lib/reports";
import { principalFor, workspaces } from "../lib/policy";
import { PublicError } from "../lib/http";

const config = { appUrl: "https://demo.example", arcadeApiKey: "test-key", oauthClientId: "report-client",
  alice: "user_alice", bob: "user_bob", carol: "user_carol", staff: "user_staff" };
const alice = principalFor(config.alice, config);
const bob = principalFor(config.bob, config);
const carol = principalFor(config.carol, config);
const staff = principalFor(config.staff, config);
const input = { workspace_id: "team-red", topic: "Example topic", report_type: "basic" };
const request = (body: unknown) => new Request("https://demo.example/api/reports", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
function fixture() {
  const queue: (() => void)[] = [];
  const store = new ReportStore(() => 1000, callback => queue.push(callback));
  const dependencies = (user = alice) => ({ authenticate: async () => user, store });
  const finish = () => { while (queue.length) queue.shift()!(); };
  return { store, dependencies, queue, finish };
}

test("a report actually moves queued → running → completed, shared by same-workspace users", async () => {
  const f = fixture();
  const response = await createReport(request(input), f.dependencies());
  assert.equal(response.status, 202);
  const created = await response.json();
  assert.equal(created.status, "queued");
  const pending = await reportResult(created.report_id, f.dependencies(bob));
  assert.equal(pending.status, 202);
  f.queue.shift()!();
  assert.equal((await (await reportStatus(created.report_id, f.dependencies())).json()).status, "running");
  f.finish();
  const complete = await reportResult(created.report_id, f.dependencies(bob));
  assert.equal(complete.status, 200);
  const result = await complete.json();
  assert.equal(result.status, "completed");
  assert.equal(result.workspace_id, "team-red");
  assert.match(result.summary, /Synthetic/);
});

test("cross-tenant status/result is indistinguishable from a missing report", async () => {
  const f = fixture();
  const created = await (await createReport(request(input), f.dependencies())).json();
  f.finish();
  for (const handler of [reportStatus, reportResult]) {
    const inaccessible = await handler(created.report_id, f.dependencies(carol));
    const missing = await handler("00000000-0000-4000-8000-000000000000", f.dependencies(carol));
    assert.equal(inaccessible.status, 404);
    assert.deepEqual(await inaccessible.json(), await missing.json());
  }
});

test("cross-tenant creation and basic-tier advanced report both fail before a job is created", async () => {
  const f = fixture();
  assert.equal((await createReport(request(input), f.dependencies(carol))).status, 403);
  const tier = await createReport(request({ ...input, workspace_id: "team-blue", report_type: "advanced" }), f.dependencies(carol));
  assert.equal(tier.status, 403);
  assert.equal((await tier.json()).error.code, "TIER_DENIED");
  assert.equal(f.queue.length, 0);
});

test("staff can access both workspaces but still obeys workspace tiers", async () => {
  const f = fixture();
  const red = await (await createReport(request(input), f.dependencies())).json();
  assert.equal((await reportStatus(red.report_id, f.dependencies(staff))).status, 200);
  assert.equal((await createReport(request({ ...input, workspace_id: "team-blue" }), f.dependencies(staff))).status, 202);
  assert.equal((await createReport(request({ ...input, workspace_id: "team-blue", report_type: "advanced" }), f.dependencies(staff))).status, 403);
});

test("membership removal and tier downgrade affect status and result on the next call", async () => {
  const f = fixture();
  const job = await (await createReport(request({ ...input, report_type: "advanced" }), f.dependencies())).json();
  f.finish();
  const removed = { ...alice, workspaces: [] };
  assert.equal((await reportResult(job.report_id, f.dependencies(removed))).status, 404);
  const original = workspaces["team-red"].tier;
  try {
    workspaces["team-red"].tier = "basic";
    for (const handler of [reportStatus, reportResult]) assert.equal((await handler(job.report_id, f.dependencies())).status, 403);
  } finally { workspaces["team-red"].tier = original; }
});

test("unknown users and unconfigured staff are denied", () => {
  assert.throws(() => principalFor("user_stranger", config), /not enrolled/);
  assert.throws(() => principalFor(config.staff, { ...config, staff: undefined }), /not enrolled/);
});

test("no credentials and authentication-service failure are not treated as application access", async () => {
  const f = fixture();
  for (const [error, status] of [[new PublicError(401, "UNAUTHENTICATED", "Sign in."), 401], [new Error("private token information"), 503]] as const) {
    const response = await createReport(request(input), { store: f.store, authenticate: async () => { throw error; } });
    assert.equal(response.status, status);
    assert.doesNotMatch(await response.text(), /private token/);
  }
  assert.equal(f.queue.length, 0);
});

test("client-supplied identity/roles, invalid types, and excessive payloads are rejected", async () => {
  const f = fixture();
  for (const body of [
    { ...input, user_id: config.alice }, { ...input, is_staff: true },
    { ...input, topic: " " }, { ...input, topic: "a".repeat(2001) },
    { ...input, report_type: ["basic"] }, { ...input, workspace_id: ["team-red"] },
  ]) assert.equal((await createReport(request(body), f.dependencies())).status, 400);
  assert.equal((await createReport(request({ ...input, workspace_id: "team-blue", report_type: ["advanced"] }), f.dependencies(carol))).status, 400);
  assert.equal((await createReport(request({ ...input, topic: "a".repeat(20_000) }), f.dependencies())).status, 413);
  assert.equal(f.queue.length, 0);
});

test("capacity, expiry, and worker failure are bounded", () => {
  let now = 1000;
  const queue: (() => void)[] = [];
  const store = new ReportStore(() => now, callback => queue.push(callback), () => { throw new Error("private failure"); }, 1);
  const valid = { workspace_id: "team-red" as const, topic: "Topic", report_type: "basic" as const };
  const created = store.create(alice, valid);
  assert.throws(() => store.create(alice, valid), /demo is full/);
  while (queue.length) queue.shift()!();
  assert.equal(store.status(alice, created.report_id).status, "failed");
  assert.throws(() => store.result(alice, created.report_id), /demo report failed/);
  now += 16 * 60_000;
  assert.throws(() => store.status(alice, created.report_id), /not found/);
  assert.equal(store.create(alice, valid).status, "queued");
});

test("me discloses only the current user's permitted workspaces", async () => {
  const response = await me(async () => carol);
  assert.deepEqual(await response.json(), { user_id: "user_carol", workspaces: [{ workspace_id: "team-blue", name: "Team Blue", tier: "basic" }] });
});
