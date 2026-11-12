import { validateSeries } from "./model.js";
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
    working = false;
  const get = (id) => getSeries().find((s) => s.id === id);
  const linked = (id) => seriesBooks(reader.getBooks(), id);
  function summary(series) {
    const list = linked(series.id),
      info = fileSeriesInfo(series);
    const current = list.find((b) => b.id === info?.book);
    return `${list.length} número${list.length === 1 ? "" : "s"} en este dispositivo${info?.book ? ` · #${info.issue} · página ${info.page + 1}${current?.pages ? " / " + current.pages : ""}` : ""}`;
  }
  function decorate() {
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
  function drawManage() {
    const series = get(managing);
    if (!series || !$("#series-issues").open) return;
    $("#series-issues-title").textContent = series.title;
    $("#series-issues-summary").textContent = summary(series);
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
  function refresh() {
    renderLibrary();
    drawManage();
    const id = new URL(location.href).searchParams.get("pvCollection");
    if (!deepOpened && id && get(id)) {
      deepOpened = true;
      manage(id);
    }
  }
  function manage(id) {
    if (!get(id)) return;
    managing = id;
    $("#details").close();
    if (!$("#series-issues").open) $("#series-issues").showModal();
    drawManage();
  }
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
      resumePage = book.finished
        ? 0
        : info?.book === book.id
          ? info.page
          : null;
    await reader.openBook(book.id, { resumePage });
  }
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
  async function assign(ids, target) {
    const series = get(target);
    if (!series) throw new Error("La serie ya no existe.");
    const updates = assignIssues(
      reader.getBooks(),
      ids,
      target,
      fileSeriesInfo(series),
    );
    if (!(await reader.updateBooks(updates))) return false;
    const current = get(target),
      fileInfo = fileSeriesInfo(current);
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
          await reader.updateBooks([{ ...book, seriesId: null, issue: null }]);
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
  return { summary, decorate, refresh, manage, attach, progress };
}
