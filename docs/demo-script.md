# Demo video script (about 4 minutes)

Open the app: https://roofing-crm.pages.dev
Backends: CRM API https://roofing-crm-api.mikhalenia-a.workers.dev, data API https://scc-pipeline-api.mikhalenia-a.workers.dev
Use a 1280x800 browser window. The same flow runs automatically in `apps/web-e2e/src/demo-transcript.spec.ts`.
Everything below happens on the Prospect page except the last two rows: map, agent and lead actions share one screen.

| Time | Screen | Say | Do |
|---|---|---|---|
| 0:00 | Prospect page | "This is the Roofing CRM, centered on Santa Clara County. Results load on their own; the chip at the top says where the data comes from." | Show the map card, the legend and the "Data: Santa Clara County · updated …" chip. Click the chip to show "About this data", then close it. |
| 0:25 | Map | "I drop a pin anywhere in the county. The markers and the table refresh by themselves, no Search button." | Click bare map near downtown San José (or drag the dark pin). Watch the progress bar and the new markers. |
| 0:45 | Search panel | "Radius 5 miles, roofs at least 15 years old, permit state Any (open plus stalled)." | Drag Radius to 5 mi and Min roof age to 15 yrs. Results update after each change. |
| 1:05 | Map and table | "Terracotta dots are aged roofs, amber are open permits, slate are stalled permits; a larger dot has both. Hovering shows the summary without opening anything." | Hover a marker (tooltip) and a table row (its marker is highlighted). |
| 1:25 | Table | "I sort by days open to put the longest-stalled permits first." | Click the Open for header until it is descending. |
| 1:40 | Drawer | "Details show the permit history, contractor, roof-age basis and plain-language provenance. BBB is not available because there is no public source." | Click a row with a permit and contractor. Point out "BBB: not available (no public source)" and the Technical details toggle. Close the drawer. |
| 2:05 | Marker popup | "Clicking a marker gives the summary and three actions right on the map." | Click a terracotta marker. Show address, roof age, permit, contractor, owner and the Details, Save as lead and Ask agent buttons. |
| 2:20 | Agent panel | "I ask the agent about this property without leaving the map." | Click Ask agent. The panel opens on the right with the question prefilled ("Tell me about … (APN …)"). Press Send (wait up to a minute). Show the answer, the highlighted source chip and "How this was answered" ("Looked up a property"). Click a source chip to fly the map to it. |
| 2:55 | Marker popup | "If it looks good, I save it as a lead from the same popup." | Click Save as lead in the popup. The "Saved as lead" toast appears and the button changes to "Already a lead". |
| 3:10 | Leads page | "Leads can be filtered by status, roof age, permit state and radius, with notes and status tracking. On map takes me back to it." | Open Leads. Show the saved lead, change its status, open its notes editor and add a note, click On map. |
| 3:35 | Agent page and sidebar | "The full-page agent is still here, and future modules (campaigns, outreach, quotes, scheduling, reporting) are visible but disabled." | Open Agent, then hover a greyed sidebar item. |
| 3:55 | End | "That is lead identification end to end, on one screen." | Stop. |

Cleanup after recording: delete the demo lead from the Leads page.
