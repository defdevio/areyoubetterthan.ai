import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, login: string) {
  await page.goto("/signin?next=/play");
  await page.getByTestId("dev-login").fill(login);
  await page.getByTestId("dev-login-submit").click();
  await expect(page).toHaveURL(/\/play$/);
}

/** Opens a file through quick-open and replaces `from` with `to` on the matching line. */
async function edit(page: Page, file: string, line: string, from: string, to: string, nth = 0) {
  await page.getByPlaceholder("Go to file…").fill(file);
  await page.getByPlaceholder("Go to file…").press("Enter");
  const view = page.locator(".view-line", { hasText: line }).nth(nth);
  await view.click();
  await page.keyboard.press("End");
  const text = (await view.innerText()).replace(/\u00a0/g, " ");
  const after = text.slice(text.indexOf(from) + from.length);
  for (let i = 0; i < after.length + from.length; i++) await page.keyboard.press("Backspace");
  await page.keyboard.type(to + after);
}

const FIXES: Record<string, { file: string; line: string; from: string; to: string; nth?: number }> = {
  "acme__widgets-1": { file: "widgets/math.py", line: "return abs(a) + abs(b)", from: "abs(a) + abs(b)", to: "a + b" },
  // clamp() has two `return low` lines; the bug is the second one.
  "acme__widgets-2": { file: "widgets/math.py", line: "return low", from: "low", to: "high", nth: 1 },
  "acme__widgets-3": { file: "widgets/text.py", line: 're.sub(r"\\s+"', from: '"_"', to: '"-"' },
};

test("public pages render without signing in", async ({ page }) => {
  for (const path of ["/", "/stats", "/methodology"]) {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
  }
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Are you better/ })).toBeVisible();
  await page.goto("/play");
  await expect(page.getByText("Sign in to take the test")).toBeVisible();

  // The global table is useful before any humans have played: every model, with time and cost.
  await page.goto("/stats");
  // Scope to <main>: streamed Suspense content can briefly exist twice while React swaps it in.
  const main = page.getByRole("main");
  const board = main.getByTestId("global-leaderboard");
  await expect(board).toContainText("Avg time / task");
  await expect(board).toContainText("Cost / task");
  await expect(main.getByTestId("humans-locked-row")).toContainText(/ranked once \d+ attempts? (is|are) scored/);
  await board.getByRole("tab", { name: "SWE-bench leaderboard" }).click();
  await expect(board).toContainText("Published (all 500)");
});

