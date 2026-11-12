import { chromium } from "playwright";
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { png } from "../test/helpers/comics.js";
const bridge = await readFile(
  new URL("../src/web-bridge.user.js", import.meta.url),
  "utf8",
);
const comic = {
  id: "test-web",
  title: "Prueba web",
  publisher: "",
  status: "pending",
  lastRead: 0,
  total: 100,
  url: "https://marmota.me/comic/superman-2023/superman-35/",
  cover: "",
  notes: "",
  updatedAt: new Date().toISOString(),
};
const key = "panelverse.library.v1",
  image = png().toString("base64");
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
    viewport: { width: 1280, height: 950 },
  }),
  page = await context.newPage(),
  errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.setDefaultTimeout(12000);
await page.route("https://*.supabase.co/**", (route) => route.abort());
await page.route("https://marmota.me/**", (route) => {
  const n = route.request().url().includes("superman-36") ? 36 : 35;
  return route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}.reading-content{max-width:500px;margin:auto}img{display:block;width:100%;height:750px}a{display:block;height:50px}</style></head><body><div class="chapter-selection" data-chapter="superman-${n}"></div><div class="reading-content">${Array.from({ length: 4 }, (_, i) => `<img class="wp-manga-chapter-img" id="p${i}" src="data:image/png;base64,${image}">`).join("")}</div><a class="next_page" href="https://marmota.me/comic/superman-2023/superman-${n + 1}/">Next</a></body></html>`,
  });
});
await context.addInitScript(
  ({ comic, key }) => {
    if (
      location.hostname === "127.0.0.1" &&
      !sessionStorage.getItem("web-test-init")
    ) {
      localStorage.setItem(
        key,
        JSON.stringify({ version: 1, series: [comic] }),
      );
      sessionStorage.setItem("web-test-init", "1");
    }
    window.addEventListener("message", (event) => {
      if (event.data?.type === "panelverse:init")
        window.testChannel = event.data.channel;
    });
  },
  { comic, key },
);
await context.addInitScript({ content: bridge });
const base = process.env.READER_TEST_URL || "http://127.0.0.1:4174/";
await page.goto(base);
await page.locator("a[data-web-series]").first().click();
await page.locator("#web-reader").waitFor({ state: "visible" });
await page.waitForFunction(
  () => document.querySelector("#web-setup").open === false,
);
let frame = page.frames().find((f) => f.url().includes("marmota.me/comic/"));
assert.ok(frame);
await frame.locator("#p1").evaluate((el) => el.scrollIntoView());
await page.waitForFunction(
  (key) =>
    new URL(
      JSON.parse(localStorage.getItem(key)).series[0].url,
    ).searchParams.get("panelversePage") === "1",
  key,
);
assert.equal(
  await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)).series[0].lastRead,
    key,
  ),
  0,
);
// A report from the right frame but for a different series must be ignored.
await frame.evaluate(() =>
  parent.postMessage(
    {
      type: "panelverse:location",
      version: 1,
      channel: window.testChannel,
      url: "https://marmota.me/comic/another/issue-99/",
      page: 1,
      pages: 4,
      chapter: 99,
      completed: true,
    },
    "http://127.0.0.1:4174",
  ),
);
await page.waitForFunction(() =>
  document.querySelector("#web-reader-state").textContent.includes("ignorado"),
);
assert.equal(
  await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)).series[0].lastRead,
    key,
  ),
  0,
);
await frame.locator("#p3").evaluate((el) => {
  window.scrollTo(0, document.body.scrollHeight);
});
await page.waitForFunction(
  (key) => JSON.parse(localStorage.getItem(key)).series[0].lastRead === 35,
  key,
);
assert.ok(
  (
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)).series[0].url,
      key,
    )
  ).includes("superman-36"),
);
const nextNavigation = page.waitForEvent("framenavigated", {
  predicate: (f) => f.url().includes("superman-36"),
});
await frame.locator("a.next_page").click();
await nextNavigation;
await page.waitForFunction(
  () => document.querySelector("#web-setup").open === false,
);
frame = page.frames().find((f) => f.url().includes("superman-36"));
assert.ok(frame);
await frame.locator("#p2").evaluate((el) => el.scrollIntoView());
await page.waitForFunction(
  (key) =>
    new URL(
      JSON.parse(localStorage.getItem(key)).series[0].url,
    ).searchParams.get("panelversePage") === "2",
  key,
);
await page.locator("#web-close").click();
await page.reload();
await page.locator("a[data-web-series]").first().click();
await page.waitForFunction(
  () => document.querySelector("#web-setup").open === false,
);
frame = page.frames().find((f) => f.url().includes("superman-36"));
await page.waitForFunction(
  (key) =>
    new URL(
      JSON.parse(localStorage.getItem(key)).series[0].url,
    ).searchParams.get("panelversePage") === "2",
  key,
);
await frame.waitForFunction(
  () =>
    Math.abs(document.getElementById("p2").getBoundingClientRect().top) < 20,
);
await page.setViewportSize({ width: 390, height: 844 });
assert.ok(
  await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
);
await mkdir("work", { recursive: true });
await page.screenshot({ path: "work/web-reader-mobile.png" });
await page.locator("#web-setup summary").click();
const download = page.waitForEvent("download");
await page.locator("#web-script-download").click();
const file = await download;
const script = await readFile(await file.path(), "utf8");
assert.match(script, /\/\/ @match\s+https:\/\/marmota\.me\/\*/);
assert.ok(!script.includes("@match        *://*/*"));
await page.locator("#web-close").click();
await context.route("https://comics.example/**", (route) =>
  route.fulfill({
    contentType: "text/html",
    headers: { "Content-Security-Policy": "frame-ancestors 'none'" },
    body: `<!doctype html><style>body{margin:0}img{display:block;width:400px;height:600px}</style><div id="readerarea">${Array.from({ length: 3 }, (_, i) => `<img id="other${i}" src="data:image/png;base64,${image}">`).join("")}</div>`,
  }),
);
await page.evaluate(
  ({ comic, key }) => {
    const data = JSON.parse(localStorage.getItem(key));
    data.series.push({
      ...comic,
      id: "other-web",
      title: "Otra web",
      url: "https://comics.example/series/other/issue-8/",
    });
    localStorage.setItem(key, JSON.stringify(data));
  },
  { comic, key },
);
await page.reload();
await page.locator('a[data-web-series="other-web"]').first().click();
const popupPromise = page.waitForEvent("popup");
await page.locator("#web-popup").click();
const popup = await popupPromise;
await popup.waitForLoadState();
await popup.bringToFront();
await page.waitForFunction(
  () => document.querySelector("#web-setup").open === false,
);
assert.equal(await popup.evaluate(() => window.opener), null);
await popup.locator("#other1").evaluate((el) => el.scrollIntoView());
await page.waitForFunction(
  (key) =>
    new URL(
      JSON.parse(localStorage.getItem(key)).series.find(
        (s) => s.id === "other-web",
      ).url,
    ).searchParams.get("panelversePage") === "1",
  key,
);
await page.locator("#web-close").click();
assert.equal(
  await page.locator("#web-reader").evaluate((el) => el.open),
  false,
);
await popup.close();
await page.evaluate(() =>
  window.dispatchEvent(
    new CustomEvent("panelverse:account-changed", {
      detail: { userId: "11111111-1111-4111-8111-111111111111" },
    }),
  ),
);
assert.equal(
  await page.locator("#web-reader").evaluate((el) => el.open),
  false,
);
assert.deepEqual(errors, []);
await browser.close();
console.log(
  "PASS: cross-origin bridge, visible page, chapter completion, real next link, navigation, resume after reload, scoped messages, script download, mobile, another site with blocked frames via a connected tab, account change (synthetic content).",
);
