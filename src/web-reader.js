import {
  WEB_PROTOCOL,
  cleanReadingUrl,
  readingPage,
  readingScope,
  validateWebLocation,
  applyWebLocation,
} from "./web-progress.js";
const $ = (selector) => document.querySelector(selector);
export function initializeWebReader({ getSeries, getOwner, save }) {
  let active = null,
    timer = null,
    handshake = null,
    warning = null,
    pending = null,
    queue = Promise.resolve();
  function status(text) {
    $("#web-reader-state").textContent = text;
  }
  function beginHandshake() {
    if (!active) return;
    active.ready = false;
    clearInterval(handshake);
    handshake = setInterval(init, 750);
    init();
  }
  function init() {
    if (!active) return;
    try {
      active.target?.postMessage(
        {
          type: "panelverse:init",
          version: WEB_PROTOCOL,
          channel: active.channel,
          resume: active.resume,
        },
        active.scope.origin,
      );
    } catch {
      status(
        "No se pudo comunicar con esta web. Prueba Recargar o Abrir original.",
      );
    }
  }
  function flush() {
    clearTimeout(timer);
    const job = pending;
    pending = null;
    if (!job) return queue;
    queue = queue
      .catch(() => {})
      .then(async () => {
        if (job.owner !== getOwner() || job.cancelled) return;
        try {
          const current = getSeries().find((s) => s.id === job.id);
          if (!current || !validateCurrent(current, job.scope)) return;
          const next = applyWebLocation(current, job.location);
          if (
            next.url === current.url &&
            next.lastRead === current.lastRead &&
            next.status === current.status
          )
            return;
          const success = await save(
            getSeries().map((s) => (s.id === next.id ? next : s)),
          );
          if (success && active?.channel === job.channel)
            status("Posición guardada en tu biblioteca.");
          else if (!success && active?.channel === job.channel)
            status("No se pudo guardar la posición. Comprueba tu biblioteca.");
        } catch (error) {
          if (active?.channel === job.channel) status(error.message);
        }
      });
    return queue;
  }
  function validateCurrent(series, scope) {
    try {
      return JSON.stringify(readingScope(series.url)) === JSON.stringify(scope);
    } catch {
      return false;
    }
  }
  async function close({ discard = false } = {}) {
    clearInterval(handshake);
    clearTimeout(warning);
    if (discard) {
      if (pending) pending.cancelled = true;
      pending = null;
    }
    const previous = active;
    active = null;
    previous?.popup?.close();
    $("#web-frame").src = "about:blank";
    $("#web-reader").close();
    if (!discard) await flush();
    if (previous) status("");
  }
  function open(series) {
    const url = cleanReadingUrl(series.url);
    if (!/^https?:/.test(url)) return;
    active = {
      id: series.id,
      owner: getOwner(),
      scope: readingScope(url),
      channel: crypto.randomUUID(),
      resume: { url, page: readingPage(series.url) },
      ready: false,
      target: $("#web-frame").contentWindow,
    };
    $("#web-reader-title").textContent = series.title;
    $("#web-external").href = url;
    $("#web-script-host").textContent = new URL(url).host;
    $("#web-frame").hidden = false;
    $("#web-popup-note").hidden = true;
    $("#web-frame").src = url;
    $("#web-reader").showModal();
    status(
      "Esperando al puente de lectura… Sin él no podemos detectar las páginas.",
    );
    clearInterval(handshake);
    handshake = setInterval(init, 750);
    clearTimeout(warning);
    warning = setTimeout(() => {
      if (active && !active.ready)
        status(
          "No se ha detectado el puente. Instálalo para esta web y recarga. Si bloquea el contenedor, prueba Pestaña conectada.",
        );
    }, 10000);
  }
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[data-web-series]");
    if (
      !link ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const series = getSeries().find((s) => s.id === link.dataset.webSeries);
    if (!series) return;
    event.preventDefault();
    $("#details").close();
    open(series);
  });
  $("#web-frame").addEventListener("load", () => {
    if (!active?.popup) beginHandshake();
  });
  $("#web-close").onclick = () => close();
  $("#web-reader").addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  $("#web-reload").onclick = async () => {
    await flush();
    if (!active) return;
    const url =
      getSeries().find((s) => s.id === active.id)?.url || active.resume.url;
    active.resume = { url: cleanReadingUrl(url), page: readingPage(url) };
    if (active.popup && !active.popup.closed)
      active.popup.location.href = active.resume.url;
    else $("#web-frame").src = active.resume.url;
  };
  $("#web-popup").onclick = () => {
    if (!active) return;
    const popup = window.open("about:blank", "panelverse-" + active.channel);
    if (!popup) {
      status(
        "El navegador ha bloqueado la pestaña. Permite abrir ventanas para PanelVerse.",
      );
      return;
    }
    // The bridge is initiated by PanelVerse through its retained WindowProxy, without a window.opener.
    popup.opener = null;
    popup.location.href = active.resume.url;
    active.popup = popup;
    active.target = popup;
    active.ready = false;
    $("#web-frame").src = "about:blank";
    $("#web-frame").hidden = true;
    $("#web-popup-note").hidden = false;
    status(
      "Esperando al puente en la pestaña conectada… Mantén PanelVerse abierto.",
    );
    beginHandshake();
  };
  setInterval(() => {
    if (active?.popup?.closed) close();
  }, 1000);
  async function bridgeText() {
    const session = active;
    if (!session) throw new Error("Abre una lectura primero.");
    const source = new URL("./web-bridge.user.js", import.meta.url);
    source.search = new URL(import.meta.url).search;
    const response = await fetch(source);
    if (!response.ok) throw new Error("No se pudo cargar el script.");
    return (await response.text()).replace(
      /^\/\/ @match\s+.*$/m,
      "// @match        " + session.scope.origin + "/*",
    );
  }
  $("#web-script-download").onclick = async () => {
    try {
      const text = await bridgeText(),
        blob = new Blob([text], { type: "text/javascript" }),
        url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download =
        "panelverse-" + new URL(active.scope.origin).hostname + ".user.js";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      status(
        "Script descargado. Instálalo en tu gestor de scripts, permite el acceso a esta web y pulsa Recargar.",
      );
    } catch (error) {
      status(error.message);
    }
  };
  $("#web-script-copy").onclick = async () => {
    try {
      await navigator.clipboard.writeText(await bridgeText());
      status("Script copiado. Pégalo en el gestor de scripts de tu navegador.");
    } catch {
      status("No se pudo copiar. Utiliza Descargar puente.");
    }
  };
  window.addEventListener("message", (event) => {
    const session = active,
      data = event.data;
    if (
      !session ||
      event.source !== session.target ||
      event.origin !== session.scope.origin ||
      data?.channel !== session.channel ||
      data.version !== WEB_PROTOCOL
    )
      return;
    if (data.type === "panelverse:ready") {
      if (session.ready) return;
      session.ready = true;
      clearTimeout(warning);
      if (!session.popup) clearInterval(handshake);
      $("#web-setup").open = false;
      status("Puente conectado. Detectando la página visible…");
      return;
    }
    if (data.type === "panelverse:unsupported") {
      status(
        "El puente está conectado, pero no reconoce el lector de esta web. Necesita un adaptador específico.",
      );
      return;
    }
    if (data.type !== "panelverse:location") return;
    try {
      const location = validateWebLocation(data, session.scope);
      session.ready = true;
      session.resume = { url: location.url, page: location.page };
      pending = { ...session, location };
      status(
        `Página ${location.page + 1} de ${location.pages}${location.chapter !== null ? " · #" + location.chapter : ""} · Guardando…`,
      );
      clearTimeout(timer);
      timer = setTimeout(flush, 600);
    } catch {
      status(
        "Se ha ignorado una posición fuera de la serie o con formato incorrecto.",
      );
    }
  });
  window.addEventListener("panelverse:account-changed", () =>
    close({ discard: true }),
  );
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) flush();
  });
}
