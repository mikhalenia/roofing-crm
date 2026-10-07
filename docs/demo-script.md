# Demo video script (about 3.5 minutes)

Open the app: https://roofing-crm.pages.dev
Backends: CRM API https://roofing-crm-api.mikhalenia-a.workers.dev, data API https://scc-pipeline-api.mikhalenia-a.workers.dev
Use a 1280x800 browser window. The same flow runs automatically in `apps/web-e2e/src/demo-transcript.spec.ts`.

| Time | Screen | Say | Do |
|---|---|---|---|
| 0:00 | Prospect page | "This is the Roofing CRM, centered on Santa Clara County. The data comes from public permit and parcel records, each with provenance." | Show the title, map, and snapshot banner. |
| 0:25 | Map | "I drop a pin anywhere in the county, or use my GPS location." | Click the map near downtown San Jose. The coordinates and radius circle update. |
| 0:45 | Search panel | "I set a 5 mile radius and a minimum roof age of 15 years." | Drag the Radius slider to 5 mi and Min roof age to 15 yrs. Leave Permit state on Any (the default: open plus stalled). |
| 1:05 | Results | "Search returns every roof older than 15 years, plus open and stalled roofing permits. Red markers are aged roofs, orange are open permits, grey are stalled." | Click Search, wait for markers and the table. |
| 1:30 | Table | "I sort by days open to put the longest-stalled permits first." | Click the Days open header until it is descending. |
| 1:50 | Drawer | "Opening a property shows the permit, contractor with CSLB license, roof age basis and provenance. BBB is shown as not available because there is no public source." | Click the first row with a permit and contractor. Point out "BBB: not available (no public source)". |
| 2:20 | Drawer | "One click turns it into a CRM lead." | Click Save as lead. The "Saved as lead" toast appears. (If the property is already a lead, the drawer shows a disabled "Already a lead" on open; pick another row.) |
| 2:35 | Leads page | "Leads can be filtered by status, roof age, permit state and radius, with notes and status tracking." | Open Leads. Show the saved lead, change its status. |
| 2:55 | Agent page | "The agent answers natural language questions from the same data." | Open Agent, click the first example, press Send (wait up to a minute). Show the answer, tool calls and source chips. |
| 3:15 | Sidebar | "Future modules (campaigns, outreach, quotes, scheduling, reporting) are visible but disabled." | Hover a greyed item. |
| 3:30 | End | "That is lead identification end to end." | Stop. |

Cleanup after recording: delete the demo lead from the Leads page.
