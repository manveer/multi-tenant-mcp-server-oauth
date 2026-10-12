import "server-only";
import { PublicError, readBoundedJson } from "./http";
import type { Confirmation } from "./verifier";

// Same paths as Arcade's current official JS SDK (resources/auth.ts).
// The project API key stays on this server and is never passed to a redirect URL.
const API = "https://api.arcade.dev";

export function arcadeVerifier(apiKey: string, fetcher: typeof fetch = fetch) {
  async function request(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    const response = await fetcher(`${API}${path}`, {
      ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    });
    const data = await readBoundedJson(response, 65_536);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid Arcade response");
    const record = data as Record<string, unknown>;
    if (!response.ok) {
      if (record.error === "user_mismatch") throw new PublicError(403, "USER_MISMATCH", "Identity mismatch.");
      throw new Error("Arcade verification failed");
    }
    return record;
  }
  return {
    async confirmUser(flowId: string, userId: string): Promise<Confirmation> {
      const data = await request("/v1/auth/confirm_user", {
        method: "POST", body: JSON.stringify({ flow_id: flowId, user_id: userId }),
      });
      if (typeof data.auth_id !== "string" || !data.auth_id || data.auth_id.length > 512 ||
          (data.next_uri !== undefined && (typeof data.next_uri !== "string" || data.next_uri.length > 4096))) {
        throw new Error("Invalid confirmation response");
      }
      return { auth_id: data.auth_id, next_uri: data.next_uri as string | undefined };
    },
    async status(authId: string): Promise<string> {
      const query = new URLSearchParams({ id: authId, wait: "1" });
      const data = await request(`/v1/auth/status?${query}`);
      if (typeof data.status !== "string") throw new Error("Missing authorization status");
      return data.status;
    },
  };
}
