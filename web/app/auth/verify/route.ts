import { auth } from "@clerk/nextjs/server";
import { readConfig } from "../../../lib/config";
import { arcadeVerifier } from "../../../lib/arcade-verifier";
import { verify } from "../../../lib/verifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const config = readConfig();
  return verify(request, {
    appUrl: config.appUrl,
    sessionUser: async () => (await auth({ acceptsToken: "session_token" })).userId,
    ...arcadeVerifier(config.arcadeApiKey),
  });
}
