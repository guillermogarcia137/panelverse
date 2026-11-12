import { chromium } from "playwright";
import { ZipWriter, BlobWriter, Uint8ArrayReader } from "@zip.js/zip.js";
import { makeRar, pageFiles } from "../test/helpers/comics.js";
import assert from "node:assert/strict";
const zip = new ZipWriter(new BlobWriter());
for (const [name, data] of pageFiles())
  await zip.add(name, new Uint8ArrayReader(data));
const cbz = Buffer.from(await (await zip.close()).arrayBuffer()),
  cbr = makeRar();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("crash", () => console.log("Browser page crashed"));
page.setDefaultTimeout(15000);
await page.route("https://*.supabase.co/**", (route) => route.abort());
await page.addInitScript(() => {
  if (!sessionStorage.getItem("reader-test-started")) {
    sessionStorage.setItem("panelverse.reader-return", "1");
    sessionStorage.setItem("reader-test-started", "1");
  }
});
await page.goto(
  process.env.READER_TEST_URL || "http://localhost:4173/panelverse/",
);
await page.locator("#reading-library").waitFor({ state: "visible" });
await page.locator("#reader-nav").click();
await page.locator("#reader-files").setInputFiles([
  { name: "Prueba CBZ.cbz", mimeType: "application/zip", buffer: cbz },
  { name: "Prueba CBR.cbr", mimeType: "application/vnd.rar", buffer: cbr },
]);
await page
  .waitForFunction(
    () => document.querySelector("#reader-count").textContent === "2",
  )
  .catch(async (error) => {
    console.log(
      "IMPORT DEBUG",
      await page.locator("#reader-message").textContent(),
      errors,
    );
    throw error;
  });
await page.screenshot({ path: "work/reader-desktop.png", fullPage: true });
await page
  .locator(".reader-book")
  .filter({ hasText: "Prueba CBZ" })
  .locator(".reader-cover")
  .click();
await page.locator("#comic-viewport img").waitFor();
assert.equal(await page.locator("#comic-page").textContent(), "1 / 3");
await page.locator("#comic-next").click();
await page.waitForFunction(
  () => document.querySelector("#comic-page").textContent === "2 / 3",
);
await page.locator("#comic-bookmark").click();
await page.waitForFunction(
  () =>
    document.querySelector("#comic-bookmark").getAttribute("aria-pressed") ===
    "true",
);
await page.locator("#comic-mode").selectOption("double");
await page.waitForFunction(
  () => document.querySelectorAll("#comic-viewport img").length === 2,
);
await page.locator("#comic-direction").selectOption("rtl");
await page.waitForFunction(
  () => document.querySelector("#comic-viewport").dataset.direction === "rtl",
);
await page.screenshot({ path: "work/reader-double.png" });
await page.locator("#comic-mode").selectOption("vertical");
await page.locator("#comic-viewport img").first().waitFor();
await page.locator("#comic-close").click();
await page.reload();
await page
  .locator(".reader-book")
  .filter({ hasText: "Prueba CBZ" })
  .locator(".reader-cover")
  .click();
await page.locator("#comic-viewport img").first().waitFor();
assert.equal(await page.locator("#comic-bookmarks option").count(), 2);
await page.locator("#comic-close").click();
await page
  .locator(".reader-book")
  .filter({ hasText: "Prueba CBR" })
  .locator(".reader-cover")
  .click();
await page.locator("#comic-viewport img").first().waitFor();
await page.locator("#comic-mode").selectOption("single");
await page.locator("#comic-range").fill("2");
await page.locator("#comic-range").dispatchEvent("change");
await page.waitForFunction(
  () => document.querySelector("#comic-page").textContent === "3 / 3",
);
await page.locator("#comic-finish").click();
await page.waitForFunction(
  () =>
    document.querySelector("#comic-finish").textContent ===
    "Marcar sin terminar",
);
await page.locator("#comic-close").click();
await context.setOffline(true);
await page.reload();
await page
  .locator(".reader-book")
  .filter({ hasText: "Prueba CBR" })
  .locator(".reader-cover")
  .click();
