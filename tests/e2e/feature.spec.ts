import { expect, test } from "@playwright/test";
import { openTwoPeers } from "@baditaflorin/mesh-common/testing";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  name: string;
};
const storagePrefix = pkg.name;

test("current pitcher's pitch syncs + audience react syncs back", async ({ browser, baseURL }) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await b.getByPlaceholder("your name").fill("bob");
    await a.waitForTimeout(800);

    await a.getByRole("button", { name: "start", exact: true }).click();
    await a.waitForTimeout(500);

    // figure out whose turn it is on A
    const banner = (await a.locator(".pitch-current").innerText()).toLowerCase();
    const pitcher = banner.includes("alice") ? a : b;
    const audience = banner.includes("alice") ? b : a;

    await pitcher.getByPlaceholder("pitch your idea").fill("agents everywhere");
    await pitcher.getByRole("button", { name: "drop pitch", exact: true }).click();
    await audience.waitForTimeout(400);

    // Cross-peer #1: the pitch text propagates pitcher → audience.
    await expect(audience.locator(".pitch-feed")).toContainText("agents everywhere");

    // The pitch row's rocket tally on the PITCHER starts at 0 (load-bearing:
    // 🚀 is always rendered, so we assert the COUNT, not the emoji).
    const pitcherRocketTally = pitcher
      .locator(".pitch-feed-row")
      .first()
      .locator(".pitch-tally")
      .first();
    await expect(pitcherRocketTally).toHaveText(/🚀\s*0/);

    // Cross-peer #2: audience reacts rocket; the count must propagate back to
    // the OPPOSITE peer (the pitcher) and land on the leaderboard.
    await audience.getByRole("button", { name: "react rocket", exact: true }).first().click();
    await expect(pitcherRocketTally).toHaveText(/🚀\s*1/);
    await expect(
      pitcher.locator(".mesh-leaderboard-row").first().locator(".mesh-leaderboard-score"),
    ).toHaveText("1");

    // And idempotency: a second react from the same audience peer (toggle off)
    // brings the pitcher's count back to 0 — proving it's a real synced count,
    // not a stuck local increment.
    await audience.getByRole("button", { name: "react rocket", exact: true }).first().click();
    await expect(pitcherRocketTally).toHaveText(/🚀\s*0/);
  } finally {
    await cleanup();
  }
});
