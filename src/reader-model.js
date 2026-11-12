// Límites de memoria: rechazamos archivos o páginas demasiado grandes antes de intentar cargarlos en el móvil.
export const MAX_ARCHIVE = 250 * 1024 * 1024;
export const MAX_PAGE = 40 * 1024 * 1024;
export const MAX_PAGES = 4000;
export const isComic = (name) => /\.(cbz|cbr)$/i.test(name || "");
export const isPage = (name) =>
  /\.(jpe?g|png|webp|gif|avif)$/i.test(name || "") &&
  !/(^|\/)__MACOSX\//i.test(name) &&
  !/(^|\/)\./.test(name);
export const naturalOrder = (a, b) =>
  a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });
// Los índices internos empiezan en cero; la interfaz muestra página + 1.
// En modo doble, la portada se muestra sola y solo se añade una segunda página si existe.
export function pageIndexes(page, total, mode = "single") {
  const start = Math.max(0, Math.min(total - 1, Number(page) || 0));
  return mode === "double" && start > 0 && start + 1 < total
    ? [start, start + 1]
    : [start];
}
// Acepta un enlace de carpeta de Drive o su id y devuelve el identificador que necesita la API.
export function folderId(value) {
  const text = String(value || "").trim();
  const match = text.match(
    /^https:\/\/drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders\/)([\w-]+)/,
  );
  const id = match?.[1] || text;
  if (!/^[\w-]{5,200}$/.test(id) && id !== "root")
    throw new Error(
      "Introduce el enlace de una carpeta de Google Drive o su identificador.",
    );
  return id;
}
// Actualiza el catálogo sin perder el progreso existente. Los archivos ausentes se marcan, no se borran de golpe.
export function reconcileDrive(current, files, root) {
  const map = new Map(current.map((book) => [book.id, book]));
  for (const book of map.values())
    if (book.source === "drive" && book.root === root)
      map.set(book.id, { ...book, missing: true });
  for (const file of files) {
    const id = "drive-" + file.id,
      old = map.get(id);
    const changed = old?.modifiedTime !== file.modifiedTime;
    map.set(id, {
      ...old,
      id,
      driveId: file.id,
      root,
      source: "drive",
      name: file.name,
      title: file.name.replace(/\.(cbz|cbr)$/i, ""),
      collection: file.collection || "",
      size: Number(file.size) || 0,
      modifiedTime: file.modifiedTime,
      missing: false,
      ...(changed ? { cover: null } : {}),
      page: old?.page || 0,
    });
  }
  return [...map.values()];
}
