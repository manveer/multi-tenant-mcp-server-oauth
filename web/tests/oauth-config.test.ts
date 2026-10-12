import test from "node:test";
import assert from "node:assert/strict";
import { verifiedApiUser } from "../lib/oauth";
import { readConfig } from "../lib/config";

const token = { isAuthenticated: true, tokenType: "oauth_token", userId: "user_alice", clientId: "report-client", scopes: ["openid", "profile", "email", "offline_access"] };
test("only an authenticated downstream OAuth token with profile scope is accepted", () => {
  assert.equal(verifiedApiUser(token, "report-client"), "user_alice");
  for (const bad of [
    { ...token, isAuthenticated: false }, { ...token, tokenType: "session_token" },
    { ...token, tokenType: "api_key" }, { ...token, userId: null },
  ]) assert.throws(() => verifiedApiUser(bad, "report-client"), /valid report API OAuth/);
  assert.throws(() => verifiedApiUser({ ...token, clientId: "gateway-client" }, "report-client"), /does not permit/);
  assert.throws(() => verifiedApiUser({ ...token, scopes: ["openid"] }, "report-client"), /does not permit/);
});

const env = {
  APP_URL: "https://demo.example", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_fixture", CLERK_SECRET_KEY: "sk_test_fixture",
  ARCADE_API_KEY: "fixture", REPORTS_OAUTH_CLIENT_ID: "report-client", DEMO_ALICE_USER_ID: "user_alice", DEMO_BOB_USER_ID: "user_bob", DEMO_CAROL_USER_ID: "user_carol",
};
test("startup rejects missing values, placeholders, unsafe origins, and overlapping fixture identities", () => {
  assert.equal(readConfig(env).staff, undefined);
  for (const replacement of [
    { ARCADE_API_KEY: "REPLACE" }, { CLERK_SECRET_KEY: "" }, { APP_URL: "http://localhost:3000" },
    { APP_URL: "https://demo.example/auth/verify" }, { DEMO_BOB_USER_ID: "user_alice" },
    { DEMO_STAFF_USER_ID: "user_alice" },
  ]) assert.throws(() => readConfig({ ...env, ...replacement }));
});
