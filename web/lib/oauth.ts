import { PublicError } from "./http";

export type OAuthIdentity = {
  isAuthenticated: boolean;
  tokenType?: string;
  userId?: string | null;
  clientId?: string | null;
  scopes?: string[] | null;
};

export function verifiedApiUser(identity: OAuthIdentity, expectedClientId: string): string {
  if (!identity.isAuthenticated || identity.tokenType !== "oauth_token" || !identity.userId) {
    throw new PublicError(401, "UNAUTHENTICATED", "A valid report API OAuth access token is required.");
  }
  if (identity.clientId !== expectedClientId || !identity.scopes?.includes("profile")) {
    throw new PublicError(403, "OAUTH_GRANT_DENIED", "The OAuth grant does not permit this API.");
  }
  return identity.userId;
}
