# Roofing CRM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A hosted map-based roofing lead CRM for Santa Clara County that reads the sibling pipeline's published snapshot through its API, lets a user find aged roofs and open roofing permits in a radius, save leads, and ask an LLM agent that answers only from retrieved records.

**Architecture:** `apps/web` (React + MUI + Leaflet on Cloudflare Pages) calls the pipeline Worker's REST API directly for all property/permit data and calls `apps/api` (Hono Worker) for leads (D1) and the agent (Vercel AI SDK + Workers AI with tools that call the same pipeline API). `libs/contracts` holds the Zod schemas both sides share.

**Tech Stack:** TypeScript 5, Node 22 (nvm), pnpm, nx 23, Vitest 5, Zod 4, React 19, MUI 9, react-router 7, Leaflet 1.9 + react-leaflet 5, Hono 4, `ai` 7 + `workers-ai-provider` 4, wrangler 4, `@cloudflare/vitest-pool-workers`, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-07-roofing-crm-design.md`

## Global Constraints

- Node `>=22.18`, pnpm, nx, TypeScript `strict`. English only. Conventional commits, no attribution trailers. Never push to origin unless told.
- Pipeline API base: `https://scc-pipeline-api.mikhalenia-a.workers.dev` (env `VITE_PIPELINE_API` in web, `PIPELINE_API` var in the Worker).
- Default map center San José `37.3382, -121.8863`, zoom 11; default radius 5 mi (0.5–25); default min roof age 15 (5–40).
- All LLM calls through `ai` (`generateText`) with `workers-ai-provider`; model `@cf/meta/llama-3.3-70b-instruct-fp8-fast`; tool schemas in Zod; `stopWhen: stepCountIs(6)`.
- No secrets in the browser. Worker uses the `AI` binding; no API keys.
- BBB rating is rendered as "not available (no public source)" wherever a contractor is shown.

## Review Focus

1. Saving the same APN twice must return 409 and the UI must show "Already a lead", never create a duplicate — pinned in Task 4 and Task 6.
2. A question with no pin context ("roofs older than 20 years near Cupertino") must resolve `geocode_place` first and still answer — pinned in Task 5.
3. The agent must not name a property that no tool returned; the response `sources` must be a subset of tool-returned APNs/permit numbers — pinned in Task 5 (post-filter test).
4. Pipeline API 5xx or network failure must render a banner and keep the last results, not crash the page — pinned in Task 3.
5. Radius 0.5 and 25 and roof age 5 and 40 (the bounds) must be accepted by both the UI controls and the Zod schemas — pinned in Task 2.

---

### Task 1: Workspace scaffold, CLAUDE.md, CI

**Files:** `.nvmrc`, `package.json`, `pnpm-workspace.yaml`, `nx.json`, `tsconfig.base.json`, `.gitignore`, `.prettierrc`, `eslint.config.mjs`, `CLAUDE.md`, `.github/workflows/ci.yml`, `README.md` (append pointer section)

- [ ] **Step 1:** Same scaffold as the pipeline repository Task 1 (copy `nx.json`, `tsconfig.base.json`, `eslint.config.mjs`, `.prettierrc`, `.gitignore` with `.wrangler/`, `dist/`, `.env`, `test-results/`, `playwright-report/`). Path aliases: `@crm/contracts` → `libs/contracts/src/index.ts`.
- [ ] **Step 2:** `pnpm nx g @nx/js:lib libs/contracts --bundler=none --unitTestRunner=vitest --linter=eslint --no-interactive`, `pnpm nx g @nx/react:app apps/web --bundler=vite --style=css --routing=true --unitTestRunner=vitest --e2eTestRunner=playwright --no-interactive` (creates `apps/web-e2e`), `pnpm nx g @nx/js:lib apps/api --bundler=none --unitTestRunner=vitest --linter=eslint --no-interactive`.
- [ ] **Step 3:** `CLAUDE.md`:

