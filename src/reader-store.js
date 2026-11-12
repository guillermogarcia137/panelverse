let database;
// Abre la base del lector. Los archivos binarios se guardan aparte de sus fichas y de las preferencias.
export function readerDB() {
  return (database ||= new Promise((resolve, reject) => {
    const request = indexedDB.open("panelverse-reader", 1);
    request.onupgradeneeded = () => {
      for (const name of ["books", "files", "settings"])
        request.result.createObjectStore(name);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}
// Agrupa operaciones y espera al cierre correcto de la transacción antes de confirmar el guardado.
export async function readerTransaction(stores, mode, action) {
  const db = await readerDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(tx.error || new Error("No se pudo guardar el lector."));
    action(tx, (value) => {
      result = value;
    });
  });
}
export const readerKey = (owner, id) => JSON.stringify([owner || "guest", id]);
// La clave combina propietario e id: el invitado y cada cuenta tienen su propio espacio local.
export async function readerGet(store, owner, id) {
  return readerTransaction([store], "readonly", (tx, done) => {
    const req = tx.objectStore(store).get(readerKey(owner, id));
    req.onsuccess = () => done(req.result);
  });
}
// Guarda un valor asociado a la cuenta actual usando el mismo esquema de claves que readerGet.
export async function readerPut(store, owner, id, value) {
  return readerTransaction([store], "readwrite", (tx) =>
    tx.objectStore(store).put(value, readerKey(owner, id)),
  );
}
// Lee solo las fichas de la cuenta solicitada; no carga todos los cómics binarios en memoria.
export async function readerBooks(owner) {
  return readerTransaction(["books"], "readonly", (tx, done) => {
    const result = [],
      request = tx.objectStore("books").openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        done(result);
        return;
      }
      if (JSON.parse(cursor.key)[0] === (owner || "guest"))
        result.push(cursor.value);
      cursor.continue();
    };
  });
}
// Guarda ficha y archivo juntos: si una escritura falla, la transacción evita dejar una importación a medias.
export async function saveBook(owner, book, file) {
  return readerTransaction(["books", "files"], "readwrite", (tx) => {
    tx.objectStore("books").put(book, readerKey(owner, book.id));
    if (file) tx.objectStore("files").put(file, readerKey(owner, book.id));
  });
}
// Permite retirar solo la descarga de Drive o eliminar también la ficha, según la acción elegida.
export async function removeBook(owner, id, { fileOnly = false } = {}) {
  return readerTransaction(["books", "files"], "readwrite", (tx) => {
    tx.objectStore("files").delete(readerKey(owner, id));
    if (!fileOnly) tx.objectStore("books").delete(readerKey(owner, id));
  });
}

// Actualiza un lote de fichas dentro de una única transacción, útil para sincronizar el catálogo de Drive.
export async function saveBooks(owner, books) {
  return readerTransaction(["books"], "readwrite", (tx) => {
    for (const book of books)
      tx.objectStore("books").put(book, readerKey(owner, book.id));
  });
}
