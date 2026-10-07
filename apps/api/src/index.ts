import { AgentRequest } from "@crm/contracts";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { getAgentDeps, runAgent } from "./agent";
import { leads } from "./leads";
import { writeLimit } from "./rate-limit";

const app = new Hono<{ Bindings: Cloudflare.Env }>();

const DEV_ORIGINS = ["http://localhost:4200", "http://localhost:4300"];

app.use("*", (c, next) =>
  cors({
    origin: [c.env.ALLOWED_ORIGIN, ...DEV_ORIGINS],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  })(c, next),
);

app.get("/health", (c) => c.json({ ok: true, pipelineApi: c.env.PIPELINE_API, manifestCid: null }));

app.use("/leads/*", writeLimit);
app.route("/leads", leads);

app.use("/agent", writeLimit);
app.post("/agent", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    body = undefined;
  }
  const parsed = AgentRequest.safeParse(body);
  if (!parsed.success)
    return c.json({ error: "invalid request", issues: parsed.error.issues }, 400);
  try {
    return c.json(await runAgent(c.env, parsed.data, getAgentDeps()), 200);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 502);
  }
});

app.notFound((c) => c.json({ error: "not found" }, 404));
app.onError((err, c) => {
  console.error(err instanceof Error ? err.message : err);
  return c.json({ error: "internal error" }, 500);
});

export default app;
