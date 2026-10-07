import {
  type CreateLead,
  type PipelineLead,
  PipelineSearchResponse,
  PipelineSnapshot,
} from "@crm/contracts";
import { tool } from "ai";
import { z } from "zod";
import { geocodePlace } from "./places";

export interface LeadStore {
  create(input: CreateLead): Promise<"created" | "exists">;
}

/** Max records handed back to the model per call, to keep the context small. */
export const MAX_ITEMS = 25;
/** The pipeline's default `limit` when the model omits it. */
export const DEFAULT_LIMIT = 200;

/** The fields of a pipeline record the model gets to see. */
export function trimLead(l: PipelineLead) {
  return {
    apn: l.apn,
    address: l.situsAddress ?? null,
    city: l.situsCity ?? null,
    roofAgeYears: l.roofAgeYears ?? null,
    roofAgeAnchor: l.roofAgeAnchor ?? null,
    permitNumber: l.permitNumber ?? null,
    permitState: l.permitState ?? null,
    // expired_unfinaled + approvalsComplete true = "Expired (work approved)", not stalled.
    approvalsComplete: l.approvalsComplete ?? null,
    daysOpen: l.daysOpen ?? null,
    contractorCompany: l.contractorCompany ?? null,
    cslbLicenseNumber: l.cslbLicenseNumber ?? null,
    ownerName: l.ownerName ?? null,
    distanceMiles: l.distanceMiles,
    permitSourceUrl: l.provenance.permitSourceUrl ?? null,
  };
}

const PropertyDetail = z.looseObject({
  snapshot: PipelineSnapshot,
  property: z.looseObject({ apn: z.string(), situsAddress: z.string().nullish() }).nullish(),
  permits: z.array(z.unknown()).nullish(),
  roofAge: z.unknown().optional(),
  owners: z.array(z.unknown()).nullish(),
  contractors: z.array(z.unknown()).nullish(),
});

// Llama on Workers AI often sends numbers and booleans as strings, so coerce them.
const num = () => z.coerce.number();
const bool = z.preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean());

/**
 * Coordinates and radius are validated inside the tools, not by Zod, so a bad value (a nested
 * call, a string, an out-of-range number) comes back as an error the model can read and act on
 * instead of an opaque input-validation failure or a pipeline 400.
 */
const loose = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : null;
};
const looseNum = () => z.preprocess(loose, z.number().nullable());

const lat = looseNum().describe("Latitude of the search center from geocode_place or the map (Santa Clara County, about 37.0-37.5)");
const lon = looseNum().describe("Longitude of the search center from geocode_place or the map (about -122.3 to -121.2)");
const radiusMiles = looseNum().optional().describe("Search radius in miles, 0.1-50, default 5");

export const INVALID_COORDINATES = "invalid coordinates; call geocode_place first";

/** The reason a search area is unusable, or null when lat, lon and radius are valid. */
export function invalidArea(a: { lat: unknown; lon: unknown; radiusMiles?: unknown }): string | null {
  const la = loose(a.lat);
  const lo = loose(a.lon);
  if (la == null || lo == null || la < -90 || la > 90 || lo < -180 || lo > 180) {
    const shown = (v: unknown) => (typeof v === "object" && v !== null ? "an object" : String(v));
    return `${INVALID_COORDINATES} (got lat ${shown(a.lat)}, lon ${shown(a.lon)})`;
  }
  const r = a.radiusMiles == null ? null : loose(a.radiusMiles);
  if (a.radiusMiles != null && (r == null || r < 0.1 || r > 50)) {
    return `invalid radius ${String(a.radiusMiles)}; use 0.1 to 50 miles`;
  }
  return null;
}

const limit = num().int().min(1).max(500).optional().describe("Max records to fetch, default 200");

