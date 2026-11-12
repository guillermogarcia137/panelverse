import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanReadingUrl,
  readingPage,
  readingScope,
  validateWebLocation,
  applyWebLocation,
} from "../src/web-progress.js";
import { seed, validateSeries, parseBackup } from "../src/model.js";
const url = "https://marmota.me/comic/superman-2023/superman-35/";
const scope = readingScope(url);
const event = () => ({
  type: "panelverse:location",
  version: 1,
  url,
  page: 3,
  pages: 32,
  chapter: 35,
  completed: false,
  next: "https://marmota.me/comic/superman-2023/superman-36/",
});
test("una página visible guarda el enlace exacto sin marcar el capítulo terminado", () => {
  const update = applyWebLocation(seed[0], validateWebLocation(event(), scope));
  assert.equal(update.lastRead, 0);
  assert.equal(update.status, "reading");
  assert.equal(readingPage(update.url), 3);
  assert.equal(cleanReadingUrl(update.url), url);
  assert.deepEqual(
    parseBackup(JSON.stringify({ version: 1, series: [update] })),
    [validateSeries(update)],
  );
});
test("solo completar el capítulo actualiza el número y usa el siguiente enlace observado", () => {
  const update = applyWebLocation(
    seed[0],
    validateWebLocation({ ...event(), completed: true, page: 31 }, scope),
  );
  assert.equal(update.lastRead, 35);
  assert.equal(
    update.url,
    "https://marmota.me/comic/superman-2023/superman-36/?panelversePage=0",
  );
});
test("releer no reduce los números completados y los totales siguen siendo válidos", () => {
  const data = validateWebLocation(
    { ...event(), completed: true, page: 31 },
    scope,
  );
  const old = { ...seed[0], lastRead: 40 };
  assert.equal(applyWebLocation(old, data).lastRead, 40);
  assert.equal(
    applyWebLocation({ ...old, lastRead: 10, total: 20 }, data).lastRead,
    10,
  );
  assert.equal(
    applyWebLocation({ ...old, lastRead: 34, total: 35 }, data).status,
    "finished",
  );
});
test("no inventa números en capítulos ambiguos ni acepta otra serie, dominio o protocolos", () => {
  const update = applyWebLocation(
    seed[0],
    validateWebLocation(
      {
        ...event(),
        chapter: 35.5,
        completed: true,
        next: "https://evil.test/",
      },
      scope,
    ),
  );
  assert.equal(update.lastRead, 0);
  assert.equal(cleanReadingUrl(update.url), url);
  for (const value of [
    "https://marmota.me/comic/otro/capitulo-1/",
    "https://evil.test/comic/superman-2023/superman-35/",
    "javascript:alert(1)",
  ])
    assert.throws(() => validateWebLocation({ ...event(), url: value }, scope));
  for (const patch of [
    { page: -1 },
    { page: 32 },
    { pages: 10001 },
    { page: 1.5 },
    { version: 2 },
  ])
    assert.throws(() => validateWebLocation({ ...event(), ...patch }, scope));
});
test("otras webs mantienen su propio ámbito y conservan consultas y fragmentos nativos", () => {
  const other =
    "https://comics.example/series/ejemplo/issue-4/?style=long#reader";
  const data = validateWebLocation(
    { ...event(), url: other, next: null },
    readingScope(other),
  );
  const updated = applyWebLocation({ ...seed[0], url: other }, data);
  assert.equal(cleanReadingUrl(updated.url), other);
  assert.equal(readingPage(updated.url), 3);
  assert.equal(readingPage(other), 0);
});
