import "server-only";
import { auth } from "@clerk/nextjs/server";
import { readConfig } from "./config";
import { verifiedApiUser } from "./oauth";
import { principalFor } from "./policy";

export async function apiPrincipal() {
  const config = readConfig();
  // No session tokens, ID tokens, API keys, or MCP gateway tokens are accepted.
  const identity = await auth({ acceptsToken: "oauth_token" });
  return principalFor(verifiedApiUser(identity, config.oauthClientId), config);
}
