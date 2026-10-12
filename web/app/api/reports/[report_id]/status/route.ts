import { apiPrincipal } from "../../../../../lib/clerk-api";
import { reportStatus } from "../../../../../lib/api-handlers";
import { reportStore } from "../../../../../lib/reports";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ report_id: string }> }) {
  return reportStatus((await context.params).report_id, { authenticate: apiPrincipal, store: reportStore });
}
