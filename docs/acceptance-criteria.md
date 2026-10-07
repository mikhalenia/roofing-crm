# Acceptance criteria traceability

Statuses: **met** (implemented and evidenced), **partial** (implemented but with a stated gap or
evidence still pending), **gap** (not implemented).

"Deployed" evidence is the Playwright run of `apps/web-e2e/src/demo-transcript.spec.ts` against
https://roofing-crm.pages.dev with writes enabled (2026-10-07, account on Workers Paid), saved as
`apps/web-e2e/screenshots/*.png`: 01 open, 02 pin (auto-search), 03 radius/age, 04 results, 05 sorted,
06 drawer, 07 marker popup, 08 ask agent from the popup, 09 save as lead from the popup, 10 leads page
(status change via PATCH, then delete via the UI), 11 agent page, 12 disabled nav. The run deletes the
lead it created, so production keeps no demo lead.

Paths: `W` = `apps/web/src`, `A` = `apps/api/src`, `C` = `libs/contracts/src`, `E` = `apps/web-e2e`.

## README acceptance criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Default map/search to a county, explore the selected area | partial | Centered on San José, zoom 11 (`W/state/search.ts:38`, `W/components/MapView.tsx:37`); pin limited to a county bounding box, error otherwise (`C/search.ts:16-17`, `W/pages/ProspectPage.tsx:28-36`, test "an out-of-bounds pin skips the search"). `E/screenshots/01-open.png`. Gap: a rectangle, not the county boundary, and permit data covers San José only (`docs/limitations.md`). |
| 2 | Center search on GPS and/or a dropped pin | met | Pin: `W/components/MapView.tsx:16-21`; e2e step "02 drop pin", `E/screenshots/02-pin.png`. GPS: `W/components/SearchControls.tsx:26-36` with denied-permission notice. GPS has no automated test and no deployed run. |
| 3 | Configurable search radius | met | Slider 0.5-25 mi (`SearchControls.tsx:49-58`), circle (`MapView.tsx:47`); e2e "03 radius and roof age", `03-radius-age.png`; tests `toSearchParams` "maps state to query params". |
| 4 | Properties with roofs older than a configurable age (default 15) | met | Slider 5-40, default 15 (`SearchControls.tsx:59-69`); aged-roofs endpoint (`W/api/pipeline.ts`); aged-roof markers (`W/components/mapStyle.ts`, tests in `mapStyle.test.ts`); e2e "04 results", `04-results.png`. Roof age exists only where a roofing permit does (limitations). |
| 5 | Open roofing permits, emphasis on long-open | met | Orange = open, grey = stalled (`W/state/search.ts:146-147`); default sort days open descending (`W/components/ResultsTable.tsx:46-49`, test "renders rows sorted by days open desc by default"); permit state and min open years filters (`SearchControls.tsx:70-94`); e2e "05 sort by days open", `05-sorted.png`. Most are `expired_unfinaled`, labeled stalled. |
| 6 | Permit details: status, open duration, contractor, BBB when available | partial | Drawer shows permit state, dates, days open, contractor, CSLB, owner, provenance (`W/components/PropertyDrawer.tsx:181-219`); e2e "06 open property drawer", `06-drawer.png`. BBB is only ever "not available (no public source)" and CSLB is mostly empty (`CSLB - (-)` in the screenshot). |
| 7 | Browsable list of matching lead candidates | met | `W/components/ResultsTable.tsx` (sortable, row opens drawer, keyboard accessible; tests in `ResultsTable.test.tsx`); `04-results.png`, `05-sorted.png`. |
| 8 | Create and manage CRM leads | met | Save from the marker popup or the drawer header (`W/components/MarkerPopup.tsx`, `W/components/useLeadSave.ts`, `PropertyDrawer.tsx`). CRUD + filters: `A/leads.ts`; worker tests in `A/leads.test.ts` ("creates a lead", "returns 409 for a duplicate apn", "patches status", "deletes", filters, "limits writes to 60 per ip per minute"); UI `W/pages/LeadsPage.tsx` with a notes editor (`W/components/LeadEditor.tsx`), tests in `LeadsPage.test.tsx`, `MarkerPopup.test.tsx`, `PropertyDrawer.test.tsx`. Deployed: e2e "09 save as lead from the popup" (201, "Saved as lead"), "10 leads page" (PATCH status to Contacted, DELETE via the UI); `09-saved.png`, `10-leads.png`. |
| 9 | RAG-backed agent answering NL queries from property and permit data | met | `POST /agent` (`A/index.ts:23-39`): Vercel AI SDK `generateText`, Zod tools that retrieve live pipeline records (`A/agent/tools.ts`), prompt requiring tool use and grounding (`A/agent/prompt.ts`), citations rebuilt from returned records (`A/agent/postfilter.ts:19`). Optional selected-property context (`C/agent.ts` `context.apn`/`address`) makes the agent look the property up first. Deployed run: e2e "08 ask agent from the popup" (`08-ask-agent.png`, get_property for the selected APN) and "11 agent page" (`11-agent.png`, search with source chips). Caveats: retrieval is tool calls not a vector index; thin prose; the sources-only repair (6c1e8f9) is unit-tested but not yet verified live (`docs/limitations.md`). `docs/agent-sample.md` is a preview run with the pipeline unavailable and is not evidence of retrieval. |
| 10 | Data gathering/ingestion/integration out of scope | met | No ingestion code; data via `PIPELINE_API` (`apps/api/wrangler.jsonc`) and `W/api/pipeline.ts`; `CLAUDE.md`. |
| 11 | Disabled sections beyond lead identification | met | `W/components/FutureNav.tsx` (5 `aria-disabled` items with tooltip); test "renders the five future items as aria-disabled"; e2e "12 disabled nav", `12-disabled-nav.png`. |

