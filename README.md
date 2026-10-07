# Roofing CRM & Lead Identification UI

## Context

Roofing companies need a practical CRM for finding and qualifying residential and commercial roofing leads in their service area. The immediate requirement is a map-based CRM that helps sales teams explore local properties, surface roofs that are aging or have stalled open permits, and turn those signals into actionable outreach opportunities.

Data gathering and ingestion pipelines are covered by a separate user story and are **out of scope** for this work. This story assumes property, permit, and related enrichment data are already available for the UI and agent to consume.

## Description

Create a map-based roofing lead CRM that enables users to locate properties from their current GPS position or a pin drop on the map, set a search radius, and review candidate roofs that meet lead criteria—primarily roof age (for example, older than 15 years) and open roofing permits (especially permits that have remained open for many years).

The UI should present property and permit details, including contractor information and BBB rating scores where available. Users should also be able to query the platform in natural language through a RAG-backed agent to discover roofing opportunities (for example, “show me open roofing permits older than five years within five miles of [city xyz]”).

## Acceptance Criteria
- Default the map and search experience to a particular county, with support for exploring properties in the user’s selected area.
- Allow users to center property search on current GPS location and/or a pin dropped on the map.
- Allow users to set a configurable search radius around the selected location.
- Display properties within the radius that have roofs older than a configurable age threshold (default suggestion: 15 years).
- Display properties within the radius that have open roofing permits, with emphasis on permits that have remained open for an extended period.
- Show permit details in the UI, including permit status, age/open duration, contractor name, and BBB rating score when available.
- Present a browsable list of matching roofing lead candidates derived from the map/radius filters.
- Support creating and managing CRM lead records from identified properties and permits.
- Provide a RAG-backed agent that answers natural-language queries about roofing opportunities using available property and permit data.
- Keep data gathering, ingestion, and source-system integration out of scope; consume pre-existing/available datasets.
- Show (disabled) sections on the CRM that would expand the product beyond the initial lead-identification workflow.

## Demo Transcript
- Open the CRM centered on a particular county.
- Drop a pin (or use GPS) and set a search radius.
- Show roofs older than the age threshold (e.g., 15 years) within the radius.
- Highlight properties with open roofing permits, prioritizing long-open permits.
- Open a selected property/permit and review contractor details and BBB rating where available.
- Convert one or more matches into CRM lead records.
- Ask the RAG agent a natural-language query for roofing opportunities in the area and show relevant results.
- Demonstrate filtering leads by roof age, permit status/open duration, and location radius.
- Show disabled/placeholder sections for future CRM expansions beyond lead identification.

## Out of Scope
- Property, permit, ownership, or enrichment data collection and ingestion pipelines (separate story).
- Live BBB API integration beyond displaying scores already present in available data.
- Actual outbound messaging to property owners (can be mocked or deferred).

## Reference
- [Soofi XYZ Team Kit](https://github.com/soofi-xyz/soofi-xyz-team-kit)
- [Elephant Oracle Skills](https://github.com/elephant-xyz/skills)

## Candidate implementation

### Live

- Web (Cloudflare Pages): https://roofing-crm.pages.dev
- CRM API (Cloudflare Worker): https://roofing-crm-api.mikhalenia-a.workers.dev
- Pipeline API consumed for all property and permit data: https://scc-pipeline-api.mikhalenia-a.workers.dev. The UI shows the snapshot run and manifest CID of the data it is reading (Prospect page banner and property drawer).

### What was built

A map-based CRM for Santa Clara County. A user drops a pin or uses GPS, sets a radius and a roof-age threshold, and sees matching properties and open or expired-unfinaled roofing permits on a Leaflet map and in a sortable table. A property drawer shows permit details, contractor and BBB score where present, and data provenance. Properties can be saved as leads (status, notes, edit, delete) and the Leads page filters by status, roof age, permit state, open years and radius. A natural-language agent answers roofing-opportunity questions using tools that call the pipeline API, and cites its sources. Future CRM sections are shown as disabled navigation. No data is ingested or stored here beyond lead records.

### Architecture

- `apps/web`: React + MUI + Leaflet single-page app on Cloudflare Pages.
- `apps/api`: Hono Worker on Cloudflare Workers. Leads are stored in D1. The agent uses the Vercel AI SDK with Workers AI and Zod-typed tools that call the pipeline API.
- `libs/contracts`: Zod schemas and types shared by web and api.
- nx monorepo with pnpm; `apps/web-e2e` holds the Playwright demo-transcript test.

### Run locally

```sh
nvm use                      # Node 22
pnpm install
cp apps/web/.env.example apps/web/.env   # VITE_PIPELINE_API, VITE_CRM_API, VITE_USE_STUB
pnpm nx serve web            # http://localhost:4200
cd apps/api && pnpm exec wrangler dev   # CRM API on http://localhost:8787
pnpm check                   # lint + typecheck + test + build for all projects
```

Set `VITE_USE_STUB=true` to serve canned pipeline data without network access. The agent needs the Workers AI binding, so `wrangler dev` talks to Cloudflare for it. The e2e test runs against a deployed or locally previewed web app:

```sh
E2E_BASE_URL=https://roofing-crm.pages.dev pnpm nx e2e web-e2e
```

Without `E2E_BASE_URL` it starts `nx run web:preview` on port 4300.

### Deploy

```sh
pnpm nx migrate api          # wrangler d1 migrations apply roofing-crm --remote
pnpm nx deploy api           # wrangler deploy (apps/api)
pnpm nx build web            # set VITE_PIPELINE_API and VITE_CRM_API in the environment
pnpm exec wrangler pages deploy dist/apps/web --project-name roofing-crm
```

The Worker allows CORS from `ALLOWED_ORIGIN` (`https://roofing-crm.pages.dev`) plus `http://localhost:4200` and `http://localhost:4300`.

### Documents

- [Limitations](docs/limitations.md)
- [Acceptance criteria traceability](docs/acceptance-criteria.md)
- [Demo script](docs/demo-script.md)
- [PR description](docs/pr-description.md)
- [Design spec](docs/superpowers/specs/2026-10-07-roofing-crm-design.md) and [agent guide](CLAUDE.md)

### Deviation from the Golden Path

The Golden Path assumes AWS and CDK. This implementation uses Cloudflare (Pages, Workers, D1, Workers AI) instead, for two reasons: zero idle cost on the free tier, and the same stack as the sibling pipeline API, which is already a Cloudflare Worker. The Vercel AI SDK is used for every LLM call, as required.
