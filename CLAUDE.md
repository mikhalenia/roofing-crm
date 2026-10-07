# Roofing CRM — agent guide

- Spec: `docs/superpowers/specs/2026-10-07-roofing-crm-design.md`. Read it before changing behavior.
- Node 22 via nvm, pnpm, nx. `pnpm check` = lint + typecheck + test + build.
- `apps/web` React + MUI + Leaflet (Cloudflare Pages). `apps/api` Hono Worker: leads in D1, agent via Vercel AI SDK + Workers AI. `libs/contracts` Zod schemas shared by both.
- Property/permit data comes only from the pipeline API (`PIPELINE_API`). This repo never ingests or stores county data.
- TDD. Domain and contract logic gets unit tests; the Worker gets vitest-pool-workers tests; the demo transcript is a Playwright e2e.
- Conventional commits, English only, no attribution trailers. Never push to origin unless told.
- YAGNI: no auth, no multi-tenant, no feature flags.
