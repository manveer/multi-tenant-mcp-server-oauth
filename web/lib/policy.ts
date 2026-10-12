import type { DemoConfig } from "./config";
import { PublicError } from "./http";

export type WorkspaceId = "team-red" | "team-blue";
export type ReportType = "basic" | "advanced";
export type Principal = { userId: string; workspaces: WorkspaceId[]; staff: boolean };
export const workspaces: Record<WorkspaceId, { name: string; tier: "basic" | "pro" }> = {
  "team-red": { name: "Team Red", tier: "pro" },
  "team-blue": { name: "Team Blue", tier: "basic" },
};

export function principalFor(userId: string, config: DemoConfig): Principal {
  if (userId === config.alice || userId === config.bob) {
    return { userId, workspaces: ["team-red"], staff: false };
  }
  if (userId === config.carol) return { userId, workspaces: ["team-blue"], staff: false };
  if (config.staff && userId === config.staff) {
    return { userId, workspaces: ["team-red", "team-blue"], staff: true };
  }
  throw new PublicError(403, "USER_NOT_ENROLLED", "This account is not enrolled in the demo.");
}

export function canAccess(principal: Principal, workspace: WorkspaceId): boolean {
  return principal.workspaces.includes(workspace);
}

export function requireTier(workspace: WorkspaceId, type: ReportType): void {
  // Staff can cross workspace boundaries, but cannot bypass this workspace policy.
  if (type === "advanced" && workspaces[workspace].tier !== "pro") {
    throw new PublicError(403, "TIER_DENIED", "Advanced reports require the workspace's Pro tier.");
  }
}
