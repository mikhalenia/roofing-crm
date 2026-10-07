import { Hono } from "hono";
import { cors } from "hono/cors";
import { leads } from "./leads";
import { writeLimit } from "./rate-limit";

const app = new Hono<{ Bindings: Cloudflare.Env }>();

app.use("*", (c, next) =>
  cors({
    origin: c.env.ALLOWED_ORIGIN,
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  })(c, next),
);

app.get("/health", (c) => c.json({ ok: true, pipelineApi: c.env.PIPELINE_API, manifestCid: null }));

app.use("/leads/*", writeLimit);
app.route("/leads", leads);

app.notFound((c) => c.json({ error: "not found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal error" }, 500);
});

export default app;
