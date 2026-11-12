import { validateSyncState } from "./sync-model.js";

// IndexedDB es una base de datos del navegador: conserva objetos y permite escrituras agrupadas en transacciones.
export function createSyncStore(factory = globalThis.indexedDB) {
  let connection;
  // Reutiliza la conexión. onupgradeneeded crea la tabla la primera vez o al cambiar la versión de la base.
  function open() {
    if (!factory)
      return Promise.reject(
        new Error("El navegador no permite guardar la copia sin conexión."),
      );
    return (connection ??= new Promise((resolve, reject) => {
      const request = factory.open("panelverse-library", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("libraries", { keyPath: "owner" });
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(
          new Error(
            "Cierra otras pestañas antiguas de PanelVerse y vuelve a abrir.",
          ),
        );
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          connection = null;
        };
        resolve(request.result);
      };
    }));
  }
  // Lee, transforma y escribe en una sola transacción para no perder cambios simultáneos de otras pestañas.
  // La Promise se resuelve al completarse la transacción, cuando el guardado ya está confirmado.
  async function update(owner, transform) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("libraries", "readwrite"),
        store = transaction.objectStore("libraries");
      let result, failure;
      const request = store.get(owner);
      request.onsuccess = () => {
        try {
          result = transform(
            request.result ? validateSyncState(request.result, owner) : null,
          );
          store.put(validateSyncState(result, owner));
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = transaction.onerror = () =>
        reject(
          failure ||
            transaction.error ||
            new Error("No se pudo guardar la copia local."),
        );
    });
  }
  // Las lecturas comprueban también el formato y la cuenta dueña del estado antes de devolverlo.
  async function read(owner) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const request = db
        .transaction("libraries", "readonly")
        .objectStore("libraries")
        .get(owner);
      request.onsuccess = () => {
        try {
          resolve(
            request.result ? validateSyncState(request.result, owner) : null,
          );
        } catch (error) {
          reject(error);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }
  return { read, update };
}
