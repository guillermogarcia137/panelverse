import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as zip from "@zip.js/zip.js";
import unrar from "node-unrar-js";
import { makeRar, pageFiles } from "./helpers/comics.js";
import { openArchive } from "../src/reader-archive.js";
import {
  isComic,
  isPage,
  folderId,
  reconcileDrive,
  pageIndexes,
  MAX_ARCHIVE,
  MAX_PAGE,
} from "../src/reader-model.js";
import { DriveClient } from "../src/reader-drive.js";
const codecs = {
  ...zip,
  createExtractorFromData: unrar.createExtractorFromData,
};
const wasmBinary = await readFile(
  new URL("../node_modules/node-unrar-js/dist/js/unrar.wasm", import.meta.url),
);
async function makeZip(files = pageFiles()) {
  const writer = new zip.ZipWriter(new zip.BlobWriter());
  for (const [name, data] of files)
    await writer.add(name, new zip.Uint8ArrayReader(data));
  return writer.close();
}
test("CBZ real: orden natural, ignora metadatos, extrae las imágenes", async () => {
  const archive = await openArchive(await makeZip(), "Comic.cbz", { codecs });
  try {
    assert.deepEqual(archive.names, ["page1.png", "page2.png", "page10.png"]);
    assert.equal((await archive.page(0)).type, "image/png");
    assert.deepEqual(
      Buffer.from(await (await archive.page(2)).arrayBuffer()),
      pageFiles()[0][1],
    );
    await assert.rejects(() => archive.page(5));
  } finally {
    await archive.close();
  }
});
test("CBR real: extracción concurrente serializada y CRC correcto", async () => {
  const archive = await openArchive(new Blob([makeRar()]), "Comic.cbr", {
    codecs,
    wasmBinary,
  });
  assert.deepEqual(archive.names, ["page1.png", "page2.png", "page10.png"]);
  const pages = await Promise.all([archive.page(2), archive.page(0)]);
  assert.deepEqual(
    Buffer.from(await pages[0].arrayBuffer()),
    pageFiles()[0][1],
  );
  assert.deepEqual(
    Buffer.from(await pages[1].arrayBuffer()),
    pageFiles()[2][1],
  );
  await archive.close();
});
test("rechaza archivos vacíos, falsos, sin imágenes y excesivos", async () => {
  await assert.rejects(() =>
    openArchive(new Blob([]), "empty.cbz", { codecs }),
  );
  await assert.rejects(() =>
    openArchive(new Blob(["hello"]), "fake.cbr", { codecs }),
  );
  await assert.rejects(() => openArchive(awaitable, "huge.cbz", { codecs }));
});
const awaitable = { size: MAX_ARCHIVE + 1 };
test("rechaza ZIP sin páginas y página declarada demasiado grande", async () => {
  await assert.rejects(
    () =>
      makeZip([["notes.txt", Buffer.from("hello")]]).then((blob) =>
        openArchive(blob, "notes.cbz", { codecs }),
      ),
    /entre 1 y 4000/,
  );
  const fake = {
    ...codecs,
    ZipReader: class {
      async getEntries() {
        return [{ filename: "page.png", uncompressedSize: MAX_PAGE + 1 }];
      }
      async close() {}
    },
  };
  await assert.rejects(
    () => openArchive(new Blob(["PK12345"]), "huge.cbz", { codecs: fake }),
    /40 MB/,
  );
});
test("formatos, rutas de imágenes y selección de carpeta válida", () => {
  assert.ok(isComic("Comic.CBR"));
  assert.ok(!isComic("comic.pdf"));
  assert.ok(!isPage("__MACOSX/image.png"));
  assert.equal(
    folderId(
      "https://drive.google.com/drive/u/0/folders/abcde-123?usp=sharing",
    ),
    "abcde-123",
  );
  assert.equal(folderId("root"), "root");
  assert.throws(() => folderId("a' or true"));
  assert.throws(() => folderId("https://evil.test/folders/abcde"));
  assert.deepEqual(pageIndexes(0, 10, "double"), [0]);
  assert.deepEqual(pageIndexes(1, 10, "double"), [1, 2]);
  assert.deepEqual(pageIndexes(9, 10, "double"), [9]);
});
test("reconciliar Drive conserva progreso y favoritos; detecta versiones y ausencias", () => {
  const current = [
    {
      id: "drive-file1",
      source: "drive",
      root: "root1",
      page: 6,
      favorite: true,
      modifiedTime: "old",
      cachedVersion: "old",
      cover: "cover",
    },
    { id: "drive-file2", source: "drive", root: "root1", page: 3 },
    { id: "local-1", source: "local" },
  ];
  const next = reconcileDrive(
    current,
    [{ id: "file1", name: "A.CBZ", size: "12", modifiedTime: "new" }],
    "root1",
  );
  assert.equal(next[0].page, 6);
  assert.ok(next[0].favorite);
  assert.equal(next[0].cachedVersion, "old");
  assert.equal(next[0].cover, null);
  assert.ok(next[1].missing);
  assert.equal(next[2], current[2]);
  assert.equal(current[1].missing, undefined);
});
test("Drive pagina, recorre carpetas y solo incluye CBR/CBZ", async () => {
  let calls = [];
  const client = new DriveClient("test", {
    fetcher: async (url, options) => {
      calls.push({ url, options });
      const q = url.searchParams.get("q");
      let data;
      if (q.includes("'root'")) {
        data = url.searchParams.has("pageToken")
          ? { files: [{ id: "pdf", name: "ignore.pdf" }] }
          : {
              files: [
                {
                  id: "folder",
                  name: "Serie",
                  mimeType: "application/vnd.google-apps.folder",
                },
                { id: "a", name: "A.cbz" },
              ],
              nextPageToken: "next",
            };
      } else data = { files: [{ id: "b", name: "B.cbr" }] };
      return Response.json(data);
    },
  });
  const files = await client.scan("root");
  assert.deepEqual(
    files.map((f) => [f.id, f.collection]),
    [
      ["a", ""],
      ["b", "Serie"],
    ],
  );
  assert.equal(calls.length, 3);
  assert.ok(
    calls.every((c) => c.options.headers.Authorization === "Bearer test"),
  );
  assert.ok(calls.every((c) => !c.options.method));
});
test("Drive rechaza permiso caducado y descarga demasiado grande", async () => {
  const expired = new DriveClient("test", {
    fetcher: async () => new Response("", { status: 401 }),
  });
  await assert.rejects(() => expired.scan("root"), /caducado/);
  const large = new DriveClient("test", {
    fetcher: async () =>
      new Response("", {
        headers: { "content-length": String(MAX_ARCHIVE + 1) },
      }),
  });
  await assert.rejects(
    () => large.download({ driveId: "a", size: 0 }),
    /250 MB/,
  );
});
