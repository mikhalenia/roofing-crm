# Acceptance criteria traceability

Statuses: **met** (implemented and evidenced), **partial** (implemented but with a stated gap or
evidence still pending), **gap** (not implemented).

"Deployed" evidence is the Playwright run of `apps/web-e2e/src/demo-transcript.spec.ts` against
https://roofing-crm.pages.dev with writes enabled (2026-10-07), saved as
`apps/web-e2e/screenshots/*.png`: 01 open, 02 pin (auto-search), 03 radius/age, 04 results, 05 sorted,
06 drawer, 07 marker popup, 08 ask agent from the popup, 09 save as lead from the popup, 10 leads page
(status change via PATCH, then delete via the UI), 11 agent page, 12 disabled nav. The run deletes the
lead it created, so production keeps no demo lead.

Paths: `W` = `apps/web/src`, `A` = `apps/api/src`, `C` = `libs/contracts/src`, `E` = `apps/web-e2e`.
References name files and symbols, not line numbers. Screenshots are in `E/screenshots/`.

## README acceptance criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Default map/search to a county, explore the selected area | partial | Centered on San José at zoom 11 (`W/state/search.ts` `initialState.pin`, `W/components/MapView.tsx` `MapContainer`); the pin must lie in the county bounding box (`C/search.ts` `fields.lat`/`fields.lon`), otherwise the search is refused with a message (`W/pages/useProspectSearch.ts` `useProspectSearch`, test "an out-of-bounds pin skips the search, shows the error and keeps rows"). e2e "01 open", `01-open.png`. Gap: a rectangle, not the county boundary, and permit data covers San José only (`docs/limitations.md`). |
| 2 | Center search on GPS and/or a dropped pin | met | Click to place (`W/components/MapView.tsx` `ClickToPin`) or drag the pin (`SearchPin`, test "dragging the pin moves the search center"); each change searches automatically. e2e "02 drop pin: results refresh without pressing Search", `02-pin.png`. GPS: `W/components/SearchControls.tsx` `useMyLocation` with a denied-permission notice; no automated test and no deployed run. |
| 3 | Configurable search radius | met | Radius slider 0.5-25 mi (`W/components/SearchControls.tsx`, test "labels each control in sentence case with its value on the label row"), radius circle (`MapView.tsx` `Circle` with class `search-radius`) and the "N-mile radius" chip (`W/components/MapCard.tsx`); `toSearchParams` test "maps state to query params for both endpoints". e2e "03 radius and roof age", `03-radius-age.png`. |
| 4 | Properties with roofs older than a configurable age (default 15) | met | Min roof age slider 5-40, default 15 (`SearchControls.tsx`, `initialState.filters`); aged-roofs endpoint (`W/api/pipeline.ts` `fetchAgedRoofs`); aged-roof markers (`W/components/mapStyle.ts` `markerStyle`, `mapStyle.test.ts`). e2e "04 results, legend and hover", `04-results.png`. Roof age exists only where a roofing permit does (`docs/limitations.md`). |
| 5 | Open roofing permits, emphasis on long-open | met | Marker colors per signal: amber open permit, slate stalled permit (`mapStyle.ts` `SIGNAL_STYLE`, legend `W/components/MapLegend.tsx`); the table sorts by "Open for" descending by default (`W/components/ResultsTable.tsx`, test "renders rows sorted by days open desc by default"); permit state and min open years filters (`SearchControls.tsx`, `W/components/SegmentedControl.tsx`). e2e "05 sort by days open", `05-sorted.png`. Most long-open permits expired without a final inspection: "Stalled", or "Expired (work approved)" when all approvals were completed (`C/labels.ts` `permitStateShort`). |
| 6 | Permit details: status, open duration, contractor, BBB when available | partial | The drawer shows permit state, issue and completion dates, time open, contractor, CSLB, owners and provenance (`W/components/PropertyDrawer.tsx`, `PropertyDrawer.test.tsx`). e2e "06 open property drawer", `06-drawer.png`. BBB is only ever "not available (no public source)", and CSLB is mostly "CSLB license: not matched". |
| 7 | Browsable list of matching lead candidates | met | `W/components/ResultsTable.tsx` (sortable, a row opens the drawer, keyboard accessible, hover highlights its marker; `ResultsTable.test.tsx`) and the map markers with popups (`W/components/MarkerPopup.tsx`). `04-results.png`, `05-sorted.png`, `07-popup.png`. |
| 8 | Create and manage CRM leads | met | Save from the marker popup or the drawer header (`MarkerPopup.tsx`, `W/components/useLeadSave.ts`, `PropertyDrawer.tsx`). CRUD and filters: `A/leads.ts` (`leads.get`, `leads.post`, `leads.patch`, `leads.delete`); worker tests in `A/leads.test.ts` ("creates a lead", "returns 409 for a duplicate apn", "patches status", "deletes", filters, "limits writes to 60 per ip per minute"). UI `W/pages/LeadsPage.tsx` with the notes editor `W/components/LeadEditor.tsx`; tests in `LeadsPage.test.tsx`, `MarkerPopup.test.tsx`, `PropertyDrawer.test.tsx`. Deployed: e2e "09 save as lead from the popup" (201, "Saved as lead") and "10 leads page" (PATCH status to Contacted, DELETE through the UI); `09-saved.png`, `10-leads.png`. |
| 9 | RAG-backed agent answering NL queries from property and permit data | met | `POST /agent` (`A/index.ts`, route `app.post("/agent")`, `A/agent/index.ts` `runAgent`): Vercel AI SDK `generateText` with Zod tools that retrieve live pipeline records (`A/agent/tools.ts` `buildTools`); the prompt requires tool use and grounding (`A/agent/prompt.ts` `SYSTEM_PROMPT`); citations are rebuilt from returned records (`A/agent/postfilter.ts` `extractSources`). Invalid coordinates return a readable tool error (`tools.ts` `invalidArea`), out-of-scope questions get one sentence without tools (`OUT_OF_SCOPE`), and the answer is checked against the tool results in code (`A/agent/grounding.ts`: `fixCounts`, `groundStalled`, `nearPlace`, `ensureSources`). An optional selected-property context (`C/agent.ts` `context.apn`/`address`) makes the agent look the property up first. Deployed: e2e "08 ask agent from the popup" (`08-ask-agent.png`) and "11 agent page" (`11-agent.png`). Caveats: retrieval is tool calls, not a vector index; thin prose (`docs/limitations.md`). `docs/agent-sample.md` is a preview run with the pipeline unavailable and is not evidence of retrieval. |
| 10 | Data gathering/ingestion/integration out of scope | met | No ingestion code; data comes through `PIPELINE_API` (`apps/api/wrangler.jsonc`) and `W/api/pipeline.ts`; `CLAUDE.md`. |
| 11 | Disabled sections beyond lead identification | met | `W/components/FutureNav.tsx` (5 `aria-disabled` items with a tooltip, under "Coming later"); tests "renders the five future items as aria-disabled" and "groups them under a Coming later subheader". e2e "12 disabled nav", `12-disabled-nav.png`. |

