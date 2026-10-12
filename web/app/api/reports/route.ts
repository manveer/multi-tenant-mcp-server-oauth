import { apiPrincipal } from "../../../lib/clerk-api";
import { createReport } from "../../../lib/api-handlers";
import { reportStore } from "../../../lib/reports";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return createReport(request, { authenticate: apiPrincipal, store: reportStore });
}
