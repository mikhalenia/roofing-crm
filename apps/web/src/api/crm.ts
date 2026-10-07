import { z } from "zod";
import {
  AgentResponse,
  LeadRecord,
  type AgentRequest,
  type CreateLead,
  type LeadFilter,
  type UpdateLead,
} from "@crm/contracts";
import { requestJson } from "./http";

export class CrmError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "CrmError";
    this.status = status;
  }
}

function crmBase(): string {
  return (import.meta.env.VITE_CRM_API ?? "").replace(/\/$/, "");
}

async function crmFetch(url: string, init?: RequestInit): Promise<Response> {
  if (import.meta.env.VITE_USE_STUB === "true") {
    const { stubCrmFetch } = await import("../dev/stub");
    return stubCrmFetch(url, init);
  }
  return fetch(url, init);
}

function call<T>(
  path: string,
  schema: z.ZodType<T> | null,
  init?: { method: string; body?: unknown },
): Promise<T> {
  const req: RequestInit | undefined = init
    ? {
        method: init.method,
        ...(init.body !== undefined && {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(init.body),
        }),
      }
    : undefined;
  return requestJson({
    url: `${crmBase()}${path}`,
    ...(req && { init: req }),
    schema,
    fetcher: crmFetch,
    label: "CRM API",
    makeError: (m, s) => new CrmError(m, s),
  });
}

export function listLeads(filter: LeadFilter = {}): Promise<LeadRecord[]> {
  const qs = new URLSearchParams(
    Object.entries(filter)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  ).toString();
  return call(`/leads${qs ? `?${qs}` : ""}`, z.array(LeadRecord));
}

/** The saved lead for an APN, or null when it is not a lead. */
export async function getLead(apn: string): Promise<LeadRecord | null> {
  try {
    return await call(`/leads/${encodeURIComponent(apn)}`, LeadRecord);
  } catch (e) {
    if (e instanceof CrmError && e.status === 404) return null;
    throw e;
  }
}

export function createLead(input: CreateLead): Promise<LeadRecord> {
  return call("/leads", LeadRecord, { method: "POST", body: input });
}

export function updateLead(apn: string, patch: UpdateLead): Promise<void> {
  return call(`/leads/${encodeURIComponent(apn)}`, null, { method: "PATCH", body: patch });
}

export function deleteLead(apn: string): Promise<void> {
  return call(`/leads/${encodeURIComponent(apn)}`, null, { method: "DELETE" });
}

export function askAgent(req: AgentRequest): Promise<AgentResponse> {
  return call("/agent", AgentResponse, { method: "POST", body: req });
}
