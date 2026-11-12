import { isComic, MAX_ARCHIVE } from "./reader-model.js";
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
export class DriveClient {
  constructor(
    token,
    { fetcher = (...args) => globalThis.fetch(...args) } = {},
  ) {
    this.token = token;
    this.fetcher = fetcher;
  }
  async request(path, params = {}, signal) {
    const url = new URL("https://www.googleapis.com/drive/v3/" + path);
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, value);
    const response = await this.fetcher(url, {
      headers: { Authorization: "Bearer " + this.token },
      signal,
    });
    if (!response.ok) {
      if (response.status === 401)
        throw new Error(
          "La autorización de Drive ha caducado. Pulsa «Conectar Drive» para renovarla.",
        );
      if (response.status === 403)
        throw new Error(
          "Drive no permite acceder. Autoriza la lectura y comprueba que Google Drive API esté habilitada.",
        );
      throw new Error(
        `Drive no pudo completar la petición (${response.status}). No se ha cambiado tu biblioteca.`,
      );
    }
    return response;
  }
  async children(parent, { foldersOnly = false, signal } = {}) {
    const files = [];
    let pageToken = "";
    do {
      const response = await this.request(
        "files",
        {
          q: `'${parent.replace(/['\\]/g, "")}' in parents and trashed = false${foldersOnly ? " and mimeType = 'application/vnd.google-apps.folder'" : ""}`,
          fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime)",
          pageSize: "1000",
          supportsAllDrives: "true",
          includeItemsFromAllDrives: "true",
          ...(pageToken ? { pageToken } : {}),
        },
        signal,
      );
      const data = await response.json();
      files.push(...data.files);
      pageToken = data.nextPageToken;
    } while (pageToken);
    return files;
  }
  async scan(root, { recursive = true, signal } = {}) {
    const queue = [{ id: root, path: "" }],
      seen = new Set(),
      files = [];
    while (queue.length) {
      const folder = queue.shift();
      if (seen.has(folder.id)) continue;
      seen.add(folder.id);
      if (seen.size > 1000)
        throw new Error(
          "La carpeta supera 1000 subcarpetas. Elige una carpeta más concreta.",
        );
      for (const file of await this.children(folder.id, { signal })) {
        if (file.mimeType === "application/vnd.google-apps.folder") {
          if (recursive)
            queue.push({
              id: file.id,
              path: folder.path ? folder.path + "/" + file.name : file.name,
            });
        } else if (isComic(file.name)) {
          files.push({ ...file, collection: folder.path });
          if (files.length > 5000)
            throw new Error(
              "La carpeta supera 5000 cómics. Elige una carpeta más concreta.",
            );
        }
      }
    }
    return files;
  }
  async download(book, signal) {
    if (book.size > MAX_ARCHIVE)
      throw new Error("Este cómic supera el límite de 250 MB.");
    const response = await this.request(
      "files/" + encodeURIComponent(book.driveId),
      { alt: "media", supportsAllDrives: "true" },
      signal,
    );
    const length = Number(response.headers.get("content-length"));
    if (length > MAX_ARCHIVE) throw new Error("El archivo supera 250 MB.");
    const reader = response.body.getReader();
    let size = 0;
    const chunks = [];
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_ARCHIVE) throw new Error("El archivo supera 250 MB.");
        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel();
      throw error;
    }
    return new Blob(chunks);
  }
}
