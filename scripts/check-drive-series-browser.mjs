import { chromium } from "playwright";
import { ZipWriter, BlobWriter, Uint8ArrayReader } from "@zip.js/zip.js";
import { pageFiles } from "../test/helpers/comics.js";
import { seed } from "../src/model.js";
import { fileSeriesUrl } from "../src/series-files-model.js";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

// Los archivos son imágenes de prueba propias. Google y Supabase se simulan:
// esta comprobación no abre cómics ni cuentas personales.
const writer = new ZipWriter(new BlobWriter());
for (const [name, data] of pageFiles())
  await writer.add(name, new Uint8ArrayReader(data));
const cbz = Buffer.from(await (await writer.close()).arrayBuffer());
const url = process.env.READER_TEST_URL || "http://127.0.0.1:4185/";
for (let attempt = 0; attempt < 100; attempt++) {
  try {
    if ((await fetch(url)).ok) break;
  } catch {}
  if (attempt === 99)
    throw new Error("Sirve PanelVerse antes de ejecutar esta prueba.");
  await new Promise((resolve) => setTimeout(resolve, 100));
}
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
  args: ["--no-sandbox"],
});
const errors = [],
  requests = [];
let fresh = false,
  expired = false,
  denied = false;
const comic = (id, name) => ({
  id,
  name,
  size: String(cbz.length),
  modifiedTime: "2026-11-16T10:00:00Z",
});
const makeSeries = (id, title) => {
  const item = { ...seed[0], id, title, cover: "", url: "" };
  return { ...item, url: fileSeriesUrl(item) };
};
const a = makeSeries("drive-saga-a", "Saga A"),
  b = makeSeries("drive-saga-b", "Saga B");
b.url = fileSeriesUrl(b, { driveFolder: "folder-b", driveRecursive: false });

async function device(library) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 960 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.stack));
  await context.route("https://*.supabase.co/**", (route) => route.abort());
  await context.route(
    "https://www.googleapis.com/drive/v3/**",
    async (route) => {
      const request = route.request(),
        target = new URL(request.url());
      requests.push(request.method());
      if (expired)
        return route.fulfill({ status: 401, json: { error: "expired" } });
      if (denied)
        return route.fulfill({ status: 403, json: { error: "permission" } });
      if (target.searchParams.get("alt") === "media")
        return route.fulfill({ body: cbz, contentType: "application/zip" });
      if (/\/files\/folder-[ab]$/.test(target.pathname))
        return route.fulfill({
          json: {
            id: target.pathname.split("/").pop(),
            mimeType: "application/vnd.google-apps.folder",
          },
        });
      const query = target.searchParams.get("q") || "";
      const files =
        query.includes("mimeType =") && !query.includes("'root'")
          ? []
          : query.includes("'folder-a'")
            ? [
                comic("a1", "Saga A #001.cbz"),
                comic("a2", "Saga A #002.cbz"),
                ...(fresh ? [comic("a3", "Saga A #003.cbz")] : []),
              ]
            : query.includes("'folder-b'")
              ? [comic("b1", "Saga B #001.cbz")]
              : [
                  {
                    id: "folder-a",
                    name: "Saga A",
                    mimeType: "application/vnd.google-apps.folder",
                  },
                  {
                    id: "folder-b",
                    name: "Saga B",
                    mimeType: "application/vnd.google-apps.folder",
                  },
                ];
      return route.fulfill({ json: { files } });
    },
  );
  await context.addInitScript((snapshot) => {
    if (!sessionStorage.getItem("drive-series-init")) {
      localStorage.setItem("panelverse.library.v1", JSON.stringify(snapshot));
      sessionStorage.setItem("drive-series-init", "1");
    }
  }, library);
  await page.goto(url);
  return { context, page };
}
const connect = (page) =>
  page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("panelverse:auth-session", {
        detail: { token: "synthetic-drive-token" },
      }),
    ),
  );
const openSeries = (page, id) =>
  page.locator(`#grid [data-files-series="${id}"]`).click();
