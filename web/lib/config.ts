export type DemoConfig = {
  appUrl: string;
  arcadeApiKey: string;
  oauthClientId: string;
  alice: string;
  bob: string;
  carol: string;
  staff?: string;
};

export function readConfig(env: Record<string, string | undefined> = process.env): DemoConfig {
  const required = (name: string): string => {
    const value = env[name]?.trim();
    if (!value || /REPLACE|YOUR[-_]|[<>]/i.test(value)) {
      throw new Error(`Set ${name} in web/.env.local; template values are not valid configuration.`);
    }
    return value;
  };
  const origin = new URL(required("APP_URL"));
  if (origin.protocol !== "https:" || origin.username || origin.password ||
      origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("APP_URL must be a single HTTPS origin, without a path or query.");
  }
  const publicKey = required("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  const secretKey = required("CLERK_SECRET_KEY");
  if (!/^pk_(test|live)_/.test(publicKey) || !/^sk_(test|live)_/.test(secretKey)) {
    throw new Error("Configure the Clerk publishable and secret keys from the same instance.");
  }
  const ids = ["DEMO_ALICE_USER_ID", "DEMO_BOB_USER_ID", "DEMO_CAROL_USER_ID"]
    .map(name => required(name));
  const staff = env.DEMO_STAFF_USER_ID?.trim() || undefined;
  if (staff) ids.push(required("DEMO_STAFF_USER_ID"));
  if (ids.some(id => !/^user_[a-zA-Z0-9]+$/.test(id)) || new Set(ids).size !== ids.length) {
    throw new Error("Demo users must have distinct Clerk user_ IDs; staff is an optional fourth user.");
  }
  return {
    appUrl: origin.origin,
    arcadeApiKey: required("ARCADE_API_KEY"),
    oauthClientId: required("REPORTS_OAUTH_CLIENT_ID"),
    alice: ids[0], bob: ids[1], carol: ids[2], staff,
  };
}
