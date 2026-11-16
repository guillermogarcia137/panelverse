import { validateSeries } from "./model.js";
import { folderId } from "./reader-model.js";
import { automaticDriveIssues } from "./series-drive-model.js";
import {
  fileSeriesInfo,
  fileSeriesUrl,
  seriesBooks,
  assignIssues,
  nextSeriesBook,
  fileSeriesProgress,
} from "./series-files-model.js";
const $ = (selector) => document.querySelector(selector);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
// Une la biblioteca de series con el lector independiente reutilizando sus archivos, sin copiar el contenido binario.
export function initializeSeriesFiles({
  reader,
  getSeries,
  getOwner,
  save,
  renderLibrary,
  toast,
}) {
  let managing = null,
    selection = [],
    generation = 0,
    queue = Promise.resolve(),
    coverUrls = [],
    deepOpened = false,
    working = false,
    reconciling = false,
    linkScheduled = false;
  const get = (id) => getSeries().find((s) => s.id === id);
  const linked = (id) => seriesBooks(reader.getBooks(), id);
  // Las notificaciones pueden llegar durante un render. Una microtarea
  // agrupa esos avisos y evita escribir en IndexedDB mientras se dibuja.
  function scheduleDriveLinks() {
    if (linkScheduled) return;
    linkScheduled = true;
    queueMicrotask(async () => {
      linkScheduled = false;
      const status = reader.getDriveStatus();
      if (reconciling || working || status.busy || status.syncing) return;
      const owner = getOwner(),
        current = generation;
      let changed = false;
      reconciling = true;
      try {
        const updates = automaticDriveIssues(getSeries(), reader.getBooks());
        if (!updates.length) return;
        changed = await reader.updateBooks(updates);
        if (!changed || owner !== getOwner() || current !== generation) return;
        // Un número nuevo sin leer vuelve a abrir una serie que figuraba
        // terminada. Solo guardamos si existe realmente ese cambio de estado.
        const reopened = new Set(
          updates.filter((b) => !b.finished).map((b) => b.seriesId),
        );
        if (
          getSeries().some((s) => reopened.has(s.id) && s.status === "finished")
        ) {
          await save(
            getSeries().map((s) =>
              reopened.has(s.id) && s.status === "finished"
                ? {
                    ...s,
                    status: "reading",
                    updatedAt: new Date().toISOString(),
                  }
                : s,
            ),
          );
        }
      } catch (error) {
        if (owner === getOwner() && current === generation)
          $("#series-issues-message").textContent = error.message;
      } finally {
        reconciling = false;
        if (changed && owner === getOwner() && current === generation) {
          renderLibrary();
          drawManage();
        }
      }
    });
  }
  // Produce el resumen de números descargados y de la página pendiente de una serie.
  function summary(series) {
    const list = linked(series.id),
      info = fileSeriesInfo(series);
    const current = list.find((b) => b.id === info?.book);
    return `${list.length} número${list.length === 1 ? "" : "s"} en este dispositivo${info?.book ? ` · #${info.issue} · página ${info.page + 1}${current?.pages ? " / " + current.pages : ""}` : ""}`;
  }
  // Añade portadas locales a las tarjetas de series una vez que app.js ha construido el HTML.
  function decorate() {
    scheduleDriveLinks();
    coverUrls.forEach((url) => URL.revokeObjectURL(url));
    coverUrls = [];
    document.querySelectorAll("[data-files-cover]").forEach((element) => {
      const s = get(element.dataset.filesCover);
      if (!s || s.cover) return;
      const cover = linked(s.id).find((b) => b.cover)?.cover;
      if (!cover) return;
      element
        .querySelectorAll(".file-cover-image")
        .forEach((img) => img.remove());
      const img = document.createElement("img"),
        url = URL.createObjectURL(cover);
      coverUrls.push(url);
      img.className = "file-cover-image";
      img.src = url;
      img.alt = "Portada de " + s.title;
      img.onload = () => URL.revokeObjectURL(url);
      img.onerror = () => {
        URL.revokeObjectURL(url);
        img.remove();
      };
      element.append(img);
    });
    const id = new URL(location.href).searchParams.get("pvCollection");
    if (!deepOpened && id && get(id)) {
      deepOpened = true;
      queueMicrotask(() => manage(id));
    }
  }
  // Rellena el diálogo de números de la serie con los archivos vinculados y sus controles.
  function drawManage() {
    const series = get(managing);
    if (!series || !$("#series-issues").open) return;
    $("#series-issues-title").textContent = series.title;
    $("#series-issues-summary").textContent = summary(series);
    drawDrive(series);
    const list = linked(series.id);
    $("#series-issues-list").innerHTML = list.length
      ? list
          .map(
            (book) =>
              `<article class="series-issue"><label>Número<input type="number" min="1" max="99999" value="${book.issue}" data-issue-number="${esc(book.id)}" aria-label="Número de ${esc(book.name)}"></label><div><h3>${esc(book.name)}</h3><p>${book.finished ? "Leído" : book.readAt ? `Página ${book.page + 1}${book.pages ? " de " + book.pages : ""}` : "Sin empezar"} · ${book.source === "drive" ? "Drive" : "Archivo local"}</p></div><button type="button" class="quiet" data-issue-open="${esc(book.id)}">${book.finished ? "Releer" : book.readAt ? "Continuar" : "Leer"}</button><button type="button" class="quiet" data-issue-unlink="${esc(book.id)}" aria-label="Desvincular ${esc(book.name)}">×</button></article>`,
          )
          .join("")
      : '<div class="empty"><h3>Añade los números de esta serie</h3><p>Importa varios CBR/CBZ o vincula los que ya tienes en el lector y en Drive. Los archivos permanecen también en el Lector.</p></div>';
  }
  // Repinta la biblioteca y sus números; si la URL señala una serie existente, abre su gestión una sola vez.
  function refresh() {
    scheduleDriveLinks();
    renderLibrary();
    drawManage();
    const id = new URL(location.href).searchParams.get("pvCollection");
    if (!deepOpened && id && get(id)) {
      deepOpened = true;
      manage(id);
    }
  }
  // Abre la gestión de números para una serie concreta de la biblioteca actual.
  function manage(id) {
    if (!get(id)) return;
    managing = id;
    $("#series-drive-panel").open = false;
    $("#series-issues-message").textContent = "";
    $("#details").close();
    if (!$("#series-issues").open) $("#series-issues").showModal();
    drawManage();
  }
  // El permiso pertenece al navegador; la carpeta pertenece a la serie.
  // No mostramos «sincronizado» solo porque exista un enlace guardado.
  function drawDrive(series) {
    const info = fileSeriesInfo(series),
      status = reader.getDriveStatus();
    $("#series-drive-caption").textContent = info?.driveFolder
      ? status.connected
        ? "Carpeta vinculada"
        : "Conectar para recuperar los números"
      : "Vincular una carpeta";
    const form = $("#series-drive-form");
    if (!form.contains(document.activeElement)) {
      $("#series-drive-folder").value = info?.driveFolder
        ? `https://drive.google.com/drive/folders/${info.driveFolder}`
        : "";
      $("#series-drive-recursive").checked = info?.driveRecursive !== false;
    }
    $("#series-drive-status").textContent = status.syncing
      ? "Actualizando carpetas de Drive…"
      : status.error
        ? status.error
        : info?.driveFolder
          ? status.connected
            ? "Carpeta vinculada. Los números nuevos se añadirán a esta serie al sincronizar."
            : "Carpeta guardada. Conecta Drive en este navegador para recuperar sus números."
          : "Vincula una carpeta para añadir automáticamente sus CBR y CBZ a esta serie.";
    $("#series-drive-connect").hidden = status.connected && !status.error;
    $("#series-drive-sync").disabled =
      !status.connected || !info?.driveFolder || status.syncing || status.busy;
    $("#series-drive-browse").disabled =
      !status.connected || status.syncing || status.busy;
    $("#series-drive-unlink").hidden = !info?.driveFolder;
  }
  async function bindDriveFolder(value, recursive) {
    const id = managing,
      owner = getOwner(),
      current = generation;
    const series = get(id);
    if (!series) throw new Error("La serie ya no está disponible.");
    const folder = value ? folderId(value) : null;
    if (
      folder &&
      getSeries().some(
        (s) => s.id !== id && fileSeriesInfo(s)?.driveFolder === folder,
      )
    )
      throw new Error(
        "Esta carpeta ya está vinculada a otra serie. Elige una carpeta distinta o retira primero esa vinculación.",
      );
    const info = fileSeriesInfo(series);
    const next = {
      ...series,
      url: fileSeriesUrl(series, {
        ...info,
        driveFolder: folder,
        driveRecursive: recursive,
      }),
      updatedAt: new Date().toISOString(),
    };
    if (!(await save(getSeries().map((s) => (s.id === id ? next : s)))))
      throw new Error("No se pudo guardar la carpeta de la serie.");
    if (owner !== getOwner() || current !== generation) return;
    drawManage();
    scheduleDriveLinks();
    if (folder && reader.getDriveStatus().connected) await reader.syncDrive();
    if (owner !== getOwner() || current !== generation) return;
    if (folder && reader.getDriveStatus().error)
      throw new Error(
        "Carpeta guardada, pero no se pudo actualizar: " +
          reader.getDriveStatus().error,
      );
    $("#series-issues-message").textContent = folder
      ? "Carpeta guardada. Los archivos y descargas se conservan en Drive y en el Lector."
      : "Carpeta desvinculada. Los números que ya tenías siguen en la serie y en el Lector.";
  }
  // Comprueba la serie y pide al lector que abra el archivo y la página de reanudación adecuados.
  async function play(id, bookId = null) {
    const series = get(id);
    if (!series) return;
    let book = bookId
      ? linked(id).find((b) => b.id === bookId)
      : nextSeriesBook(series, reader.getBooks());
    if (!book) {
      manage(id);
      toast("Añade o vincula los archivos de esta serie en este dispositivo.");
      return;
    }
    const info = fileSeriesInfo(series),
      resumePage =
        info?.book === book.id && info.completed !== true
          ? info.page
          : book.finished
            ? 0
            : null;
    await reader.openBook(book.id, { resumePage });
  }
  // Prepara el diálogo que permite asignar archivos del lector a una serie existente.
  function attach(bookId = null, target = managing) {
    selection = bookId ? [bookId] : [];
    const series = getSeries();
    $("#file-attach-target").innerHTML =
      series
        .map((s) => `<option value="${esc(s.id)}">${esc(s.title)}</option>`)
        .join("") + '<option value=":new">＋ Crear una serie</option>';
    $("#file-attach-target").value =
      target && get(target) ? target : series[0]?.id || ":new";
    $("#file-attach-error").textContent = "";
    drawAttach();
    $("#file-attach").showModal();
  }
  // Muestra los archivos disponibles para vincular, respetando la búsqueda y la selección actuales.
  function drawAttach() {
    const target = $("#file-attach-target").value;
    $("#file-new-title-label").hidden = target !== ":new";
    const books = reader.getBooks();
    $("#file-attach-list").innerHTML = books.length
      ? books
          .map((book) => {
            const elsewhere = book.seriesId && book.seriesId !== target;
            return `<label class="attach-book"><input type="checkbox" value="${esc(book.id)}" ${selection.includes(book.id) ? "checked" : ""}><span><strong>${esc(book.name)}</strong><small>${book.source === "drive" ? "Drive" : "Archivo local"}${elsewhere ? " · Se moverá desde " + esc(get(book.seriesId)?.title || "otra serie") : ""}</small></span></label>`;
          })
          .join("")
      : "<p>No hay archivos en el lector. Impórtalos aquí o sincroniza tu carpeta de Drive desde Lector.</p>";
  }
  // Guarda la relación entre archivos y serie y actualiza su referencia de lectura.
  // La identidad se vuelve a comprobar al terminar operaciones asíncronas para no escribir en otra cuenta.
  async function assign(ids, target) {
    const owner = getOwner(),
      currentGeneration = generation;
    const series = get(target);
    if (!series) throw new Error("La serie ya no existe.");
    const updates = assignIssues(
      reader.getBooks(),
      ids,
      target,
      fileSeriesInfo(series),
    );
    if (
      !(await reader.updateBooks(updates)) ||
      owner !== getOwner() ||
      currentGeneration !== generation
    )
      return false;
    const current = get(target),
      fileInfo = fileSeriesInfo(current);
    if (!current) throw new Error("La serie ya no existe.");
    const next = {
      ...current,
      url: fileInfo ? current.url : fileSeriesUrl(current),
      status:
        current.status === "finished" && updates.some((b) => !b.finished)
          ? "reading"
          : current.status,
      updatedAt: new Date().toISOString(),
    };
    if (!(await save(getSeries().map((s) => (s.id === target ? next : s)))))
      throw new Error(
        "Los archivos están vinculados en este navegador, pero no se pudo guardar la serie. Vuelve a intentarlo.",
      );
    return true;
  }
  // Recibe el avance real del lector y lo convierte en una edición de biblioteca sincronizable.
  async function progress(book) {
    if (!book.seriesId || !book.issue) return;
    const snapshot = { ...book },
      owner = getOwner(),
      current = generation;
    queue = queue
      .catch(() => {})
      .then(async () => {
        if (owner !== getOwner() || current !== generation) return;
        const series = get(snapshot.seriesId);
        if (!series) return;
        const next = fileSeriesProgress(series, snapshot, reader.getBooks());
        if (!next) return;
        if (
          !(await save(getSeries().map((s) => (s.id === next.id ? next : s))))
        )
          throw new Error("No se pudo actualizar el progreso de la serie.");
        drawManage();
      });
    return queue;
  }
  $("#series-issues-import").onclick = () => $("#series-issue-files").click();
  $("#series-issue-files").onchange = async (event) => {
    if (working) return;
    working = true;
    const target = managing,
      owner = getOwner(),
      current = generation;
    $("#series-issues-message").textContent = "Importando números…";
    try {
      const ids = await reader.importFiles([...event.target.files]);
      if (owner !== getOwner() || current !== generation) return;
      if (!ids?.length) {
        $("#series-issues-message").textContent =
          "No se añadieron archivos. Comprueba que sean CBR/CBZ válidos y que haya espacio.";
        return;
      }
      if (await assign(ids, target)) {
        $("#series-issues-message").textContent =
          `${ids.length} números vinculados a la serie.`;
        refresh();
      }
    } catch (error) {
      $("#series-issues-message").textContent = error.message;
    } finally {
      working = false;
      event.target.value = "";
    }
  };
  $("#series-issues-link").onclick = () => attach(null, managing);
  $("#series-drive-connect").onclick = () => reader.connectDrive();
  $("#series-drive-sync").onclick = async () => {
    $("#series-issues-message").textContent = "";
    await reader.syncDrive();
  };
  $("#series-drive-browse").onclick = () => {
    const target = managing,
      info = fileSeriesInfo(get(target));
    reader.chooseDriveFolder({
      folder: info?.driveFolder,
      recursive: info?.driveRecursive !== false,
      onSelect: async ({ folder, recursive }) => {
        if (managing !== target)
          throw new Error("La serie ha cambiado. Vuelve a elegir la carpeta.");
        if (working)
          throw new Error("Espera a que termine la operación actual.");
        working = true;
        try {
          await bindDriveFolder(folder, recursive);
        } finally {
          working = false;
          scheduleDriveLinks();
        }
      },
    });
  };
  $("#series-drive-form").onsubmit = async (event) => {
    event.preventDefault();
    if (working) return;
    working = true;
    try {
      await bindDriveFolder(
        $("#series-drive-folder").value.trim(),
        $("#series-drive-recursive").checked,
      );
    } catch (error) {
      $("#series-issues-message").textContent = error.message;
    } finally {
      working = false;
      scheduleDriveLinks();
    }
  };
  $("#series-drive-unlink").onclick = async () => {
    if (working) return;
    working = true;
    try {
      await bindDriveFolder(null, true);
    } catch (error) {
      $("#series-issues-message").textContent = error.message;
    } finally {
      working = false;
      scheduleDriveLinks();
    }
  };
  $("#file-attach-target").onchange = () => {
    selection = [
      ...$("#file-attach-list").querySelectorAll("input:checked"),
    ].map((input) => input.value);
    drawAttach();
  };
  $("#file-attach-form").onsubmit = async (event) => {
    event.preventDefault();
    if (working) return;
    working = true;
    const owner = getOwner(),
      current = generation;
    try {
      const ids = [
        ...$("#file-attach-list").querySelectorAll("input:checked"),
      ].map((input) => input.value);
      if (!ids.length) throw new Error("Selecciona al menos un archivo.");
      let target = $("#file-attach-target").value;
      const selected = reader.getBooks().filter((b) => ids.includes(b.id));
      if (
        selected.some((b) => b.seriesId && b.seriesId !== target) &&
        !confirm(
          "¿Mover los archivos seleccionados a esta serie? Seguirán disponibles en el lector.",
        )
      )
        return;
      if (target === ":new") {
        target = crypto.randomUUID();
        const raw = {
          id: target,
          title: $("#file-new-title").value.trim(),
          publisher: "",
          status: "pending",
          lastRead: 0,
          total: null,
          cover: "",
          notes: "",
          url: "",
        };
        raw.url = fileSeriesUrl(raw);
        const series = validateSeries(raw);
        if (getSeries().length >= 2000)
          throw new Error("Has alcanzado el límite de 2000 series.");
        if (!(await save([...getSeries(), series]))) return;
      }
      if (owner !== getOwner() || current !== generation) return;
      if (await assign(ids, target)) {
        if (owner !== getOwner() || current !== generation) return;
        $("#file-attach").close();
        manage(target);
        refresh();
      }
    } catch (error) {
      $("#file-attach-error").textContent = error.message;
    } finally {
      working = false;
    }
  };
  $("#series-issues-list").addEventListener("click", async (event) => {
    const open = event.target.closest("[data-issue-open]"),
      unlink = event.target.closest("[data-issue-unlink]");
    try {
      if (open) await play(managing, open.dataset.issueOpen);
      if (
        unlink &&
        confirm(
          "¿Desvincular este número de la serie? El archivo y su progreso seguirán en el Lector.",
        )
      ) {
        const book = reader
          .getBooks()
          .find((b) => b.id === unlink.dataset.issueUnlink);
        if (book)
          await reader.updateBooks([
            {
              ...book,
              seriesId: null,
              issue: null,
              // Recordamos esta decisión para que la carpeta no vuelva a
              // vincular el número que se acaba de retirar manualmente.
              excludedSeries: [
                ...new Set([...(book.excludedSeries || []), managing]),
              ],
            },
          ]);
        refresh();
      }
    } catch (error) {
      toast(error.message);
    }
  });
  $("#series-issues-list").addEventListener("change", async (event) => {
    const input = event.target.closest("[data-issue-number]");
    if (!input) return;
    const book = reader
        .getBooks()
        .find((b) => b.id === input.dataset.issueNumber),
      issue = Number(input.value);
    try {
      if (!book || !Number.isInteger(issue) || issue < 1 || issue > 99999)
        throw new Error("El número debe ser un entero entre 1 y 99999.");
      if (linked(managing).some((b) => b.id !== book.id && b.issue === issue))
        throw new Error("Ya hay otro archivo con ese número.");
      await reader.updateBooks([{ ...book, issue }]);
      refresh();
    } catch (error) {
      toast(error.message);
      drawManage();
    }
  });
  document.addEventListener("click", async (event) => {
    const manageButton = event.target.closest("[data-files-series]"),
      readButton = event.target.closest("[data-files-play]");
    try {
      if (manageButton) {
        event.preventDefault();
        manage(manageButton.dataset.filesSeries);
      }
      if (readButton) {
        event.preventDefault();
        $("#details").close();
        await play(readButton.dataset.filesPlay);
      }
    } catch (error) {
      toast(error.message);
    }
  });
  window.addEventListener("panelverse:account-changed", () => {
    generation++;
    managing = null;
    selection = [];
    for (const id of ["series-issues", "file-attach"]) $("#" + id).close();
  });
  reader.ready.then(refresh);
  return {
    summary,
    decorate,
    refresh,
    manage,
    attach,
    progress,
    // También se ven los errores al abrir desde la biblioteca, aunque la
    // sección independiente del Lector esté oculta detrás de esta ficha.
    showError(message) {
      if ($("#series-issues").open)
        $("#series-issues-message").textContent = message;
    },
  };
}
