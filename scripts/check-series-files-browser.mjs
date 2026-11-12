import { chromium } from "playwright";
import { ZipWriter, BlobWriter, Uint8ArrayReader } from "@zip.js/zip.js";
import { makeRar, pageFiles, png } from "../test/helpers/comics.js";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const writer = new ZipWriter(new BlobWriter());
for (const [name, data] of pageFiles())
  await writer.add(name, new Uint8ArrayReader(data));
const cbz = Buffer.from(await (await writer.close()).arrayBuffer()),
  cbr = makeRar();
const thirdWriter = new ZipWriter(new BlobWriter());
await thirdWriter.add("page1.png", new Uint8ArrayReader(png(15, 25, 210)));
const third = Buffer.from(await (await thirdWriter.close()).arrayBuffer());
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage(),
  errors = [];
page.on("pageerror", (error) => errors.push(error.stack));
page.setDefaultTimeout(15000);
await page.route("https://*.supabase.co/**", (route) => route.abort());
await page.goto(process.env.READER_TEST_URL || "http://127.0.0.1:4176/");
await page.locator("#add-button").click();
await page.locator("[name=title]").fill("Saga descargada");
await page.locator("#series-reading-source").selectOption("files");
assert.equal(
  await page.locator("[name=url]").evaluate((el) => el.required),
  false,
);
await page.locator("#series-form button[type=submit]").click();
await page.locator("#series-issues").waitFor({ state: "visible" });
const seriesId = await page.evaluate(
  () =>
    JSON.parse(localStorage.getItem("panelverse.library.v1")).series.find(
      (s) => s.title === "Saga descargada",
    ).id,
);
await page.locator("#series-issue-files").setInputFiles([
  { name: "Saga #001.cbz", mimeType: "application/zip", buffer: cbz },
  { name: "Saga #002.cbr", mimeType: "application/vnd.rar", buffer: cbr },
]);
await page.waitForFunction(
  () => document.querySelectorAll(".series-issue").length === 2,
);
assert.equal(await page.locator("#reader-count").textContent(), "2");
assert.equal(await page.locator("#reader-nav").count(), 1);
await mkdir("work", { recursive: true });
await page.screenshot({ path: "work/series-issues-desktop.png" });
await page.locator("[data-issue-open]").first().click();
await page.locator("#comic-viewport img").waitFor();
assert.equal(await page.locator("#comic-page").textContent(), "1 / 3");
await page.locator("#comic-next").click();
await page.waitForFunction(
  (id) =>
    new URL(
      JSON.parse(localStorage.getItem("panelverse.library.v1")).series.find(
        (s) => s.id === id,
      ).url,
    ).searchParams.get("page") === "1",
  seriesId,
);
assert.equal(
  await page.evaluate(
    (id) =>
      JSON.parse(localStorage.getItem("panelverse.library.v1")).series.find(
        (s) => s.id === id,
      ).lastRead,
    seriesId,
  ),
  0,
);
await page.locator("#comic-close").click();
await page.locator("#series-issues [data-close]").click();
await page.reload();
await page.locator(`[data-files-play="${seriesId}"]`).first().click();
await page.locator("#comic-viewport img").waitFor();
assert.equal(await page.locator("#comic-page").textContent(), "2 / 3");
await page.locator("#comic-next").click();
await page.waitForFunction(
  (id) =>
    JSON.parse(localStorage.getItem("panelverse.library.v1")).series.find(
      (s) => s.id === id,
    ).lastRead === 1,
  seriesId,
);
await page.locator("#comic-next-issue").click();
await page.waitForFunction(() =>
  document.querySelector("#comic-title").textContent.includes("#002"),
);
await page.locator("#comic-range").fill("2");
await page.locator("#comic-range").dispatchEvent("change");
await page.waitForFunction(
  (id) =>
    JSON.parse(localStorage.getItem("panelverse.library.v1")).series.find(
      (s) => s.id === id,
    ).status === "finished",
  seriesId,
);
assert.equal(
  await page.evaluate(
    (id) =>
      JSON.parse(localStorage.getItem("panelverse.library.v1")).series.find(
        (s) => s.id === id,
      ).lastRead,
    seriesId,
  ),
  2,
);
await page.locator("#comic-close").click();
// The separate reader remains available, and its existing files can be linked without copying.
await page.locator("#reader-nav").click();
await page.locator("#reader-files").setInputFiles({
  name: "Saga #003.cbz",
  mimeType: "application/zip",
  buffer: third,
});
await page.waitForFunction(
  () => document.querySelector("#reader-count").textContent === "3",
);
await page
  .locator(".reader-book")
  .filter({ hasText: "#003" })
  .locator("[data-read-action=series]")
  .click();
