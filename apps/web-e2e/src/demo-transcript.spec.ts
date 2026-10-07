import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const CRM_API = process.env["E2E_CRM_API"] ?? "https://roofing-crm-api.mikhalenia-a.workers.dev";
// Temporary escape hatch for when D1 writes are blocked (free-tier daily limit); never the default.
const SKIP_WRITES = process.env["E2E_SKIP_WRITES"] === "1";

test.use({ viewport: { width: 1280, height: 800 } });

const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const shot = (page: Page, name: string) =>
  page.screenshot({ path: join(__dirname, "..", "screenshots", `${name}.png`), fullPage: false });

async function setSlider(page: Page, name: RegExp, value: number, min: number, step: number) {
  const slider = page.getByRole("slider", { name });
  await slider.focus();
  await page.keyboard.press("Home");
  for (let i = 0; i < Math.round((value - min) / step); i++) await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuenow", String(value));
}

/** Clicks result markers until one opens its popup (a marker may sit under the legend). */
async function openMarkerPopup(page: Page) {
  const markers = page.locator("path.result-marker");
  const n = await markers.count();
  const popup = page.locator(".leaflet-popup");
  for (let i = 0; i < Math.min(n, 40); i++) {
    await markers.nth(Math.floor((i * n) / 40)).click({ force: true });
    if (await popup.isVisible()) return popup;
  }
  throw new Error("no marker opened a popup");
}

// Records the reason in the report; test.skip() inside a step would skip the whole test.
const writeStep = (title: string, body: () => Promise<void>) => {
  if (!SKIP_WRITES) return test.step(title, body);
  test.info().annotations.push({ type: "skipped-step", description: `${title}: D1 writes blocked` });
  return test.step.skip(title, body);
};

