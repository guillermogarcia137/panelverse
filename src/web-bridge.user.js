// ==UserScript==
// @name         PanelVerse · Puente de lectura
// @namespace    https://guillermogarcia137.github.io/panelverse/
// @version      1.0.0
// @description  Comunica páginas visibles y enlaces de capítulo al contenedor de PanelVerse.
// @match        https://marmota.me/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
(() => {
  "use strict";
  if (window.__panelverseBridge) return;
  window.__panelverseBridge = true;
  const APP_ORIGINS = [
    "https://guillermogarcia137.github.io",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://127.0.0.1:4174",
  ];
  let connection = null,
    timer = null,
    restoring = false,
    lastReport = "",
    lastImages = [];
  const selectors = [
    ".reading-content img.wp-manga-chapter-img",
    "#readerarea img",
    ".reader-area img",
    ".chapter-content img",
    ".chapter-images img",
    ".reader-pages img",
    ".reading-content img",
  ];
  function pages() {
    for (const selector of selectors) {
      const images = [...document.querySelectorAll(selector)].filter(
        (img) => img.getBoundingClientRect().width > 0,
      );
      if (images.length) return images;
    }
    return [];
  }
  function clean(value) {
    const url = new URL(value, location.href);
    url.searchParams.delete("panelversePage");
    return url.href;
  }
  function chapterNumber() {
    const selected = document.querySelector(
      ".chapter-selection select option:checked,select.selectpicker_chapter option:checked",
    );
    const label = selected?.textContent || "";
    const labeled = label.match(/#\s*(\d+)(?![\d.])(?:\s|$)/);
    if (labeled) return Number(labeled[1]);
    const slug =
      document.querySelector(".chapter-selection[data-chapter]")?.dataset
        .chapter ||
      new URL(location.href).pathname.split("/").filter(Boolean).pop() ||
      "";
    if (/-\d+-\d+$/.test(slug)) return null;
    const match = slug.match(/(?:^|[-_])(?:chapter[-_]|capitulo[-_])?(\d+)$/i);
    return match && Number(match[1]) <= 99999 ? Number(match[1]) : null;
  }
  function nextLink() {
    const link = document.querySelector(
      'a.next_page:not(.disabled),a[rel="next"],.chapter-nav a.next,.reader-navigation a.next',
    );
    if (!link) return null;
    try {
      const url = new URL(link.href);
      return url.origin === location.origin && url.href !== clean(location.href)
        ? url.href
        : null;
    } catch {
      return null;
    }
  }
  function send(data) {
    if (connection)
      connection.target.postMessage(
        { ...data, version: 1, channel: connection.channel },
        connection.origin,
      );
  }
  function report() {
    if (!connection || restoring || document.hidden) return;
    const images = pages();
    lastImages = images;
    if (!images.length) {
      send({ type: "panelverse:unsupported" });
      return;
    }
    const height = innerHeight,
      anchor = height * 0.4;
    let index = -1,
      distance = Infinity;
    images.forEach((img, i) => {
      const box = img.getBoundingClientRect();
      if (
        box.bottom <= 0 ||
        box.top >= height ||
        !img.complete ||
        !img.naturalWidth
      )
        return;
      const d =
        box.top <= anchor && box.bottom >= anchor
          ? 0
          : Math.min(Math.abs(box.top - anchor), Math.abs(box.bottom - anchor));
      if (d < distance) {
        index = i;
        distance = d;
      }
    });
    if (index < 0) return;
    const last = images.at(-1),
      rect = last.getBoundingClientRect();
    const completed =
      index === images.length - 1 &&
      last.complete &&
      last.naturalWidth > 0 &&
      rect.bottom <= height + 8;
    const payload = {
      type: "panelverse:location",
      url: clean(location.href),
      page: index,
      pages: images.length,
      chapter: chapterNumber(),
      completed: !!completed,
      next: nextLink(),
    };
    const signature = JSON.stringify(payload);
    if (signature !== lastReport) {
      lastReport = signature;
      send(payload);
    }
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(report, 450);
  }
  async function restore(resume) {
    const images = pages();
    if (!resume || clean(resume.url) !== clean(location.href) || !images.length)
      return;
    const page = Math.min(
        images.length - 1,
        Math.max(0, Number(resume.page) || 0),
      ),
      image = images[page];
    restoring = true;
    image.scrollIntoView({ block: "start" });
    // Lazy readers often assign the actual source only after the page becomes visible.
    if (!image.complete || !image.naturalWidth)
      await Promise.race([
        new Promise((resolve) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        }),
        new Promise((resolve) => setTimeout(resolve, 4000)),
      ]);
    if (!connection) return;
    image.scrollIntoView({ block: "start" });
    restoring = false;
    schedule();
  }
  window.addEventListener("message", (event) => {
    if (
      (window.parent !== window && event.source !== window.parent) ||
      (connection && connection.target !== event.source) ||
      !APP_ORIGINS.includes(event.origin) ||
      event.data?.type !== "panelverse:init" ||
      event.data.version !== 1 ||
      !/^[\w-]{16,100}$/.test(event.data.channel || "")
    )
      return;
    const first = connection?.channel !== event.data.channel;
    connection = {
      origin: event.origin,
      channel: event.data.channel,
      target: event.source,
    };
    send({ type: "panelverse:ready" });
    if (first) {
      restore(event.data.resume).then(schedule);
      schedule();
    }
  });
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", schedule);
  addEventListener("load", schedule, true);
  document.addEventListener("visibilitychange", schedule);
  // Also detects chapters replaced in place by a site's own reader.
  setInterval(() => {
    if (connection && (!lastImages.length || pages()[0] !== lastImages[0]))
      schedule();
  }, 1500);
})();
