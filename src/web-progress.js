import { httpUrl } from "./model.js";
export const WEB_PROTOCOL = 1;
// Quita parámetros reservados de PanelVerse antes de guardar o abrir la dirección externa.
export function cleanReadingUrl(value) {
  const url = new URL(httpUrl(value));
  url.searchParams.delete("panelversePage");
  return url.href;
}
// Normaliza el número de página recibido para que solo se guarden posiciones válidas.
export function readingPage(value) {
  const n = Number(new URL(value).searchParams.get("panelversePage"));
  return Number.isInteger(n) && n >= 0 && n < 10000 ? n : 0;
}
// Define la web y la zona de la serie que puede comunicar progreso en esta sesión.
export function readingScope(value) {
  const url = new URL(cleanReadingUrl(value));
  const parts = url.pathname.split("/").filter(Boolean);
  return {
    origin: url.origin,
    path:
      parts.length >= 3
        ? "/" + parts.slice(0, -1).join("/") + "/"
        : url.pathname,
  };
}
// Comprueba el origen y la ruta; un mensaje de otra serie no debe cambiar esta lectura.
export function withinReadingScope(value, scope) {
  try {
    const url = new URL(httpUrl(value));
    return (
      url.origin === scope.origin &&
      (scope.path.endsWith("/")
        ? url.pathname.startsWith(scope.path)
        : url.pathname === scope.path)
    );
  } catch {
    return false;
  }
}
// Valida el mensaje recibido de la web externa antes de tocar el progreso.
// No basta con que venga de postMessage: comprobamos formato, URL y ámbito permitido.
export function validateWebLocation(input, scope) {
  if (
    !input ||
    input.type !== "panelverse:location" ||
    input.version !== WEB_PROTOCOL ||
    !withinReadingScope(input.url, scope)
  )
    throw new Error("Posición de lectura no válida.");
  if (
    !Number.isInteger(input.page) ||
    !Number.isInteger(input.pages) ||
    input.page < 0 ||
    input.pages < 1 ||
    input.pages > 10000 ||
    input.page >= input.pages
  )
    throw new Error("La página recibida no es válida.");
  const chapter =
    Number.isInteger(input.chapter) &&
    input.chapter >= 0 &&
    input.chapter <= 99999
      ? input.chapter
      : null;
  return {
    url: cleanReadingUrl(input.url),
    page: input.page,
    pages: input.pages,
    chapter,
    completed: input.completed === true && input.page === input.pages - 1,
    next:
      input.next && withinReadingScope(input.next, scope)
        ? cleanReadingUrl(input.next)
        : null,
  };
}
// Actualiza enlace y página; el número leído solo avanza cuando el mensaje confirma el final del capítulo.
export function applyWebLocation(series, location) {
  const nextUrl = new URL(
    location.completed && location.next ? location.next : location.url,
  );
  nextUrl.searchParams.set(
    "panelversePage",
    location.completed && location.next ? "0" : String(location.page),
  );
  const lastRead =
    location.completed &&
    location.chapter !== null &&
    (series.total === null || location.chapter <= series.total)
      ? Math.max(series.lastRead, location.chapter)
      : series.lastRead;
  return {
    ...series,
    url: httpUrl(nextUrl.href),
    lastRead,
    status: series.total && lastRead >= series.total ? "finished" : "reading",
    updatedAt: new Date().toISOString(),
  };
}
