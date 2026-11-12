import test from "node:test";
import assert from "node:assert/strict";
import {
  fileSeriesInfo,
  fileSeriesUrl,
  assignIssues,
  guessIssue,
  seriesBooks,
  nextSeriesBook,
  fileSeriesProgress,
} from "../src/series-files-model.js";
import { validateSeries, parseBackup, seed } from "../src/model.js";
import {
  emptySyncState,
  editLibrary,
  visibleSeries,
} from "../src/sync-model.js";
const series = () => {
  const s = { ...seed[0], id: "files-series", title: "Saga", url: "" };
  s.url = fileSeriesUrl(s);
  return s;
};
const books = () => [
  { id: "local-a", name: "Saga #002.cbz", page: 1, pages: 5, finished: false },
  { id: "local-b", name: "Saga #001.cbr", page: 0, pages: 5, finished: false },
];
test("una serie de archivos tiene un enlace real y conserva el enlace web al cambiar de fuente", () => {
  const fromWeb = { ...seed[0], url: fileSeriesUrl(seed[0]) };
  assert.equal(fileSeriesInfo(fromWeb).web, seed[0].url);
  assert.equal(
    fileSeriesInfo({
      ...fromWeb,
      url: "https://evil.test/?pvCollection=superman-2023",
    }),
    null,
  );
  assert.equal(fileSeriesInfo({ ...fromWeb, id: "other" }), null);
  assert.equal(fileSeriesInfo(series()).web, "");
  assert.doesNotThrow(() => validateSeries(series()));
});
test("asigna los números por nombre, sin duplicados ni confundir el año", () => {
  assert.equal(guessIssue("Saga (2023).cbz"), null);
  assert.equal(guessIssue("Saga 2023.cbz"), null);
  assert.equal(guessIssue("Saga #003.cbz"), 3);
  const linked = assignIssues(books(), ["local-a", "local-b"], "files-series");
  assert.deepEqual(
    linked.map((b) => b.issue),
    [1, 2],
  );
  const third = { id: "local-c", name: "Saga #002 variante.cbz" };
  const all = linked.concat(third);
  assert.equal(assignIssues(all, ["local-c"], "files-series")[0].issue, 3);
  assert.equal(books()[0].seriesId, undefined);
  assert.throws(() => assignIssues(books(), ["missing"], "files-series"));
});
test("reanuda el número en curso, después el siguiente sin leer, conservando la página y el progreso", () => {
  let s = series();
  const list = assignIssues(books(), ["local-a", "local-b"], s.id),
    first = list[0],
    second = list[1];
  const updated = fileSeriesProgress(s, { ...first, page: 2 }, list);
  assert.equal(updated.lastRead, 0);
  assert.equal(fileSeriesInfo(updated).page, 2);
  assert.equal(nextSeriesBook(updated, list).id, first.id);
  first.finished = true;
  const done = fileSeriesProgress(updated, first, list);
  assert.equal(done.lastRead, 1);
  assert.equal(done.status, "reading");
  assert.equal(nextSeriesBook(done, list).id, second.id);
  second.finished = true;
  const finished = fileSeriesProgress(done, second, list);
  assert.equal(finished.status, "finished");
  assert.equal(finished.lastRead, 2);
});
test("el progreso no retrocede al releer ni supera un total configurado", () => {
  const s = { ...series(), lastRead: 40, total: 50 };
  const b = { ...books()[0], seriesId: s.id, issue: 2, finished: true };
  assert.equal(fileSeriesProgress(s, b, [b]).lastRead, 40);
  assert.equal(
    fileSeriesProgress({ ...s, total: 40 }, { ...b, issue: 41 }, [b]).lastRead,
    40,
  );
});
test("las copias y la cola de sincronización existentes conservan la referencia de número y página", () => {
  const s = series(),
    b = { ...books()[0], seriesId: s.id, issue: 2 };
  const updated = fileSeriesProgress(s, b, [b]);
  assert.deepEqual(
    parseBackup(JSON.stringify({ version: 1, series: [updated] })),
    [updated],
  );
  const owner = "11111111-1111-4111-8111-111111111111";
  const next = editLibrary(emptySyncState(owner), [], [updated]);
  assert.equal(fileSeriesInfo(visibleSeries(next)[0]).book, b.id);
  assert.equal(next.pending[0].data.url, updated.url);
});
test("reimportar el mismo identificador permite recuperar la numeración de otro dispositivo", () => {
  const s = series(),
    book = books()[0],
    url = fileSeriesUrl(s, { book: book.id, page: 4, issue: 12 });
  const linked = assignIssues(
    [book],
    [book.id],
    s.id,
    fileSeriesInfo({ ...s, url }),
  );
  assert.equal(linked[0].issue, 12);
  assert.equal(seriesBooks(linked, s.id).length, 1);
});
test("leer el último número fuera de orden no termina una serie con números pendientes", () => {
  const s = { ...series(), total: 2 },
    list = assignIssues(books(), ["local-a", "local-b"], s.id);
  list[1].finished = true;
  const progress = fileSeriesProgress(s, list[1], list);
  assert.equal(progress.lastRead, 2);
  assert.equal(progress.status, "reading");
  list[0].finished = true;
  assert.equal(fileSeriesProgress(progress, list[0], list).status, "finished");
});