test("README demo transcript", async ({ page, request }) => {
  test.setTimeout(180_000);
  let apn: string | null = null;
  let address = "";
  let savedThisRun = false;
  try {
    await test.step("01 open", async () => {
      await page.goto("/");
      await expect(page).toHaveTitle(/Roofing CRM/);
      await expect(page.locator(".leaflet-container")).toBeVisible();
      await expect(page.locator(".leaflet-tile-loaded").first()).toBeVisible({ timeout: 20_000 });
      await shot(page, "01-open");
    });

    await test.step("02 drop pin: results refresh without pressing Search", async () => {
      // The first visit searches automatically.
      await expect(page.getByRole("button", { name: /^Open details for / }).first()).toBeVisible({ timeout: 30_000 });
      const pinText = page.getByText(/^Pin: /);
      const before = await pinText.textContent();
      const box = (await page.locator(".leaflet-container").boundingBox())!;
      // Click bare map near the center: a marker click would open its popup instead of moving the pin.
      let target: { x: number; y: number } | null = null;
      for (const [dx, dy] of [[40, 30], [60, -40], [-50, 50], [80, 60], [-70, -30], [20, 90], [100, -80]] as const) {
        const p = { x: box.x + box.width / 2 + dx, y: box.y + box.height / 2 + dy };
        const bare = await page.evaluate(({ x, y }) => {
          const el = document.elementFromPoint(x, y);
          // Tiles ignore pointer events, so bare map resolves to the container itself.
          return el instanceof HTMLElement && (el.classList.contains("leaflet-container") || el.classList.contains("leaflet-tile"));
        }, p);
        if (bare) {
          target = p;
          break;
        }
      }
      expect(target).not.toBeNull();
      const refreshed = page.waitForResponse((r) => r.url().includes("/aged-roofs") && r.status() === 200, { timeout: 30_000 });
      await page.mouse.click(target!.x, target!.y);
      await expect(pinText).not.toHaveText(before!);
      const pin = (await pinText.textContent())!.replace("Pin: ", "").split(", ").map(Number);
      const lat = Number(new URL((await refreshed).url()).searchParams.get("lat"));
      expect(lat).toBeCloseTo(pin[0]!, 3);
      await expect(page.locator("path.result-marker").first()).toBeAttached({ timeout: 30_000 });
      await shot(page, "02-pin");
    });

    await test.step("03 radius and roof age", async () => {
      await setSlider(page, /Radius/, 5, 0.5, 0.5);
      await setSlider(page, /Min roof age/, 15, 5, 1);
      await expect(page.getByRole("radio", { name: "Any" })).toBeChecked();
      await expect(page.getByText("5-mile radius")).toBeVisible();
      await shot(page, "03-radius-age");
    });

    await test.step("04 results, legend and hover", async () => {
      const rows = page.getByRole("button", { name: /^Open details for / });
      await expect(rows.first()).toBeVisible({ timeout: 30_000 });
      expect(await rows.count()).toBeGreaterThan(0);
      await expect(page.locator("path.result-marker--aged_roof").first()).toBeAttached();
      await expect(page.getByRole("list", { name: "Map legend" })).toBeVisible();
      await expect(page.getByTestId("map-status")).toContainText(/matching propert|of at least [\d,]+ matches/);
      await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();
      await page.locator("path.result-marker").first().hover({ force: true });
      await expect(page.locator(".leaflet-tooltip").first()).toContainText(/Roof (\d+ yrs|age unknown)/);
      await shot(page, "04-results");
    });

    await test.step("05 sort by days open", async () => {
      const header = page.getByRole("columnheader", { name: "Open for" });
      await header.getByRole("button").click();
      await header.getByRole("button").click();
      await expect(header).toHaveAttribute("aria-sort", "descending");
      await page.getByRole("table").scrollIntoViewIfNeeded();
      await shot(page, "05-sorted");
    });

    await test.step("06 open property drawer", async () => {
      const headers = (await page.locator("thead th").allTextContents()).map((h) => h.trim());
      const stateCol = headers.indexOf("State");
      const contractorCol = headers.indexOf("Contractor");
      const rows = page.locator("tbody tr");
      let row = rows.first();
      const n = Math.min(await rows.count(), 60);
      for (let i = 0; i < n; i++) {
        const cells = rows.nth(i).locator("td");
        const state = (await cells.nth(stateCol).textContent())?.trim();
        const contractor = (await cells.nth(contractorCol).textContent())?.trim();
        if ((state === "Open" || state === "Stalled") && contractor && contractor !== "-") {
          row = rows.nth(i);
          break;
        }
      }
      address = ((await row.locator("td").first().textContent()) ?? "").trim();
      await row.click();
      const drawer = page.getByRole("complementary", { name: "Property details" });
      await expect(drawer.getByText("Contractor", { exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(drawer.getByText(/BBB: not available \(no public source\)/).first()).toBeVisible();
      expect(address).not.toBe("");
      apn = (await drawer.getByText(/^APN /).textContent())!.replace("APN ", "").trim();
      await shot(page, "06-drawer");
    });

    await test.step("07 marker popup", async () => {
      await page.keyboard.press("Escape");
      await expect(page.getByRole("complementary", { name: "Property details" })).toBeHidden();
      const popup = await openMarkerPopup(page);
      for (const name of ["Details", /^(Save as lead|Already a lead)$/, "Ask agent"]) {
        await expect(popup.getByRole("button", { name })).toBeVisible();
      }
      address = ((await popup.locator("h3").textContent()) ?? "").trim();
      apn = /APN (.+)$/.exec(((await popup.getByText(/, APN /).textContent()) ?? "").trim())![1]!;
      await shot(page, "07-popup");
    });

    await test.step("08 ask agent from the popup", async () => {
      await page.locator(".leaflet-popup").getByRole("button", { name: "Ask agent" }).click();
      const panel = page.getByRole("region", { name: "Agent" });
      await expect(panel).toBeVisible();
      await expect(panel.getByLabel("Question")).toHaveValue(new RegExp(`^Tell me about .*\\(APN ${escapeRe(apn!)}\\)`));
      const asked = page.waitForResponse((r) => r.url().endsWith("/agent") && r.request().method() === "POST", { timeout: 90_000 });
      await panel.getByRole("button", { name: "Send" }).click();
      expect((await asked).status()).toBe(200);
      const answer = panel.getByTestId("agent-answer");
      await expect(answer).toBeVisible({ timeout: 90_000 });
      expect(((await answer.textContent()) ?? "").trim().length).toBeGreaterThan(40);
      await expect(panel.getByTestId("agent-tool-calls")).toContainText("Looked up a property");
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, "08-ask-agent");
    });

    await writeStep("09 save as lead from the popup", async () => {
      const popup = page.locator(".leaflet-popup");
      await expect(popup).toBeVisible();
      const action = popup.getByRole("button", { name: /^(Save as lead|Already a lead)$/ });
      if ((await action.textContent()) === "Already a lead") {
        // The popup checks GET /leads/:apn on open; a leftover lead from an earlier run is already marked.
        await expect(action).toBeDisabled();
      } else {
        const created = page.waitForResponse(
          (r) => r.url().endsWith("/leads") && r.request().method() === "POST",
        );
        await action.click();
        const status = (await created).status();
        if (status === 201) {
          savedThisRun = true;
          await expect(page.getByText("Saved as lead")).toBeVisible();
        } else {
          // A lead saved between the check and the click yields a 409, shown as "Already a lead".
          expect(status).toBe(409);
          await expect(popup.getByRole("button", { name: "Already a lead" })).toBeVisible();
        }
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, "09-saved");
    });

    await writeStep("10 leads page", async () => {
      await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Leads" }).click();
      await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
      const row = page.getByRole("row", { name: new RegExp(escapeRe(address)) });
      await expect(row).toBeVisible({ timeout: 20_000 });
      await expect(row.getByRole("button", { name: `Show ${address} on map` })).toBeVisible();
      if (!savedThisRun) {
        await shot(page, "10-leads");
        return; // never edit or delete a lead this run did not create
      }
      // Status change goes through PATCH /leads/:apn.
      const patched = page.waitForResponse((r) => r.url().includes("/leads/") && r.request().method() === "PATCH");
      await row.getByRole("combobox", { name: `Status for ${address}` }).click();
      await page.getByRole("option", { name: "Contacted" }).click();
      expect((await patched).ok()).toBe(true);
      await expect(row.getByRole("combobox", { name: `Status for ${address}` })).toHaveText("Contacted");
      await shot(page, "10-leads");
      // Delete through the UI so production keeps no demo lead.
      const deleted = page.waitForResponse((r) => r.url().includes("/leads/") && r.request().method() === "DELETE");
      await row.getByRole("button", { name: `Delete ${address}` }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
      expect((await deleted).ok()).toBe(true);
      savedThisRun = false;
      await expect(page.getByRole("row", { name: new RegExp(escapeRe(address)) })).toHaveCount(0);
    });

    await test.step("11 agent page", async () => {
      await page.keyboard.press("Escape");
      await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Agent" }).click();
      await page.getByText(/^Which properties within 5 miles/).click();
      await expect(page.getByLabel("Question")).toHaveValue(/^Which properties within 5 miles/);
      // The panel keeps the previous answer, so wait for this question's response.
      const asked = page.waitForResponse((r) => r.url().endsWith("/agent") && r.request().method() === "POST", { timeout: 90_000 });
      await page.getByRole("button", { name: "Send" }).click();
      expect((await asked).status()).toBe(200);
      const answer = page.getByTestId("agent-answer");
      await expect(page.getByRole("progressbar", { name: "Loading" })).toBeHidden();
      expect(((await answer.textContent()) ?? "").trim().length).toBeGreaterThan(40);
      await expect(page.getByTestId("agent-tool-calls")).toBeVisible();
      await expect(page.getByTestId("agent-sources").getByRole("button").first()).toBeVisible();
      await shot(page, "11-agent");
    });

    await test.step("12 disabled nav", async () => {
      // Close any open property drawer so the sidebar is unobstructed.
      await page.keyboard.press("Escape");
      await expect(page.getByRole("complementary", { name: "Property details" })).toBeHidden();
      const future = page.locator('li[aria-disabled="true"]');
      await expect(future).toHaveCount(5);
      for (const label of ["Campaigns", "Outreach", "Estimates & Quotes", "Crew Scheduling", "Reporting"]) {
        await expect(page.locator('li[aria-disabled="true"]', { hasText: label })).toBeVisible();
      }
      await shot(page, "12-disabled-nav");
    });
  } finally {
    if (apn && savedThisRun) await request.delete(`${CRM_API}/leads/${apn}`);
  }
});