## README demo transcript

Each step is checked by the e2e spec `apps/web-e2e/src/demo-transcript.spec.ts` on https://roofing-crm.pages.dev.

| # | Step | Status | Evidence |
|---|---|---|---|
| 1 | Open the CRM centered on a county | met | e2e "01 open", `01-open.png`. The data status chip in the top bar shows the snapshot date; run id and manifest CID are under "About this data" > "Technical details" (`W/components/DataStatus.tsx`, `DataStatus.test.tsx`). |
| 2 | Drop a pin (or GPS) and set a radius | met | e2e "02 drop pin: results refresh without pressing Search" and "03 radius and roof age", `02-pin.png`, `03-radius-age.png`. GPS is code-only. |
| 3 | Show roofs older than the threshold within the radius | met | Auto-search (`W/pages/useProspectSearch.ts`; tests "a setPin leads to exactly one search after the debounce" and "a radius change within the debounce window coalesces into one search"). e2e "04 results, legend and hover" asserts rows, an aged-roof marker (`path.result-marker--aged_roof`), the legend, the status line and a hover card; `04-results.png`. |
| 4 | Highlight open permits, prioritize long-open | met | e2e "05 sort by days open" asserts `aria-sort="descending"` on "Open for"; `05-sorted.png`. |
| 5 | Open a property/permit, review contractor and BBB where available | partial | e2e "06 open property drawer", `06-drawer.png`. BBB is "not available (no public source)"; CSLB is mostly not matched. |
| 6 | Convert matches to CRM leads | met | Save as lead from the marker popup (`W/components/MarkerPopup.tsx`, `W/components/useLeadSave.ts`; `MarkerPopup.test.tsx`: 201 toast, 409 and an existing lead show "Already a lead", no coordinates refused) or the drawer header (`PropertyDrawer.test.tsx`). e2e "07 marker popup" and "09 save as lead from the popup", `07-popup.png`, `09-saved.png`; the lead appears on the Leads page with "On map", e2e "10 leads page", `10-leads.png`. |
| 7 | Ask the agent, show relevant results | met | Agent panel next to the map (`W/pages/ProspectPage.tsx`, state `W/state/AgentContext.tsx` `AgentProvider`). "Ask agent" in a marker popup prefills a question and sends the APN as context; the Worker adds "Selected property: APN …" and asks for `get_property` first (`A/agent/index.ts` `contextLine`). Source chips matching the APN are highlighted; a chip flies the map to the property and opens its popup (`W/components/MapView.tsx` `FocusOn`). The answer hides the SOURCES line and raw tokens (`W/labels.ts` `displayAnswer`, `C/labels.ts` `replaceRawTokens`) and shows "Sources · N of …", chips and humanized tool calls (`W/components/AgentAnswer.tsx`). e2e "08 ask agent from the popup" (tool call "Looked up a property") and "11 agent page", `08-ask-agent.png`, `11-agent.png`. |
| 8 | Filter leads by roof age, permit status/open duration, radius | partial | `W/components/LeadFilters.tsx` (`toLeadFilter`, `radiusLabel`) and `A/leads.ts` `leads.get` (the Stalled filter excludes work-approved permits); worker tests "filters by status and minRoofAgeYears", "filters by permitState and minOpenYears", "the stalled filter excludes expired permits whose work was approved", "radius filter includes 1 mile and excludes 20 miles"; `LeadsPage.test.tsx`. The e2e does not exercise the filters (step 10 shows, edits and deletes the saved lead). |
| 9 | Show disabled/placeholder sections | met | "Coming later" group (`W/components/FutureNav.tsx`); e2e "12 disabled nav", `12-disabled-nav.png`. |

## Totals

- README acceptance criteria: 11 total, 9 met, 2 partial, 0 gap.
- Demo transcript steps: 9 total, 7 met, 2 partial, 0 gap.
- Overall: 20 items, 16 met, 4 partial, 0 gap.
- Partial for data limits: AC 1, AC 6, step 5. Partial for test coverage: step 8 (lead filters not in the e2e).