test("a human fixes an issue, gets scored, and shares the result", async ({ page }) => {
  const login = `e2e-${Date.now()}`;
  await signIn(page, login);

  // Ready screen: the issue is hidden until the clock starts; repo preloads first.
  await expect(page.getByText("Next up: a real issue from")).toBeVisible();
  const start = page.getByTestId("start-task");
  await expect(start).toBeEnabled();
  await start.click();

  // Workspace
  await expect(page.getByTestId("workspace")).toBeVisible();
  await expect(page.getByTestId("timer")).toContainText(/1[45]:\d\d/);
  const instanceId = (await page.locator("text=/acme__widgets-\\d/").first().innerText()).match(/acme__widgets-\d/)![0];
  const fix = FIXES[instanceId];

  // Search works across the repo.
  await page.getByTestId("sidebar-search").click();
  await page.getByTestId("search-input").fill("def ");
  await expect(page.getByTestId("search-results")).toContainText("widgets");
  await page.getByTestId("sidebar-files").click();

  await edit(page, fix.file, fix.line, fix.from, fix.to, fix.nth);
  await expect(page.getByTestId("sidebar-changes")).toHaveText("Changes (1)");

  // Review dialog shows the git diff.
  await page.getByTestId("review-submit").click();
  const dialog = page.getByTestId("submit-dialog");
  await expect(dialog).toContainText(`diff --git a/${fix.file} b/${fix.file}`);
  await expect(dialog).toContainText(`+`);
  await page.getByTestId("confirm-submit").click();

  // Non-blocking scoring: submitted screen, then a live result.
  await expect(page.getByTestId("submitted")).toBeVisible();
  await expect(page.getByText("✓ Resolved!")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("submitted")).toContainText("Resolved. Nice work.");

  // Results page compares against models on the same task.
  await page.goto("/results");
  await expect(page.getByTestId("human-rate")).toHaveText("100%");
  await expect(page.getByTestId("comparison-chart")).toContainText("You");
  await expect(page.getByTestId("task-table")).toContainText(instanceId);
  // Beyond pass/fail: time, partial credit, localization, outcome breakdown, speed vs models.
  await expect(page.getByTestId("metric-tiles")).toContainText("Found the right file");
  await expect(page.getByTestId("metric-tiles")).toContainText("100%");
  await expect(page.getByTestId("outcome-bar")).toContainText("Resolved");
  await expect(page.getByTestId("speed-table")).toContainText("You");
  await expect(page.getByTestId("speed-table")).toContainText("Avg time / task");

  // Review page reveals the reference fix after the attempt.
  await page.goto(`/review/${instanceId}`);
  await expect(page.getByText("Reference fix (what was merged upstream)")).toBeVisible();
  await expect(page.getByText("1 / 1 passing")).toBeVisible();
  await expect(page.getByTestId("attempt-breakdown")).toContainText("Files the upstream fix changed");

  // Opt-in share page + OG image.
  await page.goto("/results");
  await page.getByTestId("share-name").fill("Ada the Human");
  await page.getByTestId("share-save").click();
  const link = page.getByTestId("share-link");
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  await page.goto(href!);
  await expect(page.getByRole("heading", { name: "Ada the Human" })).toBeVisible();
  // The page itself must not reveal the GitHub login (the header shows the viewer, who is the owner here).
  await expect(page.locator("main")).not.toContainText(login);
  const og = await page.request.get(`${href}/opengraph-image`);
  expect(og.status()).toBe(200);
  expect(og.headers()["content-type"]).toContain("image/png");

  // With a scored attempt the human row joins the global leaderboard.
  await page.goto("/stats");
  const stats = page.getByRole("main");
  await expect(stats.getByTestId("verdict")).toContainText("humans resolve 100%");
  await expect(stats.locator("[data-human]")).toContainText("Humans (pooled)");
  await expect(stats.getByTestId("metric-tiles")).toBeVisible();
  await expect(stats.getByTestId("per-task")).toContainText(instanceId);
});

test("giving up records an unresolved attempt and moves on", async ({ page }) => {
  await signIn(page, `quitter-${Date.now()}`);
  await page.getByTestId("start-task").click();
  await expect(page.getByTestId("workspace")).toBeVisible();
  await page.getByTestId("review-submit").click();
  await page.getByTestId("give-up").click();
  await expect(page.getByTestId("submitted")).toContainText("No changes were submitted");
  await page.getByTestId("next-task").click();
  await expect(page.getByText("Task 2 of 3")).toBeVisible();
});


test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the test is desktop-only, everything else works", async ({ page }) => {
    // Every public page fits the screen without sideways scrolling.
    for (const path of ["/", "/stats", "/methodology", "/play"]) {
      await page.goto(path);
      await expect(page.locator("main, [data-testid=desktop-only]").first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    }

    // Navigation lives behind the menu button.
    await page.goto("/stats");
    await page.getByTestId("mobile-nav-button").click();
    await page.getByTestId("mobile-nav").getByRole("link", { name: "Methodology" }).click();
    await expect(page).toHaveURL(/\/methodology$/);
    await expect(page.getByTestId("mobile-nav")).toHaveCount(0);

    // Signed in, /play shows the notice and never asks the server for a task, so no clock can start.
    const requests: string[] = [];
    page.on("request", (r) => requests.push(new URL(r.url()).pathname));
    await page.goto("/signin?next=/results");
    await page.getByTestId("dev-login").fill(`phone-${Date.now()}`);
    await page.getByTestId("dev-login-submit").click();
    await expect(page).toHaveURL(/\/results$/);
    await page.goto("/play");
    await expect(page.getByTestId("desktop-only")).toContainText("The test needs a bigger screen");
    await expect(page.getByTestId("start-task")).toHaveCount(0);
    expect(requests).not.toContain("/api/play");
    expect(requests).not.toContain("/api/attempts");

    // The leaderboard swaps column headers for a sort menu.
    await page.goto("/stats");
    const board = page.getByRole("main").getByTestId("global-leaderboard");
    await board.getByRole("combobox").selectOption("time");
    await expect(board.locator("thead")).toContainText("Avg time / task");
  });
});
