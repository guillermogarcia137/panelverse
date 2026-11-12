import {
  MAX_ARCHIVE,
  MAX_PAGE,
  MAX_PAGES,
  isPage,
  naturalOrder,
} from "./reader-model.js";
let rarQueue = Promise.resolve();
// El extractor RAR comparte un módulo WebAssembly; encadenamos sus tareas para que no se pisen entre sí.
function withRar(action) {
  const result = rarQueue.then(action);
  rarQueue = result.catch(() => {});
  return result;
}
// Detecta ZIP/CBZ o RAR/CBR por su cabecera y enumera imágenes sin extraer todo el cómic de una vez.
// Devuelve un lector que extrae cada página cuando hace falta, respetando los límites de tamaño.
export async function openArchive(blob, name, { codecs, wasmBinary } = {}) {
  if (!blob.size || blob.size > MAX_ARCHIVE)
    throw new Error("El archivo está vacío o supera el límite de 250 MB.");
  codecs ||= await import("./vendor/reader-codecs.js");
  const magic = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  let pages,
    read,
    close = async () => {};
  if (magic[0] === 0x50 && magic[1] === 0x4b) {
    codecs.configure({ useWebWorkers: false });
    const zip = new codecs.ZipReader(new codecs.BlobReader(blob));
    close = () => zip.close();
    try {
      pages = (await zip.getEntries()).filter(
        (e) => !e.directory && isPage(e.filename),
      );
      read = async (entry) => {
        if (entry.encrypted)
          throw new Error("Los cómics con contraseña no están admitidos.");
        return entry.getData(new codecs.BlobWriter(imageType(entry.filename)), {
          checkSignature: true,
        });
      };
    } catch (error) {
      await close();
      throw error;
    }
  } else if (
    magic[0] === 0x52 &&
    magic[1] === 0x61 &&
    magic[2] === 0x72 &&
    magic[3] === 0x21
  ) {
    if (!wasmBinary) {
      const response = await fetch(
        new URL("./vendor/unrar.wasm", import.meta.url),
      );
      if (!response.ok)
        throw new Error(
          "No se pudo cargar el lector CBR. Conéctate e inténtalo otra vez.",
        );
      wasmBinary = await response.arrayBuffer();
    }
    const data = await blob.arrayBuffer();
    // The UnRAR module has one active extractor. Recreate it for each read and drain all generators.
    const { headers, flags } = await withRar(async () => {
      const extractor = await codecs.createExtractorFromData({
        data,
        wasmBinary,
      });
      const list = extractor.getFileList();
      return { headers: [...list.fileHeaders], flags: list.arcHeader.flags };
    });
    if (flags.volume)
      throw new Error(
        "Los archivos RAR divididos en volúmenes no están admitidos.",
      );
    pages = headers
      .filter((e) => !e.flags.directory && isPage(e.name))
      .map((e) => ({
        ...e,
        filename: e.name,
        uncompressedSize: e.unpSize,
        encrypted: e.flags.encrypted,
      }));
    read = (entry) =>
      withRar(async () => {
        if (entry.encrypted)
          throw new Error("Los cómics con contraseña no están admitidos.");
        const engine = await codecs.createExtractorFromData({
          data,
          wasmBinary,
        });
        let result;
        for (const file of engine.extract({ files: [entry.filename] }).files)
          if (file.extraction)
            result = new Blob([file.extraction], {
              type: imageType(entry.filename),
            });
        if (!result) throw new Error("No se pudo extraer esta página.");
        return result;
      });
  } else throw new Error("El archivo no es un ZIP/CBZ o RAR/CBR válido.");
  if (
    !pages.length ||
    pages.length > MAX_PAGES ||
    pages.some((e) => e.uncompressedSize > MAX_PAGE)
  ) {
    await close();
    throw new Error(
      "El cómic debe tener entre 1 y 4000 páginas y un máximo de 40 MB por imagen.",
    );
  }
  pages.sort((a, b) => naturalOrder(a.filename, b.filename));
  return {
    names: pages.map((e) => e.filename),
    length: pages.length,
    close,
    async page(index) {
      if (!pages[index]) throw new Error("Página no válida.");
      const result = await read(pages[index]);
      if (result.size > MAX_PAGE) throw new Error("La página supera 40 MB.");
      return result;
    },
  };
}
// Indica al navegador el tipo de imagen extraída para crear el Blob con el formato adecuado.
function imageType(name) {
  return (
    "image/" +
    (/\.jpe?g$/i.test(name) ? "jpeg" : name.split(".").pop().toLowerCase())
  );
}