await page.locator("#comic-viewport img").first().waitFor();
await page.locator("#comic-close").click();
await context.setOffline(false);
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: "work/reader-mobile.png", fullPage: true });
assert.ok(
  await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
);
await page.locator('[data-filter="all"]').click();
await page.locator("#library").waitFor({ state: "visible" });
await page.locator("#reader-nav").click();
await page.locator("#reading-library").waitFor({ state: "visible" });

let requests = [],
  expired = false,
  removed = false;
await page.route("https://www.googleapis.com/drive/v3/**", async (route) => {
  const url = new URL(route.request().url());
  requests.push({ method: route.request().method(), path: url.pathname });
  if (expired) {
    await route.fulfill({ status: 401, body: "Expired" });
    return;
  }
  if (url.searchParams.get("alt") === "media") {
    await route.fulfill({
      status: 200,
      contentType: "application/zip",
      body: cbz,
    });
    return;
  }
  if (url.pathname.endsWith("/files/folder1")) {
    await route.fulfill({
      json: { id: "folder1", mimeType: "application/vnd.google-apps.folder" },
    });
    return;
  }
  let files = [];
  const q = url.searchParams.get("q") || "";
  if (q.includes("'root'"))
    files = [
      {
        id: "folder1",
        name: "Mis cómics",
        mimeType: "application/vnd.google-apps.folder",
      },
    ];
  else if (q.includes("'folder1'") && !removed)
    files = [
      {
        id: "drivecomic",
        name: "Drive comic.cbz",
        modifiedTime: "2026-11-12T10:00:00Z",
        size: String(cbz.length),
      },
    ];
  await route.fulfill({ json: { files } });
});
await page.waitForFunction(
  () => !document.querySelector("#signin-google").disabled,
);
await page.evaluate(() =>
  window.dispatchEvent(
    new CustomEvent("panelverse:auth-session", {
      detail: { token: "test-token" },
    }),
  ),
);
await page.locator("#drive-choose").click();
await page
  .locator("#drive-folders button")
  .filter({ hasText: "Mis cómics" })
  .waitFor({ timeout: 5000 })
  .catch(async (error) => {
    console.log(
      "DRIVE DEBUG",
      requests,
      await page.locator("#drive-browse-status").textContent(),
      await page.locator("#reader-message").textContent(),
      await page.locator("#drive-connection").textContent(),
    );
    throw error;
  });
await page
  .locator("#drive-folders button")
  .filter({ hasText: "Mis cómics" })
  .click();
await page.waitForFunction(
  () => document.querySelector("#drive-current").dataset.id === "folder1",
);
await page.locator("#drive-use-current").click();
await page.locator("#drive-folder-form button[type=submit]").click();
await page.waitForFunction(
  () => document.querySelector("#reader-count").textContent === "3",
);
await page
  .locator(".reader-book")
  .filter({ hasText: "Drive comic" })
  .locator(".reader-cover")
  .click();
await page.locator("#comic-viewport img").first().waitFor();
await page.locator("#comic-next").click();
await page.waitForFunction(
  () => document.querySelector("#comic-page").textContent === "2 / 3",
);
await page.locator("#comic-close").click();
removed = true;
await page.locator("#drive-sync").click();
await page.waitForFunction(() =>
  document
    .querySelector("#reader-message")
    .textContent.includes("0 cómics encontrados"),
);
assert.equal(await page.locator("#reader-count").textContent(), "3");
expired = true;
await page.locator("#drive-sync").click();
await page.waitForFunction(() =>
  document.querySelector("#reader-message").textContent.includes("caducado"),
);
assert.equal(await page.locator("#reader-count").textContent(), "3");
assert.ok(requests.every((r) => r.method === "GET"));
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
await page.evaluate(() =>
  window.dispatchEvent(
    new CustomEvent("panelverse:account-changed", { detail: { userId: null } }),
  ),
);
await page.waitForFunction(
  () => document.querySelector("#reader-count").textContent === "3",
);
assert.deepEqual(errors, []);
console.log(
  "PASS: CBZ/CBR, double/RTL/vertical, bookmarks, reload, offline, navigation, mobile, Drive folder/download/removal/401 (mock), account isolation, GET-only Drive, no page errors",
);
await browser.close();