```markdown
# Roofing CRM — agent guide

- Spec: `docs/superpowers/specs/2026-10-07-roofing-crm-design.md`. Read it before changing behavior.
- Node 22 via nvm, pnpm, nx. `pnpm check` = lint + typecheck + test + build.
- `apps/web` React + MUI + Leaflet (Cloudflare Pages). `apps/api` Hono Worker: leads in D1, agent via Vercel AI SDK + Workers AI. `libs/contracts` Zod schemas shared by both.
- Property/permit data comes only from the pipeline API (`PIPELINE_API`). This repo never ingests or stores county data.
- TDD. Domain and contract logic gets unit tests; the Worker gets vitest-pool-workers tests; the demo transcript is a Playwright e2e.
- Conventional commits, English only, no attribution trailers. Never push to origin unless told.
- YAGNI: no auth, no multi-tenant, no feature flags.
```

- [ ] **Step 4:** `ci.yml` identical to the pipeline one plus a job `e2e` that runs `pnpm nx e2e web-e2e` with `E2E_BASE_URL` = the deployed Pages URL (skipped when the secret is empty).
- [ ] **Step 5:** `pnpm nx run-many -t lint typecheck test` green; commit `chore: scaffold nx workspace with web, api and contracts`.

---

### Task 2: Contracts (`libs/contracts`)

**Files:** `libs/contracts/src/{search.ts,lead.ts,agent.ts,pipeline.ts,index.ts}` and tests.

**Interfaces (Produces):**
- `SearchParams = z.object({ lat: z.coerce.number().min(36.9).max(37.5), lon: z.coerce.number().min(-122.3).max(-121.2), radiusMiles: z.coerce.number().min(0.5).max(25).default(5), minRoofAgeYears: z.coerce.number().int().min(5).max(40).default(15), permitState: z.enum(["open","expired_unfinaled","any"]).default("open"), minOpenYears: z.coerce.number().min(0).max(20).default(0), roofingOnly: z.coerce.boolean().default(true), limit: z.coerce.number().int().min(1).max(500).default(200) })`
- `PipelineLead` — Zod schema mirroring the pipeline `Lead` (apn, situsAddress, situsCity, lat, lon, roofAgeYears?, roofAgeAnchor?, roofAgeConfidence?, permitNumber?, permitState?, daysOpen?, issueDate?, contractorCompany?, cslbLicenseNumber?, cslbStatus?, bbbRating: null, ownerName?, distanceMiles, provenance{...}) — `.passthrough()` so new pipeline fields don't break the UI.
- `LeadStatus = z.enum(["new","contacted","qualified","lost"])`; `LeadRecord = { apn, status, notes, createdAt, updatedAt, snapshot: PipelineLead }`; `CreateLead = { apn, snapshot }`; `UpdateLead = { status?, notes? }`; `LeadFilter = SearchParams.partial().extend({ status: LeadStatus.optional() })`.
- `AgentRequest = { question: z.string().min(3).max(500), context: z.object({ lat, lon, radiusMiles }).nullable() }`; `AgentResponse = { answer: string, toolCalls: Array<{ name, args, resultCount }>, sources: Array<{ apn, permitNumber?: string, address?: string }>, resolvedFilters: SearchParams.partial().nullable() }`.

- [ ] **Step 1: Failing tests** — bounds accepted (0.5, 25, 5, 40), out-of-bounds rejected, defaults applied from `{lat, lon}`, `coerce` from query strings (`"true"`), `AgentRequest` rejects 2-char questions.
- [ ] **Step 2: Implement; run; commit** `feat(contracts): search, lead and agent schemas`.

---

### Task 3: Web app — map, filters, results, drawer

