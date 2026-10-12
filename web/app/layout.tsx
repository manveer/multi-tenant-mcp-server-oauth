import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import "./style.css";

export const metadata: Metadata = { title: "Report MCP demo", description: "A synthetic reporting app for the MCP authentication tutorial." };
export const dynamic = "force-dynamic";
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <ClerkProvider signInUrl="/sign-in"><html lang="en"><body>{children}</body></html></ClerkProvider>;
}
