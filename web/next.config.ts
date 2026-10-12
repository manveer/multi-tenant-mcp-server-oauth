import type { NextConfig } from "next";

const appOrigin = process.env.APP_URL;
const config: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  turbopack: { root: process.cwd() },
  // An HTTPS tunnel is used for browser callbacks during development.
  allowedDevOrigins: appOrigin ? [new URL(appOrigin).hostname] : [],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Content-Type-Options", value: "nosniff" },
    ] }];
  },
};
export default config;
