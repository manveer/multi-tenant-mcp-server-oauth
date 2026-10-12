import { auth } from "@clerk/nextjs/server";
import { SignInButton, SignOutButton } from "@clerk/nextjs";
import { readConfig } from "../lib/config";
import { principalFor, workspaces } from "../lib/policy";

export default async function Home() {
  const { userId } = await auth({ acceptsToken: "session_token" });
  let accessible: string[] = [];
  if (userId) {
    try { accessible = principalFor(userId, readConfig()).workspaces.map(id => `${workspaces[id].name} (${workspaces[id].tier})`); }
    catch { /* Signed in, but not enrolled in the synthetic application. */ }
  }
  return <main>
    <p className="eyebrow">CUSTOM MCP TUTORIAL</p>
    <h1>A small reporting app.<br />Your existing identity.</h1>
    <p>This companion uses synthetic report data. Connect the report tools in your MCP client to start, check, and retrieve a report.</p>
    <section>
      <h2>{userId ? "You are signed in" : "Sign in to the demo"}</h2>
      {userId ? <>
        <p>Clerk user: <code>{userId}</code></p>
        <p>{accessible.length ? `Available workspaces: ${accessible.join(", ")}.` : "This account is not enrolled. Add its user ID to the appropriate demo fixture and restart the app."}</p>
        <SignOutButton redirectUrl="/"><button>Sign out</button></SignOutButton>
      </> : <><p>Use the same Clerk account that you use for the Arcade gateway.</p><SignInButton><button>Sign in</button></SignInButton></>}
    </section>
    <p className="note">The browser session verifies your identity during authorization. The reporting API accepts its own OAuth access token. Reports expire after 15 minutes or when this demo restarts.</p>
  </main>;
}