## README demo transcript

| # | Step | Status | Evidence |
|---|---|---|---|
| 1 | Open the CRM centered on a county | met | e2e "01 open", `01-open.png`; the data status chip shows the snapshot date, with run id and manifest CID under "About this data" > "Technical details" (`W/components/DataStatus.tsx`, `DataStatus.test.tsx`). |
| 2 | Drop a pin (or GPS) and set a radius | met | e2e "02 drop pin", "03 radius and roof age", `02-pin.png`, `03-radius-age.png`. GPS path is code-only. |
| 3 | Show roofs older than the threshold within the radius | met | Auto-search (`W/pages/useProspectSearch.ts`, tests "a setPin leads to exactly one search after the debounce" and "a radius change … coalesces"); e2e "04 results" asserts rows, an aged-roof marker (`path.result-marker--aged_roof`), the legend and a hover tooltip; `04-results.png`. |
| 4 | Highlight open permits, prioritize long-open | met | e2e "05 sort by days open" asserts `aria-sort="descending"`; `05-sorted.png`. |
| 5 | Open a property/permit, review contractor and BBB where available | partial | e2e "06 open property drawer", `06-drawer.png`. BBB is "not available (no public source)"; CSLB mostly unmatched. |
| 6 | Convert matches to CRM leads | met | Save as lead from the marker popup (`W/components/MarkerPopup.tsx`, shared logic `W/components/useLeadSave.ts`; tests in `MarkerPopup.test.tsx`: 201 toast, 409 and existing lead as "Already a lead", no coordinates refused) and from the drawer header (`PropertyDrawer.test.tsx`). Deployed: e2e "09 save as lead from the popup", `09-saved.png`; the lead appears on the Leads page with "On map", e2e "10 leads page", `10-leads.png`. |
| 7 | Ask the agent, show relevant results | met | Agent panel next to the map (`W/pages/ProspectPage.tsx`, state in `W/state/AgentContext.tsx`). "Ask agent" in a marker popup prefills a question and sends the selected APN as context; the Worker adds "Selected property: APN …" and asks for `get_property` first (`A/agent/index.ts` `contextLine`, test "adds the selected property to the system prompt"). Matching source chips are highlighted, and clicking a chip flies the map to the property and opens its popup (`W/components/MapView.tsx` `FocusOn`, `MapView.test.tsx`). Answers hide the raw SOURCES line, use friendly state names (`W/labels.ts` `displayAnswer`, `A/agent/index.ts` `plainStates`) and show "Sources · N of at least M" with chips and humanized tool calls (`W/components/AgentAnswer.tsx`). Deployed: e2e "08 ask agent from the popup" (tool call "Looked up a property"), `08-ask-agent.png`; e2e "11 agent page", `11-agent.png`. |
| 8 | Filter leads by roof age, permit status/open duration, radius | partial | Lead filters in `W/components/LeadFilters.tsx` and `A/leads.ts:79`; worker tests "filters by status and minRoofAgeYears", "filters by permitState and minOpenYears", "radius filter includes 1 mile and excludes 20 miles"; `LeadsPage.test.tsx`. The radius filter is labeled with the Prospect pin it uses. The e2e spec does not exercise the filters (step 10 shows, edits and deletes the saved lead), so filters have unit and worker tests only. |
| 9 | Show disabled/placeholder sections | met | Grouped under "Coming later" (`W/components/FutureNav.tsx`); e2e "12 disabled nav", `12-disabled-nav.png`. |

## Totals

- README acceptance criteria: 11 total, 9 met, 2 partial, 0 gap.
- Demo transcript steps: 9 total, 7 met, 2 partial, 0 gap.
- Overall: 20 items, 16 met, 4 partial, 0 gap.
- Partial for data limits: AC 1, AC 6, step 5. Partial for test coverage: step 8 (lead filters not in the e2e).
