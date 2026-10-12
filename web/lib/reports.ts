import { randomUUID } from "node:crypto";
import { PublicError } from "./http";
import { canAccess, requireTier, type Principal, type ReportType, type WorkspaceId } from "./policy";

export type ReportStatus = "queued" | "running" | "completed" | "failed";
export type ReportInput = { workspace_id: WorkspaceId; topic: string; report_type: ReportType };
export type ReportResult = ReportInput & {
  report_id: string; status: "completed"; summary: string;
  observations: { engine: string; mentions: number; samples: number }[];
};
type Job = ReportInput & { id: string; status: ReportStatus; createdAt: number; result?: ReportResult };
type Scheduler = (callback: () => void, milliseconds: number) => void;

export function parseReportInput(value: unknown): ReportInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PublicError(400, "INVALID_INPUT", "Expected a report request object.");
  }
  const item = value as Record<string, unknown>;
  if (Object.keys(item).some(key => !["workspace_id", "topic", "report_type"].includes(key)) ||
      typeof item.workspace_id !== "string" || !["team-red", "team-blue"].includes(item.workspace_id) ||
      typeof item.topic !== "string" || !item.topic.trim() || item.topic.trim().length > 2000 ||
      typeof item.report_type !== "string" || !["basic", "advanced"].includes(item.report_type)) {
    throw new PublicError(400, "INVALID_INPUT", "Use a demo workspace, a topic of 1–2000 characters, and basic or advanced report_type.");
  }
  return { workspace_id: item.workspace_id as WorkspaceId,
    topic: item.topic.trim(), report_type: item.report_type as ReportType };
}

function makeReport(job: Job): ReportResult {
  // All numbers are authored demo fixtures. No scraping, AI calls, or private analytics.
  const observations = job.workspace_id === "team-red"
    ? [{ engine: "demo-engine-a", mentions: 6, samples: 10 }, { engine: "demo-engine-b", mentions: 4, samples: 10 }]
    : [{ engine: "demo-engine-a", mentions: 3, samples: 10 }];
  return {
    report_id: job.id, status: "completed", workspace_id: job.workspace_id,
    topic: job.topic, report_type: job.report_type,
    summary: job.report_type === "advanced"
      ? "Synthetic advanced report: compare the two fixture engines. These are tutorial records, not measured results."
      : "Synthetic basic report: the following fixture records belong to the requested workspace.",
    observations,
  };
}

export class ReportStore {
  private jobs = new Map<string, Job>();
  constructor(
    private now: () => number = Date.now,
    private schedule: Scheduler = (callback, delay) => { setTimeout(callback, delay).unref(); },
    private build: (job: Job) => ReportResult = makeReport,
    private capacity = 100,
  ) {}

  create(principal: Principal, input: ReportInput) {
    if (!canAccess(principal, input.workspace_id)) {
      throw new PublicError(403, "WORKSPACE_DENIED", "This workspace is not available to this account.");
    }
    requireTier(input.workspace_id, input.report_type);
    for (const [id, job] of this.jobs) {
      if (this.now() - job.createdAt > 15 * 60_000) this.jobs.delete(id);
    }
    if (this.jobs.size >= this.capacity) {
      throw new PublicError(429, "CAPACITY_REACHED", "The demo is full. Retry after older reports expire.");
    }
    const job: Job = { ...input, id: randomUUID(), status: "queued", createdAt: this.now() };
    this.jobs.set(job.id, job);
    this.schedule(() => {
      job.status = "running";
      this.schedule(() => {
        try { job.result = this.build(job); job.status = "completed"; }
        catch { job.status = "failed"; }
      }, 1000);
    }, 500);
    return { report_id: job.id, status: job.status, poll_after_seconds: 2 };
  }

  private authorizedJob(principal: Principal, id: string): Job {
    const job = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
      ? this.jobs.get(id) : undefined;
    // Unknown, expired and another workspace's identifiers have the same response.
    if (!job || this.now() - job.createdAt > 15 * 60_000 || !canAccess(principal, job.workspace_id)) {
      throw new PublicError(404, "REPORT_NOT_FOUND", "Report not found.");
    }
    requireTier(job.workspace_id, job.report_type);
    return job;
  }

  status(principal: Principal, id: string) {
    const job = this.authorizedJob(principal, id);
    return { report_id: id, status: job.status,
      ...(["queued", "running"].includes(job.status) ? { poll_after_seconds: 2 } : {}) };
  }

  result(principal: Principal, id: string): { body: object; status: number } {
    const job = this.authorizedJob(principal, id);
    if (job.status === "failed") {
      throw new PublicError(503, "REPORT_FAILED", "The demo report failed. Start a new report.");
    }
    if (job.status !== "completed" || !job.result) {
      return { status: 202, body: { report_id: id, status: job.status, poll_after_seconds: 2 } };
    }
    return { status: 200, body: job.result };
  }
}

// One Node process only. Restarting, scaling, or serverless execution loses this state.
const globalStore = globalThis as typeof globalThis & { reportDemoStore?: ReportStore };
export const reportStore = globalStore.reportDemoStore ??= new ReportStore();