**Files:**
- `apps/web/src/api/pipeline.ts` (`fetchAgedRoofs`, `fetchOpenPermits`, `fetchProperty`, `fetchHealth` — thin fetch wrappers returning Zod-parsed data, throwing `PipelineError` with status)
- `apps/web/src/state/search.ts` (reducer: pin, radius, filters, results, loading, error, snapshot)
- `apps/web/src/components/{MapView.tsx,SearchControls.tsx,ResultsTable.tsx,PropertyDrawer.tsx,ProvenanceChip.tsx,SnapshotBanner.tsx,FutureNav.tsx}`
- `apps/web/src/pages/{ProspectPage.tsx,LeadsPage.tsx,AgentPage.tsx}`, `apps/web/src/App.tsx` (MUI `AppBar` + `Drawer` nav: Prospect, Leads, Agent, then disabled Campaigns, Outreach, Estimates & Quotes, Crew Scheduling, Reporting with tooltip)
- `apps/web/src/theme.ts`, `apps/web/index.html` (Leaflet CSS link), `apps/web/.env.example` (`VITE_PIPELINE_API`, `VITE_CRM_API`)
- Tests: `apps/web/src/state/search.test.ts`, `apps/web/src/components/ResultsTable.test.tsx`, `apps/web/src/api/pipeline.test.ts` (fetch mocked; 500 → `PipelineError`)

**Behavior:**
- `MapView`: `MapContainer` with OSM tiles; click → dispatch `setPin`; `Circle` for radius; `CircleMarker`s colored: red = aged roof ≥ threshold, orange = open roofing permit, grey = expired unfinaled, blue = other; "Use my location" uses `navigator.geolocation` with denied → notice.
- `SearchControls`: radius slider 0.5–25 step 0.5; roof-age slider 5–40; permit state toggle group; min open years slider 0–20; roofing only switch; "Search" runs **both** `aged-roofs` and `open-permits` queries and merges by APN (a property can be in both), storing `signals: Set<"aged_roof"|"open_permit"|"stalled_permit">` per row.
- `ResultsTable` (MUI `DataGrid`-free: plain `Table` with sortable headers): columns Address, City, Roof age (chip with anchor tooltip), Permit, State, Days open, Contractor, CSLB, BBB ("not available"), Owner, Distance; default sort days open desc; row click opens the drawer.
- `PropertyDrawer`: calls `fetchProperty(apn)`; sections Property, Roof age basis, Permits (all), Contractor (CSLB status), Owners (observations), Provenance (source url, version, fetched_at, manifest CID); "Save as lead" button (Task 6 wires it).
- `SnapshotBanner`: `/api/health` → "Snapshot run `<runId>` · manifest `<cid>` · API `<base>`"; on failure shows an error banner and keeps last results (Review Focus 4 — test in `search.test.ts`: `searchFailed` keeps `results`).

- [ ] **Step 1: Failing tests** for the reducer (setPin, setRadius, searchSucceeded merges aged+open by APN with both signals, searchFailed keeps results and sets error), `ResultsTable` renders 2 rows sorted by days open, `pipeline.ts` 500 → PipelineError.
- [ ] **Step 2: Implement** components and pages; `pnpm nx serve web` manual check with the live pipeline API.
- [ ] **Step 3: Tests, lint, typecheck, build green; commit** `feat(web): map workspace with radius search, filters, results and property drawer`.

---

### Task 4: API Worker — leads in D1

**Files:** `apps/api/wrangler.jsonc` (name `roofing-crm-api`, `d1_databases: [{ binding: "DB", database_name: "roofing-crm" }]`, `ai: { binding: "AI" }`, `vars: { PIPELINE_API, ALLOWED_ORIGIN }`), `apps/api/migrations/0001_leads.sql`, `apps/api/src/{index.ts,leads.ts,rate-limit.ts}`, tests `apps/api/src/leads.test.ts` (workers pool).

**Schema:** `leads(apn TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'new', notes TEXT NOT NULL DEFAULT '', snapshot TEXT NOT NULL, lat REAL, lon REAL, roof_age_years INTEGER, permit_state TEXT, days_open INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`; `rate_limits(ip TEXT, minute TEXT, count INTEGER, PRIMARY KEY (ip, minute))`.

**Routes:** per spec §5. `GET /leads` applies `LeadFilter`: status, `minRoofAgeYears`, `permitState`, `minOpenYears`, and radius via bounding box + haversine in JS (reuse the formula; no shared lib with the pipeline repo — copy the 10-line function into `apps/api/src/geo.ts` and `apps/web/src/geo.ts`, YAGNI over a cross-repo package). Writes limited to 60 per IP per minute (429).