export function buildTools(pipelineApi: string, fetcher: typeof fetch, leadStore: LeadStore) {
  /** Full records returned during this run, so create_lead can snapshot them. */
  const returned = new Map<string, PipelineLead>();

  async function getJson(
    path: string,
    params: Record<string, string | number | boolean | undefined> = {},
  ) {
    const url = new URL(path, pipelineApi);
    for (const [k, v] of Object.entries(params))
      if (v !== undefined) url.searchParams.set(k, String(v));
    const res = await fetcher(url.toString(), { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`pipeline API ${res.status} for ${url.pathname}`);
    return (await res.json()) as unknown;
  }

  async function search(
    path: string,
    params: Record<string, unknown> & { lat: unknown; lon: unknown },
  ) {
    const bad = invalidArea(params);
    if (bad) return { count: 0, fetched: 0, error: bad };
    let raw: unknown;
    try {
      raw = await getJson(path, params as Record<string, string | number | boolean | undefined>);
    } catch (e) {
      // The pipeline answers 400 for a point outside Santa Clara County.
      if (e instanceof Error && / 400 /.test(e.message)) {
        return { count: 0, fetched: 0, error: `${INVALID_COORDINATES}: the point is outside Santa Clara County` };
      }
      throw e;
    }
    const body = PipelineSearchResponse.parse(raw);
    const seen = body.items.slice(0, MAX_ITEMS);
    // Only the records the model actually saw may become leads.
    for (const item of seen) returned.set(item.apn, item);
    const fetched = body.items.length;
    const limit = typeof params["limit"] === "number" ? params["limit"] : DEFAULT_LIMIT;
    return {
      // `count` is kept for older clients; it equals `fetched`, not the total number of matches.
      count: fetched,
      fetched,
      // The pipeline returned as many records as asked for, so more may match.
      capped: fetched >= limit,
      shown: seen.length,
      manifestCid: body.snapshot.manifestCid,
      items: seen.map(trimLead),
    };
  }

  return {
    geocode_place: tool({
      description:
        "Resolve a Santa Clara County city name (e.g. 'Cupertino', 'downtown San Jose') to lat/lon. Call this first when the question names a place.",
      inputSchema: z.object({ name: z.string().describe("City or place name") }),
      execute: async ({ name }) => {
        const hit = geocodePlace(name);
        return hit
          ? { count: 1, ...hit }
          : {
              count: 0,
              error: `Unknown place "${name}". Known: the 15 Santa Clara County cities.`,
            };
      },
    }),

    search_properties_in_radius: tool({
      description:
        "List properties within a radius of a point, nearest first, with roof age and permit signals.",
      inputSchema: z.object({ lat, lon, radiusMiles, limit }),
      execute: (a) =>
        search("/api/properties/radius", {
          lat: a.lat,
          lon: a.lon,
          radiusMiles: a.radiusMiles ?? 5,
          limit: a.limit,
        }),
    }),

    find_aged_roofs: tool({
      description:
        "Find properties whose last roofing permit is at least minRoofAgeYears old (default 15), within a radius.",
      inputSchema: z.object({
        lat,
        lon,
        radiusMiles,
        minRoofAgeYears: num()
          .int()
          .min(5)
          .max(40)
          .optional()
          .describe("Minimum roof age in years, default 15"),
        limit,
      }),
      execute: (a) =>
        search("/api/leads/aged-roofs", {
          lat: a.lat,
          lon: a.lon,
          radiusMiles: a.radiusMiles ?? 5,
          minRoofAgeYears: a.minRoofAgeYears ?? 15,
          limit: a.limit,
        }),
    }),

    find_open_roofing_permits: tool({
      description:
        "Find roofing permits that never got a final inspection, within a radius. Permit states: " +
        "'open' = issued and still active; 'expired_unfinaled' = expired without a final inspection (stalled), " +
        "the most common case; 'finaled' = completed (never returned here). state defaults to 'any' (open or expired_unfinaled).",
      inputSchema: z.object({
        lat,
        lon,
        radiusMiles,
        state: z
          .enum(["open", "expired_unfinaled", "any"])
          .optional()
          .describe("Permit state filter, default 'any'"),
        minOpenYears: num()
          .min(0)
          .max(20)
          .optional()
          .describe("Minimum years since issue, default 0"),
        roofingOnly: bool.optional().describe("Only roofing permits, default true"),
        limit,
      }),
      execute: (a) =>
        search("/api/leads/open-permits", {
          lat: a.lat,
          lon: a.lon,
          radiusMiles: a.radiusMiles ?? 5,
          state: a.state ?? "any",
          minOpenYears: a.minOpenYears ?? 0,
          roofingOnly: a.roofingOnly ?? true,
          limit: a.limit,
        }),
    }),

    get_property: tool({
      description:
        "Get one property by APN: permits, roof age basis, owner observations and contractors.",
      inputSchema: z.object({
        apn: z.string().describe("Assessor parcel number, e.g. 264-12-034"),
      }),
      execute: async ({ apn }) => {
        const d = PropertyDetail.parse(await getJson(`/api/properties/${encodeURIComponent(apn)}`));
        const found = d.property ?? null;
        return {
          count: found ? 1 : 0,
          manifestCid: d.snapshot.manifestCid,
          property: found,
          roofAge: found ? (d.roofAge ?? null) : null,
          permits: found ? (d.permits ?? []).slice(0, MAX_ITEMS) : [],
          owners: found ? (d.owners ?? []).slice(0, MAX_ITEMS) : [],
          contractors: found ? (d.contractors ?? []).slice(0, MAX_ITEMS) : [],
        };
      },
    }),

    create_lead: tool({
      description:
        "Save a property as a CRM lead. Only works for an APN returned by a search tool earlier in this conversation.",
      inputSchema: z.object({ apn: z.string() }),
      execute: async ({ apn }) => {
        const snapshot = returned.get(apn);
        if (!snapshot) {
          return {
            count: 0,
            created: false,
            error: `APN ${apn} was not returned by a search tool; search first.`,
          };
        }
        const status = await leadStore.create({ apn, snapshot });
        return { count: 1, created: status === "created", status };
      },
    }),
  };
}

export type AgentTools = ReturnType<typeof buildTools>;
