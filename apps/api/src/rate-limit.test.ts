import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { writeLimit } from "./rate-limit";

describe("writeLimit", () => {
  it("fails open when the D1 write throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const app = new Hono<{ Bindings: Cloudflare.Env }>();
    app.use("*", writeLimit);
    app.post("/x", (c) => c.json({ ok: true }));
    const db = {
      prepare: () => ({ bind: () => ({}) }),
      batch: () => Promise.reject(new Error("D1_ERROR: daily limit")),
    };
    const res = await app.request("/x", { method: "POST" }, { DB: db } as unknown as Cloudflare.Env);
    expect(res.status).toBe(200);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
