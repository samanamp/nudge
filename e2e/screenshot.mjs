import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 390, height: 844 });

await page.goto("https://nudge.info-d80.workers.dev", { waitUntil: "networkidle" });
const email = `rev2mob+${Date.now()}@example.com`;
await page.getByRole("button", { name: "Create an account" }).click();
await page.getByPlaceholder("you@example.com").fill(email);
await page.getByPlaceholder(/Password/).fill("test-password-123");
await Promise.all([
  page.waitForResponse(r => r.url().includes("/api/auth/signup")),
  page.getByRole("button", { name: "Create account" }).click(),
]);
await page.waitForSelector('[placeholder="Add a task…"]', { timeout: 15000 });
for (const t of ["Schedule annual health checkup", "Buy groceries", "Fix leaking faucet"]) {
  await page.getByPlaceholder("Add a task…").first().fill(t);
  await page.getByPlaceholder("Add a task…").first().press("Enter");
  await page.waitForTimeout(400);
}
await page.waitForTimeout(5000);

await page.screenshot({ path: "/tmp/s09_mobile.png" });

// Mobile account sheet
await page.locator("button[title]").last().click();
await page.waitForTimeout(500);
await page.screenshot({ path: "/tmp/s10_mobile_account.png" });

// Close via X button
await page.locator("button").filter({ has: page.locator("svg") }).filter({ hasText: "" }).nth(0).click();
await page.waitForTimeout(300);

// Mobile edit dialog
await page.locator('[role="button"]').first().click();
await page.waitForTimeout(600);
await page.screenshot({ path: "/tmp/s11_mobile_edit.png" });

await browser.close();
console.log("done");