await page.locator("#file-attach-target").selectOption(seriesId);
await page.locator("#file-attach-form button[type=submit]").click();
await page.waitForFunction(
  () => document.querySelectorAll(".series-issue").length === 3,
);
assert.equal(await page.locator("#reader-count").textContent(), "3");
await page.locator("#series-issues [data-close]").click();
await page.locator("[data-filter=all]").click();
await page.waitForFunction(
  () => document.querySelector("#library").hidden === false,
);
await page.locator(`[data-files-play="${seriesId}"]`).first().click();
await page.waitForFunction(() =>
  document.querySelector("#comic-title").textContent.includes("#003"),
);
await page.waitForFunction(
  (id) =>
    JSON.parse(localStorage.getItem("panelverse.library.v1")).series.find(
      (s) => s.id === id,
    ).lastRead === 3,
  seriesId,
);
await page.locator("#comic-close").click();
await page.setViewportSize({ width: 390, height: 844 });
assert.ok(
  await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
);
await page.screenshot({
  path: "work/series-library-mobile.png",
  fullPage: true,
});
await page.locator(`#grid [data-files-series="${seriesId}"]`).click();
assert.ok(
  await page.evaluate(
    () => document.querySelector("#series-issues").scrollWidth <= innerWidth,
  ),
);
await page.screenshot({ path: "work/series-issues-mobile.png" });
page.once("dialog", (dialog) => dialog.accept());
await page.locator("[data-issue-unlink]").last().click();
await page.waitForFunction(
  () => document.querySelectorAll(".series-issue").length === 2,
);
assert.equal(await page.locator("#reader-count").textContent(), "3");
await page.locator("#series-issues [data-close]").click();
await page.route("https://www.googleapis.com/drive/v3/**", async (route) => {
  const url = new URL(route.request().url());
  if (url.searchParams.get("alt") === "media")
    return route.fulfill({ body: cbz, contentType: "application/zip" });
  if (url.pathname.endsWith("/files/folder4"))
    return route.fulfill({
      json: { id: "folder4", mimeType: "application/vnd.google-apps.folder" },
    });
  const folder = url.searchParams.get("q") || "";
  return route.fulfill({
    json: {
      files: folder.includes("'root'")
        ? [
            {
              id: "folder4",
              name: "Saga Drive",
              mimeType: "application/vnd.google-apps.folder",
            },
          ]
        : [
            {
              id: "remote4",
              name: "Saga #004.cbz",
              size: String(cbz.length),
              modifiedTime: "2026-11-12T10:00:00Z",
            },
          ],
    },
  });
});
await page.locator("#reader-nav").click();
await page.evaluate(() =>
  window.dispatchEvent(
    new CustomEvent("panelverse:auth-session", {
      detail: { token: "test-token" },
    }),
  ),
);
await page.locator("#drive-choose").click();
await page.locator("#drive-folder-input").fill("folder4");
await page.locator("#drive-folder-form button[type=submit]").click();
await page.waitForFunction(
  () => document.querySelector("#reader-count").textContent === "4",
);
await page
  .locator(".reader-book")
  .filter({ hasText: "#004" })
  .locator("[data-read-action=series]")
  .click();
await page.locator("#file-attach-target").selectOption(seriesId);
await page.locator("#file-attach-form button[type=submit]").click();
await page.waitForFunction(
  () => document.querySelectorAll(".series-issue").length === 3,
);
await page
  .locator(".series-issue")
  .filter({ hasText: "#004" })
  .locator("[data-issue-open]")
  .click();
await page.locator("#comic-viewport img").waitFor();
await page.locator("#comic-range").fill("2");
await page.locator("#comic-range").dispatchEvent("change");
await page.waitForFunction(
  (id) =>
    JSON.parse(localStorage.getItem("panelverse.library.v1")).series.find(
      (s) => s.id === id,
    ).lastRead === 4,
  seriesId,
);
await page.locator("#comic-close").click();
await page.locator("#series-issues [data-close]").click();
await context.setOffline(true);
await page.reload();
await page.locator("[data-filter=all]").click();
await page.locator(`[data-files-play="${seriesId}"]`).first().click();
await page.locator("#comic-viewport img").waitFor();
await page.locator("#comic-close").click();
await context.setOffline(false);
await page.evaluate(() =>
  window.dispatchEvent(
    new CustomEvent("panelverse:account-changed", {
      detail: { userId: "11111111-1111-4111-8111-111111111111" },
    }),
  ),
);
await page.waitForFunction(
  () => document.querySelector("#reader-count").textContent === "0",
);
assert.equal(
  await page.locator("#series-issues").evaluate((el) => el.open),
  false,
);
assert.deepEqual(errors, []);
await browser.close();
console.log(
  "PASS: file series creation without URL, multiple CBR/CBZ issues, library resume and page persistence, automatic issue/series progress, next issue, linking existing reader files without duplicates, mobile, unlink preserves file, Drive series, offline library reading, account isolation.",
);
