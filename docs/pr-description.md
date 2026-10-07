## Live runtime

- Web app: [roofing-crm.pages.dev](https://roofing-crm.pages.dev)
- CRM API (Hono Worker, D1 leads, Workers AI agent): [roofing-crm-api.mikhalenia-a.workers.dev](https://roofing-crm-api.mikhalenia-a.workers.dev), health: [/health](https://roofing-crm-api.mikhalenia-a.workers.dev/health)
- Pipeline data API: [scc-pipeline-api.mikhalenia-a.workers.dev](https://scc-pipeline-api.mikhalenia-a.workers.dev), health: [/api/health](https://scc-pipeline-api.mikhalenia-a.workers.dev/api/health)
- Pipeline MCP endpoint (Streamable HTTP, POST): [scc-pipeline-api.mikhalenia-a.workers.dev/mcp](https://scc-pipeline-api.mikhalenia-a.workers.dev/mcp)

No login and no credentials are needed.

**Demo video:** Coming soon (will be linked before this PR is marked ready)

## Summary

A map-based roofing lead CRM for Santa Clara County. A user drops a pin (or uses GPS), sets a radius,
sees aged roofs and open or stalled roofing permits, opens a property to review the permit, contractor
and provenance, saves it as a lead, and can ask a natural-language agent that answers from the same
records with citations. All data comes from the sibling pipeline API; this repo does not ingest data.

## How to review in 2 minutes

1. Open https://roofing-crm.pages.dev. Results for 5 miles around downtown San José load on their own.
   The chip in the top bar ("Data: Santa Clara County · updated …") opens "About this data"; the run id
   and manifest CID are under Technical details.
2. Click the map somewhere else in the county (or drag the dark pin). Markers and the table refresh
   without a button. Change Radius or Min roof age the same way.
3. Hover a marker for its summary card, then click it: the popup has Details, Save as lead and Ask agent.
4. Click Ask agent. The panel opens next to the map with a prefilled question; press Send (about 10 s).
5. Click Details (or a table row) for the drawer: permits, contractor, roof-age basis, provenance,
   "BBB: not available (no public source)".
6. Open Leads to see saved leads with status, a notes editor and "On map".
7. Or call the agent directly:

   ```sh
   curl -s -X POST https://roofing-crm-api.mikhalenia-a.workers.dev/agent \
     -H 'content-type: application/json' \
     -d '{"question":"Which properties within 5 miles of San Jose have roofs older than 15 years?","context":null}'
   ```

8. Note the greyed items under "Coming later" in the sidebar (Campaigns, Outreach, Estimates & Quotes,
   Crew Scheduling, Reporting).

The same flow runs automatically in `apps/web-e2e/src/demo-transcript.spec.ts`, with screenshots in
`apps/web-e2e/screenshots/`.

## Data provenance

Source: the pipeline API at https://scc-pipeline-api.mikhalenia-a.workers.dev, using the live snapshot
reported by `/health` (run 2026-10-07T18-31-50Z at the time of writing). Dataset counts measured on run
2026-10-07T17-10-54Z: 494,841 properties; 93,093 San José permits, 7,751 roofing (6,707 expired without
a final inspection, 1,017 open, 27 finaled). Roof age 15 years or more: 2,021 parcels, 962 within 5 mi
of downtown San José.

In the UI: the data status chip and its "About this data" popover (run id, manifest CID with a
plain-language explanation and a gateway link, API base) in the top bar; a plain provenance line in
the property drawer, with source URLs, versions, fetch time and manifest CID under "Technical details";
the agent returns a `sources` list of tool-returned APNs and permit numbers. If the data API is
unreachable the chip turns red ("Data unavailable") and the popover shows the error and the last known
run id, with no fake data.

## What works today

- Map centered on San José, county-bounded pin (click or drag), GPS button, radius 0.5-25 mi.
- Auto-search: pin, radius and filter changes refresh markers and table after 400 ms; "Refresh" stays as a secondary action.
- Filters: min roof age (default 15), permit state (Open / Stalled / Any, default Any), min open years, roofing only.
- Map card with a legend and a status line; muted markers per signal (aged roof, open permit, stalled permit), larger when a property has both; hover tooltips; table and marker hover highlight each other.
- Marker popup with the property summary and Details, Save as lead and Ask agent actions, all on the map.
- Agent panel next to the map: "Ask agent" prefills a question about the selected property and sends its APN as context; source chips fly the map to the property. The full-page Agent route still works.
- Property drawer with a header (address, APN, Save as lead, Ask agent), readable permit and roof-age labels, and provenance with raw identifiers behind "Technical details".
- Data status chip in the top bar ("Data: Santa Clara County · updated …") with an "About this data" explanation.
- Friendly labels everywhere (Open / Stalled / Completed, "23 years, 2 months", "Oct 7, 2026"); a unit test fails if a raw pipeline token reaches the Prospect, Leads or Agent screens.
- Leads CRUD with status, a notes editor, filters labeled with the pin they use, and "On map" (verified live: save, status change, delete).
- RAG agent (6 tools, up to 6 steps) with humanized tool calls, citations and "Show on map"; readable tool errors for bad coordinates; one-sentence replies to out-of-scope questions.
- Disabled future sections in the sidebar.

## Limitations

Full list: [docs/limitations.md](docs/limitations.md). Top 5:

1. Permits cover the City of San José only; elsewhere in the county there are no permit signals.
2. No BBB data (always "not available"); CSLB licenses are not matched.
3. No year built: roof age exists only where a completed roofing permit exists.
4. Most "open for years" permits expired without a final inspection. They are labeled "Stalled", or "Expired (work approved)" when every approval was completed (the stalled filter excludes those), never active.
5. No auth: leads are shared by anyone with the URL; 60 writes/min/IP. The account now runs on Workers Paid; the free-tier figures (Workers AI 10k neurons/day, D1 100k writes/day) are kept as design limits.

Agent caveats: thin prose; Llama 3.3 sometimes sends bad coordinates first, which the tools now reject with a readable error so it geocodes and retries; one sources-only answer was seen in production and a repair step handles it.

## Architecture

- Pages SPA: React, MUI, Vite, Leaflet with OpenStreetMap tiles (`apps/web`); calls the data API directly for search.
- Worker API: Hono on Cloudflare Workers (`apps/api`) with `/leads`, `/agent`, `/health`.
- D1: leads (unique by APN) and the per-IP write counter.
- Workers AI via the Vercel AI SDK (`ai` + `workers-ai-provider`), model `@cf/meta/llama-3.3-70b-instruct-fp8-fast`; tools call the same pipeline endpoints as the UI.
- Contracts lib: Zod schemas shared by web and api (`libs/contracts`).
- nx monorepo, pnpm, Node 22; CI in `.github/workflows/ci.yml`.

## Golden Path deviation

Cloudflare (Pages, Workers, D1, Workers AI) instead of AWS/CDK, for two reasons: zero idle cost on the
free tier, and the same stack as the sibling pipeline API, which is already a Cloudflare Worker. The Vercel AI SDK
is used for every LLM call as required, tool schemas are Zod, and there are no provider SDKs.

## Testing

- Unit (Vitest): contracts, search state, API clients, components, agent post-filters.
- Workers pool (`@cloudflare/vitest-pool-workers`): leads CRUD and 409, rate limit, `/agent` with a stubbed model and pipeline, and the real `generateText` loop.
- Playwright `apps/web-e2e/src/demo-transcript.spec.ts` against the deployed runtime.
  - 12 steps, all passing on https://roofing-crm.pages.dev with writes enabled (screenshots in `apps/web-e2e/screenshots/`): open, pin with auto-search, radius/age, results, sort, drawer, marker popup, ask agent from the popup, save as lead from the popup (201), leads page (PATCH status, DELETE via the UI), agent page, disabled nav.
  - The run deletes the lead it created; production keeps no demo lead.
  - Not covered by e2e: lead filters and GPS.

## Acceptance criteria

[docs/acceptance-criteria.md](docs/acceptance-criteria.md) traces every README criterion and demo step:
20 items, 16 met, 4 partial, 0 gap (partial: BBB not available, San José-only permits, county rectangle, lead filters not in the e2e).

## Kit usage

Only what the code reflects: the Vercel AI SDK with Zod tool schemas, as the kit's
`apply-engineering-guidelines` requires, and a retrieval-then-cite agent design (tools retrieve
pipeline records, the answer may name only returned records, citations are rebuilt in code from tool
results). No kit agents were used.
