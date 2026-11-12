import { httpUrl } from "./model.js";
import { naturalOrder } from "./reader-model.js";
export const FILE_LIBRARY_URL =
  "https://guillermogarcia137.github.io/panelverse/";
// Reconoce los enlaces internos de una serie descargada y recupera sus datos de reanudación.
export function fileSeriesInfo(series) {
  try {
    const url = new URL(series.url),
      base = new URL(FILE_LIBRARY_URL);
    if (
      url.origin !== base.origin ||
      url.pathname !== base.pathname ||
      url.searchParams.get("pvCollection") !== series.id
    )
      return null;
    const number = (key) => {
      const value = Number(url.searchParams.get(key));
      return Number.isInteger(value) && value >= 0 && value <= 99999
        ? value
        : 0;
    };
    const book = url.searchParams.get("book");
    return {
      book: book && /^[\w-]{1,150}$/.test(book) ? book : null,
      page: Math.min(number("page"), 3999),
      issue: number("issue"),
      web: url.searchParams.get("web") || "",
    };
  } catch {
    return null;
  }
}
// Guarda número, archivo y página en un enlace interno compatible con el esquema de sincronización existente.
// La nube recibe esa referencia de lectura; los bytes del CBR/CBZ siguen en el navegador o en Drive.
export function fileSeriesUrl(
  series,
  { book = null, page = 0, issue = 0 } = {},
) {
  const old = fileSeriesInfo(series),
    url = new URL(FILE_LIBRARY_URL);
  url.searchParams.set("pvCollection", series.id);
  const website = old ? old.web : series.url;
  if (website) url.searchParams.set("web", httpUrl(website));
  if (book) {
    url.searchParams.set("book", book);
    url.searchParams.set("page", String(page));
    url.searchParams.set("issue", String(issue));
  }
  return httpUrl(url.href);
}
// Selecciona los archivos vinculados a una serie y los ordena por número.
export function seriesBooks(books, seriesId) {
  return books
    .filter((b) => b.seriesId === seriesId)
    .sort(
      (a, b) => (a.issue || 0) - (b.issue || 0) || naturalOrder(a.name, b.name),
    );
}
// Propone un número a partir del nombre del archivo; es una ayuda y se puede corregir al vincularlo.
export function guessIssue(name) {
  const title = name.replace(/\.(cbr|cbz)$/i, "");
  const explicit = title.match(/#\s*(\d{1,5})(?![\d.])/);
  const plain = title.match(/(?:^|[\s_-])(\d{1,5})\s*$/);
  const value = Number(explicit?.[1] || plain?.[1]);
  return value >= 1 &&
    value <= 99999 &&
    (!plain || explicit || value < 1900 || value > 2100)
    ? value
    : null;
}
// Vincula archivos seleccionados asignando números sin duplicar los que ya usa la serie.
export function assignIssues(books, selected, seriesId, resume = null) {
  const ids = new Set(selected),
    used = new Set(
      seriesBooks(books, seriesId)
        .filter((b) => !ids.has(b.id))
        .map((b) => b.issue),
    );
  const incoming = books
    .filter((b) => ids.has(b.id))
    .sort((a, b) => naturalOrder(a.name, b.name));
  if (incoming.length !== ids.size)
    throw new Error("Uno de los archivos ya no está disponible.");
  return incoming.map((book) => {
    let issue =
      book.seriesId === seriesId
        ? book.issue
        : resume?.book === book.id
          ? resume.issue
          : guessIssue(book.name);
    if (!issue || used.has(issue)) {
      issue = 1;
      while (used.has(issue)) issue++;
    }
    if (issue > 99999) throw new Error("No quedan números disponibles.");
    used.add(issue);
    return { ...book, seriesId, issue };
  });
}
// Elige el archivo para continuar: prioriza la referencia guardada y después busca el siguiente pendiente.
export function nextSeriesBook(series, books) {
  const list = seriesBooks(books, series.id),
    info = fileSeriesInfo(series);
  return (
    list.find((b) => b.id === info?.book && !b.finished) ||
    list.find((b) => !b.finished) ||
    list.at(-1) ||
    null
  );
}
// Convierte páginas de un archivo en progreso de una serie sin retroceder números ya terminados.
// La serie figura terminada si todos sus archivos están leídos; cuando hay un total configurado también debe haberse alcanzado.
export function fileSeriesProgress(series, book, books) {
  const info = fileSeriesInfo(series),
    wasCurrent = info?.book === book.id;
  const lastRead =
    book.finished && (!series.total || book.issue <= series.total)
      ? Math.max(series.lastRead, book.issue)
      : series.lastRead;
  const linked = seriesBooks(books, series.id),
    allFinished = linked.length > 0 && linked.every((b) => b.finished);
  const status =
    allFinished && (!series.total || lastRead >= series.total)
      ? "finished"
      : "reading";
  const url = fileSeriesUrl(series, {
    book: book.id,
    page: book.page,
    issue: book.issue,
  });
  if (
    wasCurrent &&
    info.page === book.page &&
    lastRead === series.lastRead &&
    status === series.status &&
    series.url === url
  )
    return null;
  return {
    ...series,
    lastRead,
    status,
    url,
    updatedAt: new Date().toISOString(),
  };
}