const openDrive = async (page) => {
  if (
    !(await page
      .locator("#series-drive-panel")
      .evaluate((element) => element.open))
  )
    await page.locator("#series-drive-panel summary").click();
};
const waitIssues = (page, count) =>
  page.waitForFunction(
    (n) => document.querySelectorAll(".series-issue").length === n,
    count,
  );

try {
  const first = await device({ version: 1, series: [a, b] }),
    page = first.page;
  await openSeries(page, a.id);
  await openDrive(page);
  await page
    .locator("#series-drive-folder")
    .fill("https://drive.google.com/drive/folders/folder-a");
  await page.locator("#series-drive-recursive").uncheck();
  await page.locator("#series-drive-form button[type=submit]").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#series-drive-status")
      .textContent.includes("Carpeta guardada"),
  );
  await connect(page);
  await waitIssues(page, 2);
  assert.equal(await page.locator("#reader-count").textContent(), "3");
  assert.equal(await page.locator("#series-drive-connect").isVisible(), false);
  await page.locator("#series-drive-browse").click();
  await page
    .locator("#drive-folders button")
    .filter({ hasText: "Saga A" })
    .click();
  await page.locator("#drive-use-current").click();
  await page.locator("#drive-folder-form button[type=submit]").click();
  await page.locator("#drive-folder-dialog").waitFor({ state: "hidden" });
  await waitIssues(page, 2);
  await page.locator("#series-issues [data-close]").click();
  await openSeries(page, b.id);
  await openDrive(page);
  await page.locator("#series-drive-folder").fill("folder-a");
  await page.locator("#series-drive-form button[type=submit]").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#series-issues-message")
      .textContent.includes("ya está vinculada"),
  );
  assert.equal(await page.locator(".series-issue").count(), 1);
  await page.locator("#series-issues [data-close]").click();
  await openSeries(page, a.id);
  await openDrive(page);

  // Una corrección manual de numeración no cambia al volver a consultar Drive.
  await page.locator('[data-issue-number="drive-a1"]').fill("7");
  await page.locator('[data-issue-number="drive-a1"]').dispatchEvent("change");
  await page.waitForFunction(
    () =>
      document.querySelector('[data-issue-number="drive-a1"]').value === "7",
  );
  await page.locator("#series-issues [data-close]").click();
  await page
    .locator(`#grid [data-action="details"][data-id="${a.id}"]`)
    .first()
    .click();
  await page.locator('#details [data-action="edit"]').click();
  await page.locator('#series-form [name="status"]').selectOption("finished");
  await page.locator('#series-form button[type="submit"]').click();
  await page.locator("#editor").waitFor({ state: "hidden" });
  await page.locator("#series-issues").waitFor({ state: "visible" });
  await openDrive(page);
  fresh = true;
  await page.locator("#series-drive-sync").click();
  await waitIssues(page, 3);
  assert.equal(
    await page.locator('[data-issue-number="drive-a1"]').inputValue(),
    "7",
  );
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("panelverse.library.v1")).series.find(
        (item) => item.id === "drive-saga-a",
      ).status === "reading",
  );

  // Retirar un número manualmente debe prevalecer sobre la regla automática.
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('[data-issue-unlink="drive-a1"]').click();
  await waitIssues(page, 2);
  await page.locator("#series-drive-sync").click();
  await page.waitForFunction(
    () => !document.querySelector("#series-drive-sync").disabled,
  );
  assert.equal(await page.locator(".series-issue").count(), 2);
  assert.equal(await page.locator("#reader-count").textContent(), "4");

  await page.locator('[data-issue-open="drive-a2"]').click();
  await page.locator("#comic-viewport img").waitFor();
  await page.locator("#comic-range").fill("1");
  await page.locator("#comic-range").dispatchEvent("change");
  await page.waitForFunction(
    () =>
      new URL(
        JSON.parse(localStorage.getItem("panelverse.library.v1")).series.find(
          (item) => item.id === "drive-saga-a",
        ).url,
      ).searchParams.get("page") === "1",
  );
  await page.locator("#comic-close").click();
  const snapshot = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("panelverse.library.v1")),
  );
  await first.context.close();

  // Otro navegador recibe solo la biblioteca: el catálogo y las vinculaciones
  // se reconstruyen desde las carpetas, sin copiar IndexedDB ni sus descargas.
  const second = await device(snapshot),
    other = second.page;
  await connect(other);
  await openSeries(other, a.id);
  await waitIssues(other, 3);
  await other.locator('[data-issue-open="drive-a2"]').click();
  await other.waitForFunction(
    () => document.querySelector("#comic-range").value === "1",
  );
  await other.locator("#comic-close").click();
  await other.locator("#series-issues [data-close]").click();
  await other.locator("#reader-nav").click();
  await other
    .locator('[data-read-action="open"][data-id="drive-a2"]')
    .first()
    .click();
  await other.waitForFunction(
    () => document.querySelector("#comic-range").value === "1",
  );
  await other.locator("#comic-close").click();
  await other.locator('[data-filter="all"]').click();
  await openSeries(other, a.id);
  await other.setViewportSize({ width: 390, height: 844 });
  assert(
    await other.evaluate(
      () => document.querySelector("#series-issues").scrollWidth <= innerWidth,
    ),
  );
  await mkdir("work", { recursive: true });
  await other.screenshot({ path: "work/drive-series-mobile.png" });
  await openDrive(other);

  denied = true;
  await other.locator("#series-drive-sync").click();
  await other.waitForFunction(() =>
    document
      .querySelector("#series-issues-message")
      .textContent.includes("Drive no permite acceder"),
  );
  assert.equal(await other.locator(".series-issue").count(), 3);
  await other.locator("#series-drive-connect").waitFor({ state: "visible" });
  denied = false;
  await other.locator("#series-drive-sync").click();
  await other.waitForFunction(
    () => !document.querySelector("#series-drive-sync").disabled,
  );

  expired = true;
  await other.locator("#series-drive-sync").click();
  await other.locator("#series-drive-connect").waitFor({ state: "visible" });
  assert.equal(await other.locator(".series-issue").count(), 3);
  expired = false;
  await connect(other);
  await other.waitForFunction(
    () => !document.querySelector("#series-drive-sync").disabled,
  );
  await other.locator("#series-drive-unlink").click();
  await other.locator("#series-drive-unlink").waitFor({ state: "hidden" });
  assert.equal(await other.locator(".series-issue").count(), 3);
  assert.equal(await other.locator("#reader-count").textContent(), "4");
  // OAuth puede entregar el permiso mientras IndexedDB aún está cargando la
  // cuenta. La consulta de Drive debe esperar para no borrar datos locales.
  const preserved = await other.evaluate(async () => {
    const storage = await import(
      new URL("./src/reader-store.js", location.href).href
    );
    const owner = "11111111-1111-4111-8111-111111111111";
    const book = (await storage.readerBooks(null)).find(
      (item) => item.id === "drive-b1",
    );
    await storage.readerPut("books", owner, book.id, {
      ...book,
      page: 1,
      bookmarks: [1],
    });
    localStorage.setItem(
      "panelverse.library.v1.user." + owner,
      localStorage.getItem("panelverse.library.v1"),
    );
    window.dispatchEvent(
      new CustomEvent("panelverse:account-changed", {
        detail: { userId: owner },
      }),
    );
    window.dispatchEvent(
      new CustomEvent("panelverse:auth-session", {
        detail: { token: "synthetic-drive-token" },
      }),
    );
    return owner;
  });
  await other.waitForFunction(
    () =>
      document.querySelector("#reader-count").textContent === "1" &&
      !document.querySelector("#drive-sync").disabled,
  );
  const restored = await other.evaluate(async (owner) => {
    const storage = await import(
      new URL("./src/reader-store.js", location.href).href
    );
    return storage.readerGet("books", owner, "drive-b1");
  }, preserved);
  assert.equal(restored.page, 1);
  assert.deepEqual(restored.bookmarks, [1]);
  assert.deepEqual(errors, []);
  assert(requests.length > 0 && requests.every((method) => method === "GET"));
  await second.context.close();
  console.log(
    "PASS: carpeta por serie, varios catálogos, números nuevos, correcciones, exclusión manual, recuperación en otro navegador, reanudación desde Lector, móvil, permiso caducado, desvinculación y Drive solo GET.",
  );
} finally {
  await browser.close();
}
