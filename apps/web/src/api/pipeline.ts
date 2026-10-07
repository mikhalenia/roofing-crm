import { z } from "zod";
import {
  PipelineSearchResponse,
  PipelineSnapshot,
  type SearchParamsOutput,
} from "@crm/contracts";

export class PipelineError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "PipelineError";
    this.status = status;
  }
}

const str = z.string().nullish();
const num = z.number().nullish();

export const PropertyDetail = z.looseObject({
  snapshot: PipelineSnapshot,
  property: z.looseObject({
    apn: z.string(),
    situsAddress: str,
    situsCity: str,
    situsZip: str,
    jurisdiction: str,
    lat: num,
    lon: num,
    sourceUrl: str,
    sourceVersion: str,
    fetchedAt: str,
  }),
  permits: z.array(
    z.looseObject({
      permitNumber: z.string(),
      apn: str,
      status: str,
      permitState: str,
      isRoofing: z.boolean().nullish(),
      workDescription: str,
      subtype: str,
      approvals: z.unknown().optional(),
      issueDate: str,
      finalDate: str,
      daysOpen: num,
      valuation: num,
      address: str,
      contractorCompany: str,
      contractorId: str,
      sourceUrl: str,
      sourceVersion: str,
      fetchedAt: str,
    }),
  ),
  roofAge: z
    .looseObject({
      roofDate: str,
      roofAgeYears: num,
      anchor: str,
      confidence: str,
      permitNumber: str,
    })
    .nullish(),
  owners: z.array(
    z.looseObject({ ownerName: str, observedOn: str, permitNumber: str }),
  ),
  contractors: z.array(
    z.looseObject({
      contractorId: str,
      companyName: str,
      contactName: str,
      permitCount: num,
      roofingPermitCount: num,
      cslbLicenseNumber: str,
      cslbStatus: str,
      cslbMatchMethod: str,
      bbbRating: z.unknown().optional(),
    }),
  ),
});
export type PropertyDetail = z.infer<typeof PropertyDetail>;

const Health = z.looseObject({ ok: z.boolean(), snapshot: PipelineSnapshot });

export function apiBase(): string {
  return (import.meta.env.VITE_PIPELINE_API ?? "").replace(/\/$/, "");
}

async function rawFetch(url: string): Promise<Response> {
  if (import.meta.env.VITE_USE_STUB === "true") {
    const { stubFetch } = await import("../dev/stub");
    return stubFetch(url);
  }
  return fetch(url);
}

async function getJson<T>(
  path: string,
  query: Record<string, string | number | boolean>,
  schema: z.ZodType<T>,
): Promise<T> {
  const qs = new URLSearchParams(
    Object.entries(query).map(([k, v]) => [k, String(v)]),
  ).toString();
  const url = `${apiBase()}${path}${qs ? `?${qs}` : ""}`;
  let res: Response;
  try {
    res = await rawFetch(url);
  } catch (e) {
    throw new PipelineError(
      `Pipeline API unreachable: ${e instanceof Error ? e.message : String(e)}`,
      0,
    );
  }
  if (!res.ok) {
    throw new PipelineError(`Pipeline API error ${res.status}`, res.status);
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new PipelineError("Pipeline API returned invalid JSON", res.status);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new PipelineError("Pipeline API returned an unexpected response", res.status);
  }
  return parsed.data;
}

export type SearchQuery = SearchParamsOutput;

export function fetchAgedRoofs(p: SearchQuery) {
  return getJson(
    "/api/leads/aged-roofs",
    {
      lat: p.lat,
      lon: p.lon,
      radiusMiles: p.radiusMiles,
      minRoofAgeYears: p.minRoofAgeYears,
      limit: p.limit,
    },
    PipelineSearchResponse,
  );
}

export function fetchOpenPermits(p: SearchQuery) {
  return getJson(
    "/api/leads/open-permits",
    {
      lat: p.lat,
      lon: p.lon,
      radiusMiles: p.radiusMiles,
      state: p.permitState,
      minOpenYears: p.minOpenYears,
      roofingOnly: p.roofingOnly,
      limit: p.limit,
    },
    PipelineSearchResponse,
  );
}

export function fetchProperty(apn: string) {
  return getJson(`/api/properties/${encodeURIComponent(apn)}`, {}, PropertyDetail);
}

export function fetchHealth() {
  return getJson("/api/health", {}, Health);
}