- [ ] **Step 1: Failing tests** — create → 201; create same APN → 409; list filters by status and min roof age; patch status → 200 and `updatedAt` changes; delete → 204 then 404; 61st write in a minute → 429.
- [ ] **Step 2: Implement; run tests; commit** `feat(api): leads crud on d1 with per-ip write limit`.

---

### Task 5: API Worker — agent (Vercel AI SDK + Workers AI)

**Files:** `apps/api/src/agent/{index.ts,tools.ts,prompt.ts,places.ts,postfilter.ts}`, tests `apps/api/src/agent/{postfilter.test.ts,places.test.ts,agent.test.ts}`.

**Interfaces:**
- `places.ts`: `PLACES: Record<string, { lat: number; lon: number }>` for the 15 cities + county seat (San José, Santa Clara, Sunnyvale, Mountain View, Palo Alto, Cupertino, Milpitas, Campbell, Los Gatos, Saratoga, Los Altos, Los Altos Hills, Morgan Hill, Gilroy, Monte Sereno) ; `geocodePlace(name: string): { place: string; lat; lon } | null` (case-insensitive, strips "CA", accepts "downtown San Jose").
- `tools.ts`: `buildTools(pipelineApi: string, fetcher: typeof fetch, leadStore: { create(input: CreateLead): Promise<"created" | "exists"> })` returning `{ geocode_place, search_properties_in_radius, find_aged_roofs, find_open_roofing_permits, get_property, create_lead }` built with `tool({ description, inputSchema: z.object(...), execute })` from `ai`. Each execute calls the pipeline REST endpoint and returns `{ count, items: trimmed[] }` where trimmed keeps apn, address, city, roofAgeYears, roofAgeAnchor, permitNumber, permitState, daysOpen, contractorCompany, cslbLicenseNumber, ownerName, distanceMiles, provenance.permitSourceUrl — max 25 items per call to keep context small.
- `prompt.ts`: `SYSTEM_PROMPT` — role (roofing lead analyst for Santa Clara County), rules: always call a tool before answering; name only returned records; state the threshold used and any default assumed; mention missing data honestly (no year built, BBB not available, San José permits only); finish with a line `SOURCES: <apn or permit list>`; keep answers under 200 words.
- `postfilter.ts`: `extractSources(answer: string, toolResults: Array<{ apn: string; permitNumber?: string; address?: string }>): AgentResponse["sources"]` — intersection of identifiers mentioned in the answer with tool results; `resolvedFiltersFromCalls(toolCalls): SearchParams partial | null` — from the last spatial tool call's args.
- `index.ts`: `runAgent(env, req: AgentRequest): Promise<AgentResponse>`:

```ts
import { createWorkersAI } from "workers-ai-provider";
import { generateText, stepCountIs } from "ai";
const workersai = createWorkersAI({ binding: env.AI });
const result = await generateText({
  model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
  system: SYSTEM_PROMPT + (req.context ? `\nCurrent map context: lat ${req.context.lat}, lon ${req.context.lon}, radius ${req.context.radiusMiles} miles.` : "\nNo map context; call geocode_place when the question names a place."),
  prompt: req.question,
  tools,
  stopWhen: stepCountIs(6),
});
```

Then collect `result.steps[].toolCalls/toolResults`, build `toolCalls`, `sources`, `resolvedFilters`. If the model produced no tool call, re-run once with `toolChoice: "required"`.

- [ ] **Step 1: Failing tests** — `geocodePlace("near Cupertino, CA")` → Cupertino coords; `extractSources` keeps only mentioned+returned identifiers; `agent.test.ts` with a stubbed `generateText` (inject via parameter `deps.generateText`) asserting the response shape and that `create_lead` is wired to the lead store; a workers-pool test of `POST /agent` with the stub.
- [ ] **Step 2: Implement; deploy to a preview (`wrangler deploy`), run one real question with curl and keep the output in `docs/agent-sample.md`.** If tool calling is unreliable with llama-3.3-70b on Workers AI, switch the model constant to `@cf/openai/gpt-oss-20b` (same provider) and re-test; record the choice in the spec's "Decisions" footnote.
- [ ] **Step 3: Commit** `feat(api): rag agent over pipeline tools with vercel ai sdk and workers ai`.

