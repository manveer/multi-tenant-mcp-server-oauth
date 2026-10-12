import { errorResponse, json, readBoundedJson, PublicError } from "./http";
import { parseReportInput, type ReportStore } from "./reports";
import { workspaces, type Principal } from "./policy";

export type ApiDependencies = { authenticate: () => Promise<Principal>; store: ReportStore };

export async function createReport(request: Request, dependencies: ApiDependencies): Promise<Response> {
  try {
    const principal = await dependencies.authenticate();
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      throw new PublicError(400, "INVALID_INPUT", "Content-Type must be application/json.");
    }
    const input = parseReportInput(await readBoundedJson(request));
    return json(dependencies.store.create(principal, input), 202, { "Retry-After": "2" });
  } catch (error) { return errorResponse(error); }
}

export async function reportStatus(id: string, dependencies: ApiDependencies): Promise<Response> {
  try { return json(dependencies.store.status(await dependencies.authenticate(), id)); }
  catch (error) { return errorResponse(error); }
}

export async function reportResult(id: string, dependencies: ApiDependencies): Promise<Response> {
  try {
    const result = dependencies.store.result(await dependencies.authenticate(), id);
    return json(result.body, result.status, result.status === 202 ? { "Retry-After": "2" } : {});
  } catch (error) { return errorResponse(error); }
}

export async function me(authenticate: () => Promise<Principal>): Promise<Response> {
  try {
    const principal = await authenticate();
    return json({ user_id: principal.userId, workspaces: principal.workspaces.map(id => ({
      workspace_id: id, ...workspaces[id],
    })) });
  } catch (error) { return errorResponse(error); }
}
