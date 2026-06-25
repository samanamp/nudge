// Headless smoke test for Nudge: drives the real app in Chrome.
// Usage: E2E_BASE=http://localhost:8787 node e2e/smoke.mjs
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE ?? "http://localhost:8787";
const email = `e2e+${Date.now()}@example.com`;
const password = "test-password-123";

const errors = [];
let step = "start";
const log = (m) => console.log(`  ${m}`);

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 }); // desktop quick-add
const quickAdd = () => page.getByPlaceholder("Add a task…").first();
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

try {
  console.log(`\nNudge e2e against ${BASE}  (user ${email})\n`);

  step = "load sign-in screen";
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByText("It nudges until it's done.").waitFor({ timeout: 10000 });
  log("✓ sign-in screen renders");

  step = "create account";
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder(/Password/).fill(password);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/auth/signup")),
    page.getByRole("button", { name: "Create account" }).click(),
  ]);
  await quickAdd().waitFor({ timeout: 10000 });
  log("✓ signed up → app rendered (no blank page)");

  step = "add a task";
  const title = `Buy milk ${Date.now()}`;
  await quickAdd().fill(title);
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/api/todos/push") && r.status() === 200,
      { timeout: 10000 },
    ),
    quickAdd().press("Enter"),
  ]);
  await page.getByText(title).waitFor({ timeout: 5000 });
  log("✓ task created and pushed to server");

  step = "reload keeps session + task";
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText(title).waitFor({ timeout: 10000 });
  log("✓ still signed in and task persisted after reload");

  step = "sign out clears tasks";
  await page.getByTitle(email).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByText("It nudges until it's done.").waitFor({ timeout: 10000 });
  if (await page.getByText(title).count())
    throw new Error("task still visible after sign out");
  log("✓ signed out → sign-in screen, tasks gone");

  step = "sign in pulls tasks back";
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder(/Password/).fill(password);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/auth/login")),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
  await page.getByText(title).waitFor({ timeout: 10000 });
  log("✓ signed back in → task synced back from server");

  if (errors.length) throw new Error(`console/page errors:\n  ${errors.join("\n  ")}`);

  console.log("\n✅ ALL CHECKS PASSED\n");
  await browser.close();
  process.exit(0);
} catch (e) {
  console.error(`\n❌ FAILED at step: ${step}\n   ${e.message}`);
  if (errors.length) console.error("   captured errors:\n   " + errors.join("\n   "));
  await page.screenshot({ path: "e2e/failure.png" }).catch(() => {});
  await browser.close();
  process.exit(1);
}
