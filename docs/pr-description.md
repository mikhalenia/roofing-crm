## Summary

A map-based roofing lead CRM for Santa Clara County. A user drops a pin (or uses GPS), sets a radius,
sees aged roofs and open or stalled roofing permits, opens a property to review the permit, contractor
and provenance, saves it as a lead, and can ask a natural-language agent that answers from the same
records with citations. All data comes from the sibling pipeline API; this repo does not ingest data.

## Live runtime

- Web (Cloudflare Pages): https://roofing-crm.pages.dev
- CRM API (Hono Worker, D1 leads, Workers AI agent): https://roofing-crm-api.mikhalenia-a.workers.dev
- Data API (sibling pipeline): https://scc-pipeline-api.mikhalenia-a.workers.dev

No login and no credentials are needed.

**Demo video:** _to be added before marking ready_

## How to review in 2 minutes

1. Open https://roofing-crm.pages.dev. The banner shows the snapshot run and manifest CID.
2. Click the map near downtown San José, set Radius 5 mi and Min roof age 15 yrs, click Search.
3. Click the Days open header until descending; click a row to open the drawer (contractor, roof-age
   basis, provenance, "BBB: not available (no public source)").
4. Open https://roofing-crm.pages.dev/agent, pick the first example, press Send (can take up to a minute).
5. Or call the agent directly:

   ```sh
   curl -s -X POST https://roofing-crm-api.mikhalenia-a.workers.dev/agent \
     -H 'content-type: application/json' \
     -d '{"question":"Which properties within 5 miles of San Jose have roofs older than 15 years?","context":null}'
   ```

6. Note the greyed Campaigns / Outreach / Estimates & Quotes / Crew Scheduling / Reporting items.
7. Saving leads and the Leads page need D1 writes, which are blocked until 2026-10-08 00:00 UTC (see Testing).

## Data provenance

Source: the pipeline API at https://scc-pipeline-api.mikhalenia-a.workers.dev, snapshot run
`2026-10-07T17-10-54Z`, manifest CID `bafybeidav5d5sigbbrvfhaexjxa6nqszyfmcpscyhqpnuv65hribw7y4jq`.
494,841 properties; 93,093 San José permits, 7,751 roofing (6,707 expired without final inspection,
1,017 open, 27 finaled). Roof age 15 years or more: 2,021 parcels, 962 within 5 mi of downtown San José.

In the UI: a snapshot banner (run, manifest CID, API base) on the Prospect page; per-record provenance
chips and a source line (URL, version, fetched at, manifest CID) in the property drawer; the agent
returns a `sources` list of tool-returned APNs and permit numbers. If the data API is unreachable the
banner shows the error and the last known snapshot, with no fake data.

## What works today

- Map centered on San José, county-bounded pin, GPS button, radius 0.5-25 mi.
- Filters: min roof age (default 15), permit state, min open years, roofing only.
- Colored markers (aged roof, open permit, stalled permit) and a sortable candidate table, default longest-open first.
- Property drawer with permits, contractor, owner observations, roof-age basis and provenance.
- Leads CRUD with status, notes and filters (code and tests complete; deployed run pending, see Testing).
- RAG agent (6 tools, up to 6 steps) with tool-call display, citations and "Apply to map".
- Disabled future sections in the sidebar.

## Limitations

Full list: [docs/limitations.md](docs/limitations.md). Top 5:

1. Permits cover the City of San José only; elsewhere in the county there are no permit signals.
2. No BBB data (always "not available"); CSLB licenses are not matched.
3. No year built: roof age exists only where a completed roofing permit exists.
4. Most "open for years" permits are `expired_unfinaled` and are labeled stalled, not active.
5. No auth: leads are shared by anyone with the URL; 60 writes/min/IP; free-tier Workers AI (10k neurons/day) and D1 (100k writes/day) limits.

Agent caveats: thin prose; one sources-only answer seen in production, a repair step (6c1e8f9) is deployed but not yet verified live.

## Architecture

- Pages SPA: React, MUI, Vite, Leaflet with OpenStreetMap tiles (`apps/web`); calls the data API directly for search.
- Worker API: Hono on Cloudflare Workers (`apps/api`) with `/leads`, `/agent`, `/health`.
- D1: leads (unique by APN) and the per-IP write counter.
- Workers AI via the Vercel AI SDK (`ai` + `workers-ai-provider`), model `@cf/meta/llama-3.3-70b-instruct-fp8-fast`; tools call the same pipeline endpoints as the UI.
- Contracts lib: Zod schemas shared by web and api (`libs/contracts`).
- nx monorepo, pnpm, Node 22; CI in `.github/workflows/ci.yml`.

## Golden Path deviation

Cloudflare (Pages, Workers, D1, Workers AI) instead of AWS/CDK, for zero idle cost. The Vercel AI SDK
is used for every LLM call as required, tool schemas are Zod, and there are no provider SDKs.

## Testing

- Unit (Vitest): contracts, search state, API clients, components, agent post-filters.
- Workers pool (`@cloudflare/vitest-pool-workers`): leads CRUD and 409, rate limit, `/agent` with a stubbed model and pipeline, and the real `generateText` loop.
- Playwright `apps/web-e2e/src/demo-transcript.spec.ts` against the deployed runtime.
  - Verified on the deployed runtime (screenshots in `apps/web-e2e/screenshots/`): 01 open, 02 pin, 03 radius/age, 04 search, 05 sort, 06 drawer, 09 agent, 10 disabled nav.
  - Pending: 07 save as lead and 08 leads page. The D1 free-tier daily write limit was hit on 2026-10-07; writes resume 2026-10-08 00:00 UTC, then the e2e is re-run and screenshots added.
  - Not covered by e2e: lead filters and GPS.

## Acceptance criteria

[docs/acceptance-criteria.md](docs/acceptance-criteria.md) traces every README criterion and demo step:
20 items, 14 met, 6 partial, 0 gap (partial: pending D1 re-run, BBB not available, San José-only permits).

## Kit usage

Only what the code reflects: the Vercel AI SDK with Zod tool schemas, as the kit's
`apply-engineering-guidelines` requires, and a retrieval-then-cite agent design (tools retrieve
pipeline records, the answer may name only returned records, citations are rebuilt in code from tool
results). No kit agents were used.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
