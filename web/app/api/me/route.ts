import { apiPrincipal } from "../../../lib/clerk-api";
import { me } from "../../../lib/api-handlers";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() { return me(apiPrincipal); }
