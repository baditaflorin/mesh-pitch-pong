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

    await expect(audience.locator(".pitch-feed")).toContainText("agents everywhere");
    await audience.getByRole("button", { name: "react rocket", exact: true }).first().click();
    await pitcher.waitForTimeout(400);
    await expect(pitcher.locator(".pitch-feed")).toContainText("🚀");
  } finally {
    await cleanup();
  }
});
