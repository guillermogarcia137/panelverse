(() => {
  const { themes, palette } = globalThis.PanelVerseThemeKit;
  const key = "panelverse.theme.v1",
    fallback = "github-navy";
  const find = (id) =>
    themes.find((t) => t.id === id) || themes.find((t) => t.id === fallback);
  const root = document.documentElement;
  let current = fallback,
    filter = "all",
    query = "";
  try {
    current = find(localStorage.getItem(key)).id;
  } catch {}
  const fontSans =
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif";
  const fontMono = "'Cascadia Code', 'SFMono-Regular', Consolas, monospace";
  // Aplica las variables CSS del tema al documento; el evento del selector se encarga de guardar la elección.
  function apply(id) {
    const t = palette(find(id));
    current = t.id;
    root.dataset.theme = t.id;
    root.dataset.themeStyle = t.style;
    root.dataset.themeMode = t.mode;
    for (const [name, value] of Object.entries({
      bg: t.bg,
      surface: t.surface,
      line: t.border,
      text: t.text,
      muted: t.muted,
      blue: t.accent,
      ice: t.link,
      "t-sidebar": t.sidebar,
      "t-sidebar-text": t.sidebarText,
      "t-sidebar-muted": t.sidebarMuted,
      "t-soft": t.soft,
      "t-hover": t.hover,
      "t-ink": t.ink,
      "t-link": t.link,
      "t-danger": t.danger,
      ui: fontSans,
    }))
      root.style.setProperty("--" + name, value);
    root.style.colorScheme = t.mode;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", t.bg);
    const label = document.querySelector("#current-theme");
    if (label) label.textContent = t.label;
    document.querySelectorAll("[data-theme-choice]").forEach((b) => {
      const active = b.dataset.themeChoice === t.id;
      b.setAttribute("aria-pressed", String(active));
      b.classList.toggle("selected", active);
    });
    const active = document.querySelector("#active-theme-label");
    if (active) active.textContent = t.label;
    return t;
  }
  apply(current);
  document.addEventListener("DOMContentLoaded", () => {
    const $ = (s) => document.querySelector(s),
      dialog = $("#theme-gallery");
    const escape = (s) =>
      String(s).replace(
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
    function card(t) {
      const p = palette(t);
      return `<button type="button" class="theme-card${current === t.id ? " selected" : ""}" data-theme-choice="${t.id}" aria-label="Aplicar tema ${escape(t.label)}" aria-pressed="${current === t.id}" style="--preview-bg:${t.bg};--preview-surface:${t.surface};--preview-side:${t.sidebar};--preview-text:${t.text};--preview-accent:${t.accent};--preview-border:${t.border};--preview-ink:${p.ink}"><span class="theme-mini" aria-hidden="true" data-mini-style="${t.style}"><span class="mini-side"><i></i><i></i><i></i></span><span class="mini-content"><span class="mini-title">PanelVerse<span>.</span></span><span class="mini-line"></span><span class="mini-books"><i></i><i></i><i></i></span><span class="mini-action"></span></span><span class="mini-check">✓</span></span><span class="theme-card-title">${escape(t.label)}</span><span class="theme-card-meta">${escape(t.group)} · ${t.mode === "light" ? "Claro" : "Oscuro"}<span class="theme-swatches" aria-hidden="true"><i style="background:${t.bg}"></i><i style="background:${t.text}"></i><i style="background:${t.accent}"></i></span></span></button>`;
    }
    function render() {
      const list = themes.filter(
        (t) =>
          (filter === "all" ||
            (filter === "featured" && t.featured) ||
            (filter === "light" && t.mode === "light") ||
            (filter === "dark" && t.mode === "dark") ||
            (filter === "omarchy" && t.group === "Omarchy")) &&
          (t.label + " " + t.group)
            .toLocaleLowerCase("es")
            .includes(query.toLocaleLowerCase("es")),
      );
      $("#theme-grid").innerHTML = list.length
        ? list.map(card).join("")
        : '<p class="theme-empty">No hay temas con ese nombre. Prueba otra búsqueda.</p>';
      $("#theme-count").textContent =
        `${list.length} de ${themes.length} temas`;
      document
        .querySelectorAll("[data-theme-filter]")
        .forEach((b) =>
          b.setAttribute(
            "aria-pressed",
            String(b.dataset.themeFilter === filter),
          ),
        );
    }
    $("#theme-button").addEventListener("click", () => {
      apply(current);
      render();
      dialog.showModal();
      document.querySelector(".gallery-scroll").scrollTop = 0;
    });
    $("#theme-search").addEventListener("input", (e) => {
      query = e.target.value;
      render();
    });
    $("#theme-filters").addEventListener("click", (e) => {
      const b = e.target.closest("[data-theme-filter]");
      if (b) {
        filter = b.dataset.themeFilter;
        render();
      }
    });
    $("#theme-grid").addEventListener("click", (e) => {
      const b = e.target.closest("[data-theme-choice]");
      if (!b) return;
      const t = apply(b.dataset.themeChoice);
      try {
        localStorage.setItem(key, t.id);
        $("#theme-status").textContent =
          `Tema ${t.label} guardado en este navegador.`;
      } catch {
        $("#theme-status").textContent =
          "Tema aplicado; el navegador no permite guardar la preferencia.";
      }
    });
    window.addEventListener("storage", (e) => {
      if (e.key === key) apply(e.newValue);
    });
    apply(current);
    render();
  });
})();
