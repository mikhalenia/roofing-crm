import {
  boundingBox,
  CreateLead,
  haversineMiles,
  LeadFilter,
  LeadRecord,
  LeadStatus,
  PipelineLead,
  UpdateLead,
} from "@crm/contracts";
import { Hono } from "hono";
import type { ZodType } from "zod";

interface LeadRow {
  apn: string;
  status: string;
  notes: string;
  snapshot: string;
  created_at: string;
  updated_at: string;
}

function toRecord(row: LeadRow): LeadRecord {
  return {
    apn: row.apn,
    status: LeadStatus.parse(row.status),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    snapshot: PipelineLead.parse(JSON.parse(row.snapshot)),
  };
}

/** Parses with a Zod schema; returns the value or a ready-made 400 payload. */
function parse<T>(schema: ZodType<T>, input: unknown) {
  const r = schema.safeParse(input);
  return r.success
    ? { data: r.data }
    : { error: { error: "invalid request", issues: r.error.issues } };
}

async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

/** Inserts a new lead (status "new"); "exists" when the APN is already a lead. Shared with the agent. */
export async function insertLead(
  db: D1Database,
  { apn, snapshot }: CreateLead,
  now = new Date().toISOString(),
): Promise<"created" | "exists"> {
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO leads
         (apn, status, notes, snapshot, lat, lon, roof_age_years, permit_state, days_open, created_at, updated_at)
       VALUES (?, 'new', '', ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      apn,
      JSON.stringify(snapshot),
      snapshot.lat,
      snapshot.lon,
      snapshot.roofAgeYears ?? null,
      snapshot.permitState ?? null,
      snapshot.daysOpen ?? null,
      now,
      now,
    )
    .run();
  return result.meta.changes === 0 ? "exists" : "created";
}

export const leads = new Hono<{ Bindings: Cloudflare.Env }>();

leads.get("/", async (c) => {
  const parsed = parse(LeadFilter, c.req.query());
  if (parsed.error) return c.json(parsed.error, 400);
  const f = parsed.data;

  const where: string[] = [];
  const args: (string | number)[] = [];
  if (f.status) {
    where.push("status = ?");
    args.push(f.status);
  }
  if (f.minRoofAgeYears !== undefined) {
    where.push("roof_age_years >= ?");
    args.push(f.minRoofAgeYears);
  }
  if (f.permitState && f.permitState !== "any") {
    where.push("permit_state = ?");
    args.push(f.permitState);
  }
  if (f.minOpenYears !== undefined) {
    where.push("days_open >= ?");
    args.push(f.minOpenYears * 365);
  }
  const center =
    f.lat !== undefined && f.lon !== undefined && f.radiusMiles !== undefined
      ? { lat: f.lat, lon: f.lon }
      : null;
  if (center && f.radiusMiles !== undefined) {
    const box = boundingBox(center, f.radiusMiles);
    where.push("lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?");
    args.push(box.minLat, box.maxLat, box.minLon, box.maxLon);
  }

  const sql = `SELECT * FROM leads${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC`;
  const { results } = await c.env.DB.prepare(sql)
    .bind(...args)
    .all<LeadRow & { lat: number; lon: number }>();

  const rows =
    center && f.radiusMiles !== undefined
      ? results.filter((r) => haversineMiles(center, { lat: r.lat, lon: r.lon }) <= (f.radiusMiles ?? 0))
      : results;
  return c.json(rows.map(toRecord), 200);
});

/** Largest accepted snapshot, serialized. Pipeline records are a few KB. */
export const MAX_SNAPSHOT_BYTES = 64 * 1024;

leads.get("/:apn", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM leads WHERE apn = ?")
    .bind(c.req.param("apn"))
    .first<LeadRow>();
  return row ? c.json(toRecord(row), 200) : c.json({ error: "not found" }, 404);
});

leads.post("/", async (c) => {
  const parsed = parse(CreateLead, await readJson(c.req.raw));
  if (parsed.error) return c.json(parsed.error, 400);
  const { apn, snapshot } = parsed.data;
  if (new TextEncoder().encode(JSON.stringify(snapshot)).length > MAX_SNAPSHOT_BYTES) {
    return c.json({ error: "snapshot too large" }, 413);
  }
  const now = new Date().toISOString();
  if ((await insertLead(c.env.DB, parsed.data, now)) === "exists") {
    return c.json({ error: "lead exists" }, 409);
  }

  const record: LeadRecord = {
    apn,
    status: "new",
    notes: "",
    createdAt: now,
    updatedAt: now,
    snapshot,
  };
  return c.json(record, 201);
});

leads.patch("/:apn", async (c) => {
  const parsed = parse(UpdateLead, await readJson(c.req.raw));
  if (parsed.error) return c.json(parsed.error, 400);
  const { status, notes } = parsed.data;
  const now = new Date().toISOString();

  const result = await c.env.DB.prepare(
    `UPDATE leads SET status = COALESCE(?, status), notes = COALESCE(?, notes), updated_at = ?
     WHERE apn = ?`,
  )
    .bind(status ?? null, notes ?? null, now, c.req.param("apn"))
    .run();
  if (result.meta.changes === 0) return c.json({ error: "not found" }, 404);

  const row = await c.env.DB.prepare("SELECT * FROM leads WHERE apn = ?")
    .bind(c.req.param("apn"))
    .first<LeadRow>();
  return row ? c.json(toRecord(row), 200) : c.json({ error: "not found" }, 404);
});

leads.delete("/:apn", async (c) => {
  const result = await c.env.DB.prepare("DELETE FROM leads WHERE apn = ?")
    .bind(c.req.param("apn"))
    .run();
  return result.meta.changes === 0 ? c.json({ error: "not found" }, 404) : c.body(null, 204);
});
