import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const CRM_API = process.env["E2E_CRM_API"] ?? "https://roofing-crm-api.mikhalenia-a.workers.dev";
// Temporary escape hatch for when D1 writes are blocked (free-tier daily limit); never the default.
const SKIP_WRITES = process.env["E2E_SKIP_WRITES"] === "1";
const RED = "#d32f2f";

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

    await test.step("02 drop pin", async () => {
      const pinText = page.getByText(/^Pin: /);
      const before = await pinText.textContent();
      const box = (await page.locator(".leaflet-container").boundingBox())!;
      await page.mouse.click(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30);
      await expect(pinText).not.toHaveText(before!);
      await expect(page.locator("path.leaflet-interactive").first()).toBeVisible();
      await shot(page, "02-pin");
    });

    await test.step("03 radius and roof age", async () => {
      await setSlider(page, /Radius/, 5, 0.5, 0.5);
      await setSlider(page, /Min roof age/, 15, 5, 1);
      await expect(page.getByText("Radius: 5 mi")).toBeVisible();
      await expect(page.getByText("Min roof age: 15 yrs")).toBeVisible();
      await shot(page, "03-radius-age");
    });

    await test.step("04 search", async () => {
      await page.getByRole("button", { name: "Search", exact: true }).click();
      const rows = page.getByRole("button", { name: /^Open details for / });
      await expect(rows.first()).toBeVisible({ timeout: 30_000 });
      expect(await rows.count()).toBeGreaterThan(0);
      await expect(page.locator(`path[stroke="${RED}"]`).first()).toBeAttached();
      await shot(page, "04-search");
    });

    await test.step("05 sort by days open", async () => {
      const header = page.getByRole("columnheader", { name: "Days open" });
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
        if ((state === "open" || state === "expired_unfinaled") && contractor && contractor !== "-") {
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

    await writeStep("07 save as lead", async () => {
      const drawer = page.getByRole("complementary", { name: "Property details" });
      const action = drawer.getByRole("button", { name: /^(Save as lead|Already a lead)$/ });
      await expect(action).toBeVisible();
      if ((await action.textContent()) === "Already a lead") {
        // The drawer checks GET /leads/:apn on open; a leftover lead from an earlier run is already marked.
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
          await expect(drawer.getByRole("button", { name: "Already a lead" })).toBeVisible();
        }
      }
      await shot(page, "07-saved");
    });

    await writeStep("08 leads page", async () => {
      await page.keyboard.press("Escape");
      await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Leads" }).click();
      await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
      await expect(page.getByRole("row", { name: new RegExp(escapeRe(address)) })).toBeVisible({ timeout: 20_000 });
      await shot(page, "08-leads");
    });

    await test.step("09 agent", async () => {
      await page.keyboard.press("Escape");
      await expect(page.getByRole("complementary", { name: "Property details" })).toBeHidden();
      await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Agent" }).click();
      await page.getByText(/^Which properties within 5 miles/).click();
      await page.getByRole("button", { name: "Send" }).click();
      const answer = page.getByTestId("agent-answer");
      await expect(answer).toBeVisible({ timeout: 60_000 });
      expect(((await answer.textContent()) ?? "").trim().length).toBeGreaterThan(40);
      await expect(page.getByTestId("agent-tool-calls")).toBeVisible();
      await expect(page.getByTestId("agent-sources").getByRole("button").first()).toBeVisible();
      await shot(page, "09-agent");
    });

    await test.step("10 disabled nav", async () => {
      // Close any open property drawer so the sidebar is unobstructed.
      await page.keyboard.press("Escape");
      await expect(page.getByRole("complementary", { name: "Property details" })).toBeHidden();
      const future = page.locator('li[aria-disabled="true"]');
      await expect(future).toHaveCount(5);
      for (const label of ["Campaigns", "Outreach", "Estimates & Quotes", "Crew Scheduling", "Reporting"]) {
        await expect(page.locator('li[aria-disabled="true"]', { hasText: label })).toBeVisible();
      }
      await shot(page, "10-disabled-nav");
    });
  } finally {
    if (apn && savedThisRun) await request.delete(`${CRM_API}/leads/${apn}`);
  }
});
