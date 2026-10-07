# Limitations

What the Roofing CRM cannot answer, why, and what happens at the edges. The app reads the live
snapshot reported by `/health` on https://scc-pipeline-api.mikhalenia-a.workers.dev (run
2026-10-07T18-31-50Z at the time of writing); the counts below were measured on run
2026-10-07T17-10-54Z. This repository does not ingest or store county data.

## Dataset

- **Permits cover the City of San José only.** The snapshot has 494,841 properties county-wide but
  only 93,093 San José permits, of which 7,751 are roofing. A pin in Gilroy or Palo Alto returns
  properties without permit signals. The map defaults to Santa Clara County and the pin is limited to
  a rectangle around it (`libs/contracts/src/search.ts:16-17`), not the county boundary.
- **No BBB data.** There is no public BBB source in the snapshot, so BBB is always rendered as
  "not available (no public source)" (`PropertyDrawer.tsx:194`, `ResultsTable.tsx:136`) and
  the contract rejects any non-null rating (`bbbRating: z.null()`). The README's "BBB rating where
  available" is therefore met only as an honest "not available".
- **No year built, so roof age exists only where a completed roofing permit exists.** Roof age is
  derived from the last roofing permit (anchor: final inspection date or approval-complete issue date;
  confidence high or medium). Parcels whose roof was never permitted have no age and cannot appear as
  aged roofs, even if the roof is old. Parcels with roof age 15 years or more: 2,021, of which 962 are
  within 5 miles of downtown San José.
- **"Open for many years" is mostly "stalled".** Of the 7,751 roofing permits, 6,707 are
  `expired_unfinaled` (expired without a final inspection), 1,017 are `open` and 27 are `finaled`. A
  long "days open" figure usually means the permit was never finaled, not that work is in progress.
  The UI and agent label them "Stalled", or "Expired (work approved)" when every approval was
  completed (the pipeline's stalled filter excludes those, so most aged-roof rows show this label),
  and never call them active.
- **Owner names come from permits only.** There is no mailing address, no ownership transfer date and
  no assessor owner of record. The "Owners" section shows who appeared on a permit and the date observed.
- **CSLB licenses are not matched.** Contractor names come from permits; the license number and status
  columns are mostly empty (the drawer shows "CSLB license: not matched").
- **Search results are capped at 200 per endpoint** (`limit: 200` in `apps/web/src/state/search.ts`,
  same default for the agent). A count of "200" means "at least 200", not a total. The results table
  then says "Showing N of at least N", and the agent tools report `fetched`/`capped` so the answer says
  "at least N matched".

## Product

- **No authentication and no multi-user model.** Leads are shared by everyone who has the URL.
  Anyone can edit or delete any lead. CORS is an allowlist: `ALLOWED_ORIGIN`
  (`https://roofing-crm.pages.dev` in `apps/api/wrangler.jsonc`) plus the local dev origins
  `http://localhost:4200` and `http://localhost:4300` (`apps/api/src/index.ts`). CORS does not stop
  non-browser clients. Because of the allowlist, the e2e run must use the production origin
  (`E2E_BASE_URL=https://roofing-crm.pages.dev`); a Pages preview URL fails CORS on `/leads` and `/agent`.
- **Rate limit: 60 write requests per minute per IP**, counted in D1, applied to `POST/PATCH/DELETE
  /leads` and to `POST /agent` (`apps/api/src/rate-limit.ts`). The 61st returns 429. The limiter fails
  open if D1 is unavailable, so an outage never blocks the API but also removes the limit.
- **Agent place lookup is a static table** of the 15 county cities (`apps/api/src/agent/places.ts`).
  A street address or neighbourhood is not geocoded; use the map pin instead.
- No outbound messaging, campaigns, quotes, scheduling or reporting: those nav items are disabled.

## Free-tier limits and what happens when they are exceeded

| Resource | Limit | When exceeded |
|---|---|---|
| Workers AI | 10,000 neurons per day | Model calls fail; `POST /agent` returns 502 with the error text and the Agent page shows it. The map, search, drawer and leads keep working. |
| D1 writes | 100,000 rows written per day | Lead create, edit, delete and rate-limit counters fail. Prospect search and the property drawer (pipeline API) are unaffected. |

The account moved to Workers Paid on 2026-10-07, after the D1 free-tier daily limits were hit during
testing (writes, then pipeline reads). The free-tier figures above stay as the design limits: the app
must keep working within them.

## Agent honesty rules and quality caveats

Rules enforced in `apps/api/src/agent/prompt.ts` and `postfilter.ts`:

- It must call a tool before answering and may name only APNs and permit numbers that a tool returned
  in that conversation. The `sources` array is rebuilt in code (`extractSources`): an identifier the
  model invented is dropped, even if the prose mentions it. `create_lead` accepts only records the
  model was shown (the first 25 of each result).
- It states thresholds and assumed defaults, the state of every permit it names, and the missing data
  above. Tool failures are reported in the UI with the error text and `resultCount: 0`.

Known caveats:

- **Thin prose.** Llama 3.3 70B (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) tends to write two or
  three sentences plus a `SOURCES:` line, repeating the identifiers the UI already shows as chips. It
  can report the fetch cap as the total ("200 properties") despite the prompt rule about "N matched;
  showing the first 25"; the UI header ("Sources · N of at least M") states the real numbers, and
  "at least" is removed in code when no search was capped.
- **Sources-only answers.** The agent returned a `SOURCES:`-only answer once in production. A repair step
  (commit 6c1e8f9) now makes one tool-free call that rewrites the answer from the tool results already
  fetched. It is unit-tested; the UI also strips the trailing SOURCES line from every answer.
- **Bad tool arguments.** Llama 3.3 sometimes sends a nested call or no coordinates. The search tools
  reject them with "invalid coordinates; call geocode_place first", and the model geocodes and retries
  (seen live on 2026-10-07).
- **Not embedding-based RAG.** Retrieval is tool calls over the pipeline API (structured geo and
  permit queries) with grounded citations. There is no vector index, so questions that need fuzzy
  matching of work descriptions are not supported.
- Answers can vary run to run; the model is not deterministic.