---

### Task 6: Web — leads page and agent page

**Files:** `apps/web/src/api/crm.ts` (`listLeads`, `createLead`, `updateLead`, `deleteLead`, `askAgent`), `apps/web/src/pages/LeadsPage.tsx`, `apps/web/src/pages/AgentPage.tsx`, `apps/web/src/components/{LeadFilters.tsx,LeadRow.tsx,AgentPanel.tsx}`; tests `apps/web/src/pages/LeadsPage.test.tsx`, `apps/web/src/components/AgentPanel.test.tsx`.

- **Drawer wiring:** "Save as lead" → `createLead({ apn, snapshot })`; 409 → button becomes disabled "Already a lead".
- **LeadsPage:** table with status select, notes (inline edit, debounced PATCH), delete; `LeadFilters`: status, min roof age, permit state, min open years, "within current radius" (uses the pin/radius from search state; disabled when no pin).
- **AgentPanel:** text field + 3 example chips ("Which properties within 5 miles of San José have roofs older than 15 years?", "Open roofing permits open for more than 3 years near Sunnyvale, who is the contractor?", "Save the three oldest roofs near Cupertino as leads"); shows tool-call list, answer (markdown-light), sources as chips linking to the drawer; "Apply to map" applies `resolvedFilters` to the search state and navigates to Prospect.
- [ ] **Step 1: Failing tests** — LeadsPage renders leads and filters by status; AgentPanel renders answer, tool calls and sources from a mocked `askAgent`; 409 path flips the button.
- [ ] **Step 2: Implement; build; commit** `feat(web): leads management and agent panel`.

---

### Task 7: Playwright demo transcript e2e + deploy

**Files:** `apps/web-e2e/src/demo-transcript.spec.ts`, `apps/web-e2e/playwright.config.ts` (`baseURL` from `E2E_BASE_URL`, default `http://localhost:4300`), `docs/demo-script.md`.

Steps in the spec, each with an assertion and a screenshot in `apps/web-e2e/screenshots/`: open → title contains "Santa Clara"; click map → pin set; set radius 5; set roof age 15; search → results count > 0 and a red marker exists; sort by days open; open first open-permit row → drawer shows contractor and "BBB rating: not available"; save as lead → toast; Leads page shows it; ask agent the first example chip → answer non-empty and ≥1 source; disabled nav items have `aria-disabled="true"`.

- [ ] **Step 1:** Write the spec; run against `pnpm nx serve web` with the live APIs; fix failures.
- [ ] **Step 2: Deploy** — `cd apps/api && npx wrangler d1 create roofing-crm && npx wrangler d1 migrations apply roofing-crm --remote && npx wrangler deploy`; `pnpm nx build web` with `VITE_PIPELINE_API` and `VITE_CRM_API`; `npx wrangler pages project create roofing-crm && npx wrangler pages deploy apps/web/dist --project-name roofing-crm`. Re-run the e2e with `E2E_BASE_URL=<pages url>`.
- [ ] **Step 3:** `docs/demo-script.md` = the e2e steps as a narrated script with timings for the video.
- [ ] **Step 4: Commit** `test(e2e): demo transcript against the deployed runtime`.

---

### Task 8: Limitations, acceptance traceability, self-assessment, PR text, YAGNI pass

- [ ] `docs/limitations.md` (what the dataset cannot answer; San José-only permits; no BBB; no year built; owner from permits only).
- [ ] `docs/acceptance-criteria.md`: every README criterion and demo-transcript step → met / partial / gap with evidence.
- [ ] `docs/slowking-self-assessment.md`: Slowking procedure against the deployed runtime.
- [ ] YAGNI pass: remove unused code and options; `pnpm check` green.
- [ ] `docs/pr-description.md`: live URL, demo video placeholder, 2-minute review path, data provenance (pipeline API + manifest CID), limitations, Golden Path deviation note.
- [ ] Commit `docs: limitations, acceptance traceability, self-assessment and pr description`.
