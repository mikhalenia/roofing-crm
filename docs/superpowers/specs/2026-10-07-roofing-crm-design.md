# Roofing CRM & lead identification UI — design

Date: 2026-10-07. Status: approved for implementation.

## 1. Intent

A roofing sales user can drop a pin (or use GPS) in Santa Clara County, set a radius, see
which properties have aged roofs or open/stalled roofing permits, inspect permit and
contractor details, save the good ones as CRM leads, and ask the same questions in plain
English to an agent that answers from the real records with citations.

Success: an evaluator opens the hosted URL with no login, walks the README demo transcript
end to end, and every number on screen comes from the published Santa Clara dataset.

## 2. Scope and constraints

- Consumes the dataset produced by the sibling pipeline repository through its hosted API
  (REST + MCP). No ingestion here. The API base URL and the snapshot `manifest_cid` are shown
  in the UI for provenance.
- Zero budget: Cloudflare Pages (web), one Cloudflare Worker (leads API + agent), D1 (leads),
  Workers AI (LLM). No secrets reach the browser; the Worker uses the AI binding.
- TypeScript, Node 22 via nvm, pnpm, nx, React + MUI + Vite, Leaflet with OpenStreetMap tiles,
  Vitest, Playwright for the demo-transcript e2e. All LLM calls go through the Vercel AI SDK
  (`ai`) with the `workers-ai-provider`; tool schemas in Zod.
- All repository content in English.

## 3. Architecture

```
apps/web   (Pages)   ── fetch ──▶  pipeline API  /api/*   (sibling repo Worker, D1 snapshot)
                     ── fetch ──▶  apps/api (Worker)
                                      ├─ /leads      D1 (this repo)
                                      └─ /agent      Vercel AI SDK + Workers AI
                                                      tools ──▶ pipeline API
libs/contracts   Zod schemas shared by web and api (lead, agent request/response)
```

Property search, filters and detail views call the pipeline API directly from the browser;
the Worker only owns mutable CRM state and the agent. The agent's tools call the same
pipeline endpoints, so UI and agent always see the same snapshot.

## 4. Features

1. **Map workspace** — defaults to Santa Clara County (center San José, zoom 11). Click to
   drop a pin; "Use my location" button calls the Geolocation API; radius control 0.5–25 mi
   (default 5). A circle shows the radius. Results render as markers colored by lead
   signal (aged roof / open roofing permit / stalled expired permit / other).
2. **Filters** — minimum roof age (default 15 years, 5–40), permit state (open / stalled
   expired / any, default any), minimum permit open duration in years (0–20), roofing only toggle (default
   on). Filters map 1:1 to pipeline API parameters.
3. **Candidate list** — sortable table of matches: address, roof age with anchor and
   confidence, permit number, state, days open, contractor, CSLB license, BBB ("not
   available"), owner name, distance. Sort defaults to longest-open permit first.
4. **Property drawer** — full record: parcel, all permits on the APN with status/dates,
   contractor with CSLB status, owner observations, roof-age basis, provenance (source url,
   version, fetched_at, manifest CID). "Save as lead" button; disabled with "Already a lead"
   when one exists for the APN.
5. **Leads** — list with status (`new` / `contacted` / `qualified` / `lost`), notes, created
   date, snapshot of the signals at save time; filter by roof age, permit state, open
   duration, and distance from the current pin; edit status/notes; delete. Stored in D1,
   keyed by APN (unique).
6. **Agent** — chat panel. Request: question + current pin/radius context. The Worker runs
   `generateText` with tools `search_properties_in_radius`, `find_aged_roofs`,
   `find_open_roofing_permits`, `get_property`, `geocode_place` (static table of county
   cities/centroids), `create_lead`; up to 6 steps. The system prompt requires the answer to
   name only records returned by tools, to list assumptions (e.g. default 15-year threshold)
   and missing data, and to end with a `Sources` list of permit numbers/APNs. The UI shows
   the tool calls, the answer, and applies the agent's resolved filters to the map.
7. **Future sections (disabled)** — Campaigns, Outreach, Estimates & Quotes, Crew Scheduling,
   Reporting: visible in navigation, disabled, tooltip "Coming later — this release is lead
   identification".

## 5. API (apps/api Worker)

- `GET /leads?minRoofAge&permitState&minOpenYears&lat&lon&radiusMiles` → `Lead[]`
- `GET /leads/:apn` → `Lead` or 404 (the drawer uses it to show "Already a lead" on open)
- `POST /leads` `{apn, snapshot}` → 201 or 409 if exists (413 if the snapshot exceeds 64 KB)
- `PATCH /leads/:apn` `{status?, notes?}`
- `DELETE /leads/:apn`
- `POST /agent` `{question, context: {lat, lon, radiusMiles} | null}` →
  `{answer, toolCalls[], sources[], resolvedFilters | null}`
- `GET /health` → `{ok, pipelineApi, pipelineOk, manifestCid, runId}` (ids proxied from the
  pipeline's `/api/health`, 5 s timeout; null with `pipelineOk: false` on failure)

All inputs validated with Zod from `libs/contracts`. CORS restricted to the Pages origin.
No authentication (public demo); writes are rate-limited per IP with a simple D1 counter.

## 6. Repository layout

```
apps/web/            React + MUI + Vite + Leaflet; Playwright e2e in apps/web-e2e
apps/api/            Cloudflare Worker (Hono), D1 migration for leads, agent
libs/contracts/      Zod schemas and TS types
docs/superpowers/    specs and plans
docs/limitations.md  what the data cannot answer and why
.github/workflows/   ci.yml (lint, typecheck, test, build, e2e against preview)
CLAUDE.md
```

## 7. Error handling

- Pipeline API unreachable: banner with the error and the last known manifest CID; filters
  stay usable; no fake data.
- Agent tool failure: the model is told the tool failed and answers with what it has; the UI
  shows the failed call.
- Geolocation denied: fall back to the default pin with a notice.

## 8. Testing

- Unit (Vitest): filter-to-query mapping, distance formatting, lead snapshot builder, agent
  response parsing, Zod contracts.
- Worker tests (`@cloudflare/vitest-pool-workers`): leads CRUD and 409 on duplicate; agent
  endpoint with a stubbed model and stubbed pipeline API.
- Playwright e2e `demo-transcript.spec.ts` follows the README demo transcript against the
  deployed preview URL: county default, pin + radius, aged roofs, long-open permits, drawer
  with contractor, save lead, agent question, lead filters, disabled sections. The same
  script doubles as the recording script for the demo video.

## 9. Out of scope

Ingestion, live BBB lookup, outbound messaging, authentication, multi-user tenancy.

## Decisions

- Agent model (2026-10-07): `@cf/meta/llama-3.3-70b-instruct-fp8-fast` via `workers-ai-provider`.
  On a preview deploy it emitted tool calls on every run (geocode_place, find_aged_roofs). It
  sends numbers as strings, so tool inputs use `z.coerce`. `@cf/openai/gpt-oss-20b` was tried
  as well: one of two runs returned a broken tool name (`find_aged_roofs<|channel|>analysis`)
  and no text, so llama stays. Raw output: `docs/agent-sample.md`.
