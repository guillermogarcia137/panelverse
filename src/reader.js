import { getAccountClient } from "./account.js";
import {
  isComic,
  MAX_ARCHIVE,
  folderId,
  reconcileDrive,
  pageIndexes,
  naturalOrder,
} from "./reader-model.js";
import {
  readerGet,
  readerPut,
  readerBooks,
  saveBook,
  saveBooks,
  removeBook,
} from "./reader-store.js";
import { DriveClient, DRIVE_SCOPE } from "./reader-drive.js";
import { openArchive } from "./reader-archive.js";
const $ = (s) => document.querySelector(s),
  esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let owner = null,
  books = [],
  settings = {},
  drive = null,
  epoch = 0,
  operation = null,
  syncing = false,
  reading = null,
  viewVersion = 0,
  observer = null,
  urls = [],
  coverUrls = [],
  busy = false;
function message(text) {
  $("#reader-message").textContent = text;
}
function fail(error) {
  if ($("#comic-reader")?.open)
    $("#comic-error").textContent = error.message || "No se pudo guardar.";
  message(
    error.name === "QuotaExceededError"
      ? "No queda espacio en el navegador. Libera descargas o almacenamiento antes de continuar."
      : error.message || "No se pudo completar la operación.",
  );
}
function viewReader(show = true) {
  $("#reading-library").hidden = !show;
  for (const selector of [".intro", "#resume", "#library"])
    $(selector).hidden = show;
  $("#reader-nav").classList.toggle("active", show);
  if (show) {
    document
      .querySelectorAll("[data-filter]")
      .forEach((el) => el.classList.remove("active"));
    location.hash = "reading";
  } else if (location.hash === "#reading")
    history.replaceState(null, "", location.pathname + location.search);
}
async function load() {
  const version = ++epoch;
  operation?.abort();
  operation = null;
  drive = null;
  closeReader();
  try {
    const [list, prefs] = await Promise.all([
      readerBooks(owner),
      readerGet("settings", owner, "preferences"),
    ]);
    if (version !== epoch) return;
    books = list;
    settings = prefs || {};
    render();
    if (drive && settings.folder) syncDrive();
  } catch (error) {
    if (version === epoch) fail(error);
  }
}
async function saveSettings() {
  await readerPut("settings", owner, "preferences", settings);
}
function render() {
  for (const url of coverUrls) URL.revokeObjectURL(url);
  coverUrls = [];
  $("#drive-folder-name").textContent = settings.folder
    ? `Carpeta: ${settings.folderName || settings.folder}${settings.recursive === false ? "" : " · incluye subcarpetas"}`
    : "Conecta Drive y elige dónde están tus cómics.";
  $("#drive-sync").disabled = syncing || !drive || !settings.folder;
  $("#drive-connection").textContent = drive
    ? "Drive autorizado · solo lectura"
    : "Drive sin autorizar en esta sesión";
  $("#reader-count").textContent = books.length;
  const query = $("#reader-search").value.toLowerCase(),
    filter = $("#reader-filter").value,
    collection = $("#reader-collection").value;
  const collections = [
    ...new Set(books.map((b) => b.collection).filter(Boolean)),
  ].sort(naturalOrder);
  $("#reader-collection").innerHTML =
    '<option value="">Todas las colecciones</option>' +
    collections
      .map(
        (c) =>
          `<option ${c === collection ? "selected" : ""}>${esc(c)}</option>`,
      )
      .join("");
  const list = books.filter(
    (b) =>
      (b.title + " " + b.collection).toLowerCase().includes(query) &&
      (!collection || b.collection === collection) &&
      (filter === "all" ||
        (filter === "favorites" && b.favorite) ||
        (filter === "reading" && b.page > 0 && !b.finished) ||
        (filter === "finished" && b.finished) ||
        (filter === "offline" && b.cachedVersion)),
  );
  list.sort((a, b) =>
    $("#reader-sort").value === "title"
      ? naturalOrder(a.title, b.title)
      : (b.readAt || "").localeCompare(a.readAt || "") ||
        naturalOrder(a.title, b.title),
  );
  $("#reading-grid").innerHTML = list.length
    ? list
        .map(
          (book) =>
            `<article class="reader-book"><button class="reader-cover" data-read-action="open" data-id="${esc(book.id)}" aria-label="Leer ${esc(book.title)}"><span class="reader-cover-type">${esc(book.name.split(".").pop().toUpperCase())}</span><strong>${esc(book.title)}</strong>${book.cover ? '<img alt="" loading="lazy">' : ""}<span class="reader-cover-state">${book.finished ? "Leído" : book.pages ? `${book.page + 1} / ${book.pages}` : "Por descubrir"}</span></button><div class="reader-book-info"><small>${esc(book.collection || (book.source === "drive" ? "GOOGLE DRIVE" : "EN ESTE DISPOSITIVO"))}</small><h3>${esc(book.title)}</h3><p>${book.cachedVersion ? "Disponible sin conexión" : book.missing ? "Ya no está en la carpeta" : "Descarga al abrir"}${book.size ? " · " + (book.size / 1024 / 1024).toFixed(1) + " MB" : ""}</p>${book.pages ? `<progress value="${book.finished ? book.pages : book.page + 1}" max="${book.pages}" aria-label="Progreso de ${esc(book.title)}"></progress>` : ""}<div class="reader-book-actions"><button class="quiet" data-read-action="open" data-id="${esc(book.id)}">${book.page ? "Continuar" : "Leer"}</button><button class="quiet" data-read-action="favorite" data-id="${esc(book.id)}" aria-label="${book.favorite ? "Quitar de" : "Añadir a"} favoritos" aria-pressed="${!!book.favorite}">${book.favorite ? "★" : "☆"}</button><button class="quiet" data-read-action="remove" data-id="${esc(book.id)}" aria-label="${book.source === "drive" ? "Liberar descarga" : "Eliminar cómic"}">${book.source === "drive" ? "↓−" : "×"}</button></div></div></article>`,
        )
        .join("")
    : `<div class="empty"><span>▧</span><h3>${books.length ? "No hay cómics en esta vista" : "Tu próxima historia, aquí mismo"}</h3><p>Importa archivos CBR o CBZ, o conecta tu carpeta de Google Drive.</p></div>`;
  for (const [index, card] of [...$("#reading-grid").children].entries()) {
    const img = card.querySelector("img");
    if (img && list[index]?.cover) {
      const url = URL.createObjectURL(list[index].cover);
      coverUrls.push(url);
      img.src = url;
      img.onload = () => URL.revokeObjectURL(url);
      img.onerror = () => {
        URL.revokeObjectURL(url);
        img.remove();
      };
    }
  }
  const latest = [...books]
    .filter((b) => b.readAt && !b.finished)
    .sort((a, b) => b.readAt.localeCompare(a.readAt))[0];
  $("#reader-resume").innerHTML = latest
    ? `<div class="reader-resume"><div><p class="eyebrow">DONDE LO DEJASTE</p><h3>${esc(latest.title)}</h3><p>Página ${latest.page + 1}${latest.pages ? " de " + latest.pages : ""}</p></div><button class="primary" data-read-action="open" data-id="${esc(latest.id)}">Continuar leyendo →</button></div>`
    : "";
}
async function patch(book, changes) {
  const next = { ...book, ...changes };
  await saveBook(owner, next);
  Object.assign(book, changes);
}
async function coverBlob(blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = Math.min(
      480,
      Math.round((bitmap.height * 240) / bitmap.width),
    );
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.8),
    );
  } finally {
    bitmap.close();
  }
}
async function importFiles(files) {
  if (busy || syncing) {
    message("Espera a que termine la operación actual.");
    return;
  }
  busy = true;
  const current = epoch,
    account = owner;
  try {
    for (const file of files) {
      if (current !== epoch) break;
      if (!isComic(file.name))
        throw new Error("Selecciona archivos .cbr o .cbz.");
      if (file.size > MAX_ARCHIVE)
        throw new Error(`${file.name} supera 250 MB.`);
      message("Importando " + file.name + "…");
      const archive = await openArchive(file, file.name);
      let cover;
      try {
        cover = await coverBlob(await archive.page(0));
      } finally {
        await archive.close();
      }
      if (current !== epoch) break;
      const digest = await crypto.subtle.digest(
        "SHA-256",
        await file.arrayBuffer(),
      );
      if (current !== epoch) break;
      const id =
        "local-" +
        [...new Uint8Array(digest)]
          .map((n) => n.toString(16).padStart(2, "0"))
          .join("");
      const previous = books.find((b) => b.id === id);
      const book = {
        ...previous,
        id,
        name: file.name,
        title: file.name.replace(/\.(cbr|cbz)$/i, ""),
        source: "local",
        size: file.size,
        page: previous?.page || 0,
        pages: archive.length,
        cover,
        cachedVersion: "local",
      };
      await saveBook(account, book, file);
      if (current !== epoch) break;
      books = books.filter((b) => b.id !== id).concat(book);
      render();
    }
    if (current === epoch)
      message("Importación guardada. Puedes leer sin conexión.");
  } catch (error) {
    if (current === epoch) fail(error);
  } finally {
    busy = false;
    $("#reader-files").value = "";
  }
}
async function syncDrive() {
  if (syncing || busy || reading || !drive || !settings.folder) return;
  const current = epoch,
    account = owner,
    client = drive,
    folder = settings.folder;
  syncing = true;
  operation = new AbortController();
  render();
  message("Buscando cómics en Drive…");
  try {
    const files = await client.scan(folder, {
      recursive: settings.recursive !== false,
      signal: operation.signal,
    });
    if (current !== epoch) return;
    const next = reconcileDrive(books, files, folder);
    await saveBooks(account, next);
    if (current !== epoch) return;
    books = next;
    settings.syncedAt = new Date().toISOString();
    await saveSettings();
    message(
      `${files.length} cómics encontrados. Actualizado a las ${new Date().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}.`,
    );
  } catch (error) {
    if (current === epoch && error.name !== "AbortError") fail(error);
  } finally {
    syncing = false;
    if (current === epoch) render();
  }
}
async function browse(id = "root", name = "Mi unidad") {
  const current = epoch;
  if (!drive) return;
  $("#drive-browse-status").textContent = "Cargando carpetas…";
  try {
    const folders = await drive.children(id, { foldersOnly: true });
    if (current !== epoch) return;
    $("#drive-current").textContent = name;
    $("#drive-current").dataset.id = id;
    $("#drive-folders").replaceChildren();
    for (const folder of folders.sort((a, b) => naturalOrder(a.name, b.name))) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "quiet";
      button.textContent = "▱ " + folder.name + " →";
      button.onclick = () => browse(folder.id, folder.name);
      $("#drive-folders").append(button);
    }
    $("#drive-browse-status").textContent = folders.length
      ? "Abre una carpeta o elige la actual."
      : "Esta carpeta no tiene subcarpetas.";
  } catch (error) {
    $("#drive-browse-status").textContent = error.message;
  }
}
async function connect() {
  try {
    const client = getAccountClient();
    if (!client)
      throw new Error(
        "El servicio de cuentas aún no está disponible. Prueba desde Cuenta.",
      );
    sessionStorage.setItem("panelverse.reader-return", "1");
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: new URL("../", import.meta.url).href,
        scopes: DRIVE_SCOPE,
        queryParams: { prompt: "consent", include_granted_scopes: "true" },
      },
    });
    if (error) throw error;
  } catch (error) {
    fail(error);
  }
}
function cleanupPages() {
  observer?.disconnect();
  observer = null;
  for (const url of urls) URL.revokeObjectURL(url);
  urls = [];
}
function closeReader() {
  viewVersion++;
  cleanupPages();
  const previous = reading;
  reading = null;
  if (previous) previous.archive.close().catch(fail);
  const dialog = $("#comic-reader");
  if (dialog?.open) dialog.close();
  if (document.fullscreenElement === dialog)
    document.exitFullscreen().catch(() => {});
  if (previous) render();
}
async function openBook(book) {
  if (busy || syncing) {
    message("Espera a que termine la operación actual.");
    return;
  }
  busy = true;
  const current = epoch,
    account = owner;
  operation = new AbortController();
  message("Abriendo " + book.title + "…");
  try {
    let file = await readerGet("files", account, book.id),
      version = book.cachedVersion;
    if (
      !file ||
      (book.source === "drive" && book.cachedVersion !== book.modifiedTime)
    ) {
      if (!file || navigator.onLine) {
        if (!drive)
          throw new Error(
            "Conecta Drive para descargar este cómic o su versión actualizada.",
          );
        if (book.missing)
          throw new Error("El cómic ya no está en la carpeta seleccionada.");
        file = await drive.download(book, operation.signal);
        version = book.modifiedTime;
      }
    }
    if (current !== epoch) return;
    const archive = await openArchive(file, book.name);
    if (current !== epoch) {
      await archive.close();
      return;
    }
    try {
      book.cover ||= await coverBlob(await archive.page(0));
      book.pages = archive.length;
      book.page = Math.min(book.page || 0, archive.length - 1);
      book.cachedVersion = book.source === "local" ? "local" : version;
      await saveBook(account, book, file);
    } catch (error) {
      await archive.close();
      throw error;
    }
    if (current !== epoch) {
      await archive.close();
      return;
    }
    closeReader();
    reading = { book, archive, account };
    $("#comic-title").textContent = book.title;
    $("#comic-error").textContent = "";
    $("#comic-finish").textContent = book.finished
      ? "Marcar sin terminar"
      : "Marcar terminado";
    $("#comic-reader").showModal();
    $("#comic-mode").value = settings.mode || "single";
    $("#comic-direction").value = settings.direction || "ltr";
    $("#comic-fit").value = settings.fit || "page";
    $("#comic-background").value = settings.background || "black";
    $("#comic-zoom").value = "1";
    await drawPages();
    $("#comic-viewport").focus();
    message("Cómic descargado y disponible sin conexión.");
  } catch (error) {
    if (current === epoch && error.name !== "AbortError") fail(error);
  } finally {
    busy = false;
  }
}
async function remember(page) {
  if (!reading) return;
  const { book, account } = reading;
  book.page = page;
  book.readAt = new Date().toISOString();
  await saveBook(account, book);
}
async function drawPages() {
  if (!reading) return;
  const version = ++viewVersion;
  cleanupPages();
  const context = reading,
    { book, archive } = context,
    loaded = new Map(),
    mode = $("#comic-mode").value,
    viewport = $("#comic-viewport");
  viewport.replaceChildren();
  viewport.dataset.mode = mode;
  viewport.dataset.fit = $("#comic-fit").value;
  viewport.dataset.direction = $("#comic-direction").value;
  viewport.style.setProperty("--comic-zoom", $("#comic-zoom").value);
  viewport.style.background = {
    black: "#080808",
    paper: "#eee9dc",
    gray: "#343434",
  }[$("#comic-background").value];
  $("#comic-range").max = archive.length - 1;
  $("#comic-range").value = book.page;
  $("#comic-range").setAttribute(
    "aria-valuetext",
    `Página ${book.page + 1} de ${archive.length}`,
  );
  $("#comic-page").textContent = `${book.page + 1} / ${archive.length}`;
  $("#comic-bookmark").setAttribute(
    "aria-pressed",
    String((book.bookmarks || []).includes(book.page)),
  );
  $("#comic-bookmarks").innerHTML =
    '<option value="">Marcadores</option>' +
    (book.bookmarks || [])
      .map((p) => `<option value="${p}">Página ${p + 1}</option>`)
      .join("");
  $("#comic-prev").disabled = book.page === 0;
  $("#comic-next").disabled = book.page >= archive.length - 1;
  async function image(index, slot) {
    try {
      const blob = await archive.page(index);
      if (version !== viewVersion) return;
      const img = document.createElement("img"),
        url = URL.createObjectURL(blob);
      urls.push(url);
      img.src = url;
      img.alt = `Página ${index + 1}`;
      img.draggable = false;
      if (mode === "vertical") {
        loaded.set(index, { slot, url });
        if (loaded.size > 14) {
          const farthest = [...loaded.keys()].sort(
              (a, b) => Math.abs(b - index) - Math.abs(a - index),
            )[0],
            old = loaded.get(farthest);
          URL.revokeObjectURL(old.url);
          urls = urls.filter((url) => url !== old.url);
          old.slot.style.minHeight =
            old.slot.getBoundingClientRect().height + "px";
          old.slot.replaceChildren();
          delete old.slot.dataset.loaded;
          loaded.delete(farthest);
        }
      }
      img.onerror = () => {
        slot.textContent = `No se puede mostrar la imagen ${index + 1}. Prueba otro formato.`;
      };
      slot.replaceChildren(img);
      if (mode === "vertical") slot.style.minHeight = "";
    } catch (error) {
      if (version === viewVersion) slot.textContent = error.message;
    }
  }
  try {
    if (mode === "vertical") {
      observer = new IntersectionObserver(
        (entries) => {
          if (version !== viewVersion) return;
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const slot = entry.target,
              index = Number(slot.dataset.page);
            if (!slot.dataset.loaded) {
              slot.dataset.loaded = "true";
              image(index, slot);
            }
            if (entry.intersectionRatio >= 0.25 && version === viewVersion) {
              remember(index).catch(fail);
              $("#comic-page").textContent = `${index + 1} / ${archive.length}`;
              $("#comic-range").value = index;
              $("#comic-range").setAttribute(
                "aria-valuetext",
                `Página ${index + 1} de ${archive.length}`,
              );
              $("#comic-bookmark").setAttribute(
                "aria-pressed",
                String((book.bookmarks || []).includes(index)),
              );
            }
          }
        },
        { root: viewport, threshold: [0, 0.25, 0.75] },
      );
      for (let i = 0; i < archive.length; i++) {
        const slot = document.createElement("div");
        slot.className = "comic-page-slot";
        slot.dataset.page = i;
        slot.textContent = `Página ${i + 1}`;
        viewport.append(slot);
        observer.observe(slot);
      }
      viewport.children[book.page].scrollIntoView({ block: "start" });
    } else {
      for (const index of pageIndexes(book.page, archive.length, mode)) {
        if (version !== viewVersion) return;
        const slot = document.createElement("div");
        slot.className = "comic-page-slot";
        slot.textContent = "Cargando página…";
        viewport.append(slot);
        await image(index, slot);
      }
      viewport.scrollTop = 0;
      viewport.scrollLeft = 0;
    }
    if (version === viewVersion) await remember(book.page);
  } catch (error) {
    if (version === viewVersion) fail(error);
  }
}
async function move(delta) {
  if (!reading) return;
  const mode = $("#comic-mode").value,
    current = reading.book.page,
    total = reading.archive.length;
  const step =
    mode === "double"
      ? delta > 0
        ? pageIndexes(current, total, mode).length
        : current === 1
          ? 1
          : 2
      : 1;
  reading.book.page = Math.max(0, Math.min(total - 1, current + delta * step));
  await drawPages();
}
export function initializeReader() {
  $("#reader-nav").addEventListener("click", () => viewReader());
  $("#navigation").addEventListener("click", (event) => {
    if (event.target.closest("[data-filter]")) viewReader(false);
  });
  $("#reader-import").onclick = () => $("#reader-files").click();
  $("#reader-files").onchange = (event) => importFiles([...event.target.files]);
  for (const id of [
    "reader-search",
    "reader-filter",
    "reader-sort",
    "reader-collection",
  ])
    $("#" + id).addEventListener(
      id === "reader-search" ? "input" : "change",
      render,
    );
  $("#reader-drive-connect").onclick = connect;
  $("#drive-sync").onclick = syncDrive;
  $("#drive-choose").onclick = () => {
    if (!drive) {
      message("Pulsa «Conectar Drive» para autorizar el acceso.");
      return;
    }
    $("#drive-folder-dialog").showModal();
    $("#drive-folder-input").value = settings.folder || "";
    $("#drive-recursive").checked = settings.recursive !== false;
    browse();
  };
  $("#drive-home").onclick = () => browse();
  $("#drive-use-current").onclick = () => {
    $("#drive-folder-input").value = $("#drive-current").dataset.id;
  };
  $("#drive-folder-form").onsubmit = async (event) => {
    event.preventDefault();
    try {
      const id = folderId($("#drive-folder-input").value),
        current = epoch;
      await drive
        .request("files/" + encodeURIComponent(id), {
          fields: "id,mimeType",
          supportsAllDrives: "true",
        })
        .then(async (response) => {
          if (
            (await response.json()).mimeType !==
            "application/vnd.google-apps.folder"
          )
            throw new Error("Selecciona una carpeta de Drive.");
        });
      if (current !== epoch) return;
      settings.folder = id;
      settings.folderName =
        $("#drive-current").dataset.id === id
          ? $("#drive-current").textContent
          : id;
      settings.recursive = $("#drive-recursive").checked;
      await saveSettings();
      $("#drive-folder-dialog").close();
      render();
      await syncDrive();
    } catch (error) {
      $("#drive-browse-status").textContent = error.message;
    }
  };
  $("#drive-disconnect").onclick = () => {
    drive = null;
    operation?.abort();
    message(
      "Drive desconectado de esta sesión. Se conservan las descargas. Puedes revocar el permiso en tu cuenta de Google.",
    );
    render();
  };
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-read-action]");
    if (!button) return;
    if (busy || syncing) {
      message("Espera a que termine la operación actual.");
      return;
    }
    const current = epoch,
      account = owner;
    const book = books.find((b) => b.id === button.dataset.id);
    if (!book) return;
    try {
      if (button.dataset.readAction === "open") await openBook(book);
      else if (button.dataset.readAction === "favorite") {
        await patch(book, { favorite: !book.favorite });
        render();
      } else if (
        button.dataset.readAction === "remove" &&
        confirm(
          book.source === "drive"
            ? "¿Liberar la descarga de este dispositivo? Se conserva el progreso y el original de Drive."
            : "¿Eliminar este cómic del navegador? Se conserva el archivo original.",
        )
      ) {
        await removeBook(account, book.id, {
          fileOnly: book.source === "drive",
        });
        if (current !== epoch) return;
        if (book.source === "drive") await patch(book, { cachedVersion: null });
        else books = books.filter((b) => b !== book);
        render();
      }
    } catch (error) {
      fail(error);
    }
  });
  $("#comic-close").onclick = closeReader;
  $("#comic-reader").addEventListener("cancel", (event) => {
    event.preventDefault();
    closeReader();
  });
  $("#comic-prev").onclick = () => move(-1).catch(fail);
  $("#comic-next").onclick = () => move(1).catch(fail);
  $("#comic-range").onchange = () => {
    if (reading) {
      reading.book.page = Number($("#comic-range").value);
      drawPages().catch(fail);
    }
  };
  for (const [id, key] of [
    ["comic-mode", "mode"],
    ["comic-direction", "direction"],
    ["comic-fit", "fit"],
    ["comic-background", "background"],
  ])
    $("#" + id).onchange = async () => {
      settings[key] = $("#" + id).value;
      try {
        await saveSettings();
        await drawPages();
      } catch (error) {
        fail(error);
      }
    };
  $("#comic-zoom").onchange = () => drawPages().catch(fail);
  $("#comic-fullscreen").onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if ($("#comic-reader").requestFullscreen)
        await $("#comic-reader").requestFullscreen();
      else
        $("#comic-error").textContent =
          "Este navegador no admite pantalla completa. El lector ya ocupa toda la ventana.";
    } catch {
      $("#comic-error").textContent =
        "No se pudo activar pantalla completa en este navegador.";
    }
  };
  $("#comic-finish").onclick = async () => {
    if (!reading) return;
    try {
      await patch(reading.book, { finished: !reading.book.finished });
      $("#comic-finish").textContent = reading.book.finished
        ? "Marcar sin terminar"
        : "Marcar terminado";
    } catch (error) {
      fail(error);
    }
  };
  $("#comic-bookmark").onclick = async () => {
    if (!reading) return;
    try {
      const book = reading.book,
        marks = new Set(book.bookmarks || []);
      if (marks.has(book.page)) marks.delete(book.page);
      else marks.add(book.page);
      await patch(book, { bookmarks: [...marks].sort((a, b) => a - b) });
      $("#comic-bookmark").setAttribute(
        "aria-pressed",
        String(marks.has(book.page)),
      );
      $("#comic-bookmarks").innerHTML =
        '<option value="">Marcadores</option>' +
        book.bookmarks
          .map((p) => `<option value="${p}">Página ${p + 1}</option>`)
          .join("");
    } catch (error) {
      fail(error);
    }
  };
  $("#comic-bookmarks").onchange = () => {
    if (reading && $("#comic-bookmarks").value !== "") {
      reading.book.page = Number($("#comic-bookmarks").value);
      drawPages().catch(fail);
    }
  };
  $("#comic-reader").addEventListener("keydown", (event) => {
    if (
      /INPUT|SELECT/.test(event.target.tagName) ||
      (event.key === " " && event.target.tagName === "BUTTON")
    )
      return;
    if (["ArrowRight", "ArrowLeft", " "].includes(event.key)) {
      event.preventDefault();
      const forward =
        event.key === " " ||
        event.key ===
          ($("#comic-direction").value === "rtl" ? "ArrowLeft" : "ArrowRight");
      move(forward ? 1 : -1).catch(fail);
    }
  });
  let touch;
  $("#comic-viewport").addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length === 1)
        touch = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      else touch = null;
    },
    { passive: true },
  );
  $("#comic-viewport").addEventListener(
    "touchend",
    (event) => {
      if (
        !touch ||
        $("#comic-mode").value === "vertical" ||
        $("#comic-zoom").value !== "1"
      )
        return;
      const dx = event.changedTouches[0].clientX - touch.x,
        dy = event.changedTouches[0].clientY - touch.y;
      touch = null;
      if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.5)
        move(
          (dx < 0 ? 1 : -1) * ($("#comic-direction").value === "rtl" ? -1 : 1),
        ).catch(fail);
    },
    { passive: true },
  );
  window.addEventListener("panelverse:account-changed", (event) => {
    owner = event.detail.userId;
    $("#drive-folder-dialog").close();
    books = [];
    settings = {};
    message("");
    render();
    load();
  });
  window.addEventListener("panelverse:auth-session", (event) => {
    drive = event.detail.token ? new DriveClient(event.detail.token) : null;
    render();
    if (drive && settings.folder) syncDrive();
  });
  setInterval(() => {
    if (
      !document.hidden &&
      navigator.onLine &&
      drive &&
      settings.folder &&
      !$("#comic-reader").open
    )
      syncDrive();
  }, 60000);
  window.addEventListener("online", () => syncDrive());
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) syncDrive();
  });
  window.addEventListener("hashchange", () => {
    if (location.hash === "#reading") viewReader();
  });
  const returning = sessionStorage.getItem("panelverse.reader-return");
  sessionStorage.removeItem("panelverse.reader-return");
  if (location.hash === "#reading" || returning) viewReader();
  load();
}
