import { SignIn } from "@clerk/nextjs";
import { cookies } from "next/headers";
import { FLOW_COOKIE, parseFlowId } from "../../../lib/verifier";

export default async function SignInPage({ searchParams }: {
  searchParams: Promise<{ flow_id?: string | string[] }>;
}) {
  const query = await searchParams;
  const savedFlow = (await cookies()).get(FLOW_COOKIE)?.value;
  const requestedFlow = query.flow_id ?? savedFlow;
  let returnPath = "/";
  if (requestedFlow !== undefined) {
    try {
      if (Array.isArray(requestedFlow)) throw new Error("Duplicate flow");
      returnPath = `/auth/verify?${new URLSearchParams({ flow_id: parseFlowId(requestedFlow) })}`;
    } catch {
      return <main><h1>Invalid authorization link</h1><p>Restart authorization from your MCP client.</p></main>;
    }
  }
  // A local, generated return path preserves flow_id through Clerk's sign-in flow.
  return <main><h1>Sign in to continue</h1><SignIn routing="path" path="/sign-in" forceRedirectUrl={returnPath} /></main>;
}
