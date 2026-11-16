import { fileSeriesInfo, assignIssues } from "./series-files-model.js";

// Obtiene carpetas distintas de las series. Si dos reglas usan una carpeta,
// basta con consultarla una vez; incluir subcarpetas es la opción más amplia.
export function seriesDriveFolders(series) {
  const folders = new Map();
  for (const item of series) {
    const info = fileSeriesInfo(item);
    if (!info?.driveFolder) continue;
    const previous = folders.get(info.driveFolder);
    folders.set(info.driveFolder, {
      folder: info.driveFolder,
      recursive: previous?.recursive || info.driveRecursive,
    });
  }
  return [...folders.values()];
}

// Devuelve solo vinculaciones nuevas. No mueve archivos que la persona ya
// haya asignado a otra serie, ni modifica páginas, marcadores o descargas.
export function automaticDriveIssues(series, books) {
  const rules = series.flatMap((item) => {
    const info = fileSeriesInfo(item);
    return info?.driveFolder ? [{ series: item, info }] : [];
  });
  const groups = new Map();
  for (const book of books) {
    if (book.source !== "drive" || book.missing || book.seriesId) continue;
    const matches = rules.filter(
      ({ info, series: item }) =>
        !book.excludedSeries?.includes(item.id) &&
        (info.driveRecursive
          ? book.driveAncestors?.includes(info.driveFolder)
          : book.driveParent === info.driveFolder),
    );
    // Ante carpetas anidadas gana la más próxima al archivo. Si dos series
    // tienen exactamente la misma regla, no elegimos una arbitrariamente.
    matches.sort(
      (a, b) =>
        (book.driveAncestors?.indexOf(b.info.driveFolder) ?? -1) -
        (book.driveAncestors?.indexOf(a.info.driveFolder) ?? -1),
    );
    if (!matches.length) continue;
    const [match, second] = matches;
    if (second?.info.driveFolder === match.info.driveFolder) continue;
    const group = groups.get(match.series.id) || { ...match, ids: [] };
    group.ids.push(book.id);
    groups.set(match.series.id, group);
  }
  return [...groups.values()].flatMap(({ series: item, info, ids }) =>
    assignIssues(books, ids, item.id, info),
  );
}
