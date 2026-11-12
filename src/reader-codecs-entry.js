// Reexporta los extractores ZIP y RAR para que el build los empaquete. El código generado de vendor no se edita a mano.
export { ZipReader, BlobReader, BlobWriter, configure } from "@zip.js/zip.js";
export { createExtractorFromData } from "node-unrar-js/esm/index.esm.js";
