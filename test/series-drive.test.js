import test from "node:test";
import assert from "node:assert/strict";
import {
  fileSeriesInfo,
  fileSeriesUrl,
  fileSeriesProgress,
  nextSeriesBook,
} from "../src/series-files-model.js";
import {
  seriesDriveFolders,
  automaticDriveIssues,
} from "../src/series-drive-model.js";
import { reconcileDrive } from "../src/reader-model.js";
import { parseBackup, seed } from "../src/model.js";
const series = (id, folder, recursive = true) => {
  const item = { ...seed[0], id, title: id, url: "" };
  item.url = fileSeriesUrl(item, {
    driveFolder: folder,
    driveRecursive: recursive,
  });
  return item;
};
const book = (id, parent, ancestors = [parent]) => ({
  id: "drive-" + id,
  name: `Saga #${id.replace(/\D/g, "") || 1}.cbz`,
  source: "drive",
  page: 0,
  driveParent: parent,
  driveAncestors: ancestors,
});

test("la carpeta y la opción de subcarpetas sobreviven al progreso y a las copias v1", () => {
  const item = series("saga", "folder-a", false);
  const linked = {
    ...book("001", "folder-a"),
    seriesId: item.id,
    issue: 1,
    pages: 8,
    page: 3,
  };
  const progress = fileSeriesProgress(item, linked, [linked]);
  const restored = parseBackup(
    JSON.stringify({ version: 1, series: [progress] }),
  )[0];
  const info = fileSeriesInfo(restored);
  assert.equal(info.driveFolder, "folder-a");
  assert.equal(info.driveRecursive, false);
  assert.equal(info.page, 3);
  assert.equal(info.completed, false);
  const unbound = {
    ...restored,
    url: fileSeriesUrl(restored, { ...info, driveFolder: null }),
  };
  assert.equal(fileSeriesInfo(unbound).driveFolder, null);
  assert.equal(fileSeriesInfo(unbound).page, 3);
  assert.throws(() =>
    fileSeriesUrl(item, { driveFolder: "https://evil.test/not-a-folder" }),
  );
});

test("Drive deduplica consultas y asocia por id de carpeta sin mezclar series", () => {
  const a = series("a", "folder-a"),
    b = series("b", "folder-b");
  const books = [
    book("001", "folder-a"),
    book("002", "folder-a"),
    book("003", "folder-b"),
    { ...book("004", "folder-a"), seriesId: "manual", issue: 9 },
    { ...book("005", "folder-a"), missing: true },
    { ...book("006", "folder-a"), excludedSeries: ["a"] },
  ];
  const updates = automaticDriveIssues([a, b], books);
  assert.deepEqual(
    updates.map((x) => [x.id, x.seriesId, x.issue]),
    [
      ["drive-001", "a", 1],
      ["drive-002", "a", 2],
      ["drive-003", "b", 3],
    ],
  );
  assert.equal(books[0].seriesId, undefined);
  assert.deepEqual(seriesDriveFolders([a, b, series("c", "folder-a", false)]), [
    { folder: "folder-a", recursive: true },
    { folder: "folder-b", recursive: true },
  ]);
});

test("la regla más cercana gana en carpetas anidadas y respeta excluir subcarpetas", () => {
  const parent = series("parent", "folder-a"),
    child = series("child", "folder-b");
  const nested = book("007", "folder-b", ["folder-a", "folder-b"]);
  assert.equal(
    automaticDriveIssues([parent, child], [nested])[0].seriesId,
    "child",
  );
  assert.equal(
    automaticDriveIssues([series("parent", "folder-a", false)], [nested])
      .length,
    0,
  );
  assert.equal(
    automaticDriveIssues([parent, series("duplicate", "folder-a")], [nested])
      .length,
    0,
  );
});

test("los números nuevos respetan las correcciones manuales y evitan duplicados", () => {
  const item = series("a", "folder-a");
  const old = {
    ...book("001", "folder-a"),
    seriesId: "a",
    issue: 12,
    page: 4,
    bookmarks: [2],
    finished: true,
  };
  const fresh = { ...book("002", "folder-a"), name: "Saga #012 variante.cbz" };
  const updates = automaticDriveIssues([item], [old, fresh]);
  assert.equal(updates[0].issue, 1);
  assert.equal(updates.length, 1);
  assert.equal(old.issue, 12);
  assert.equal(old.page, 4);
  assert.deepEqual(old.bookmarks, [2]);
});

test("recuperar el catálogo en otro dispositivo recupera el número actual por su id estable", () => {
  let item = series("a", "folder-a");
  item = {
    ...item,
    url: fileSeriesUrl(item, {
      book: "drive-002",
      page: 5,
      issue: 8,
      completed: false,
    }),
  };
  const restored = automaticDriveIssues([item], [book("002", "folder-a")]);
  assert.equal(restored[0].issue, 8);
  assert.equal(nextSeriesBook(item, restored).id, "drive-002");
  assert.equal(fileSeriesInfo(item).page, 5);
  // Una marca local vieja no debe ocultar la lectura en curso de la cuenta.
  assert.equal(
    nextSeriesBook(item, [{ ...restored[0], finished: true }]).id,
    "drive-002",
  );
});

test("una lectura completada en la cuenta permite pasar al siguiente número recuperado", () => {
  const base = series("a", "folder-a");
  const item = {
    ...base,
    url: fileSeriesUrl(base, {
      book: "drive-001",
      page: 5,
      issue: 1,
      completed: true,
    }),
  };
  const recovered = automaticDriveIssues(
    [item],
    [book("001", "folder-a"), book("002", "folder-a")],
  );
  assert.equal(nextSeriesBook(item, recovered).id, "drive-002");
  const later = {
    ...base,
    url: fileSeriesUrl(base, {
      book: "drive-002",
      page: 5,
      issue: 2,
      completed: true,
    }),
  };
  const catalog = automaticDriveIssues(
    [later],
    [book("001", "folder-a"), book("002", "folder-a"), book("003", "folder-a")],
  );
  assert.equal(nextSeriesBook(later, catalog).id, "drive-003");
});

test("el catálogo detecta desapariciones aunque antes se consultara desde una subcarpeta", () => {
  const previous = {
    ...book("001", "folder-b", ["folder-a", "folder-b"]),
    root: "folder-b",
    favorite: true,
    page: 7,
  };
  const next = reconcileDrive([previous], [], "folder-a");
  assert.equal(next[0].missing, true);
  assert.equal(next[0].page, 7);
  assert.equal(next[0].favorite, true);
  assert.equal(
    reconcileDrive([previous], [], "folder-a", { recursive: false })[0].missing,
    undefined,
  );
  assert.equal(previous.missing, undefined);
});
