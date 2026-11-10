(() => {
  const key = 'panelverse.theme.v1';
  const themes = {
    'navy-original': {label: 'Navy · Técnico', color: '#080f20'},
    'navy-sans': {label: 'Navy · Sans', color: '#080f20'},
    'github-navy': {label: 'GitHub · Navy', color: '#0b1220'}
  };
  const fallback = 'github-navy';
  const normalize = value => Object.hasOwn(themes, value) ? value : fallback;
  let current = fallback;
  try { current = normalize(localStorage.getItem(key)); } catch { /* La interfaz sigue disponible sin almacenamiento. */ }
  function apply(value) {
    current = normalize(value);
    document.documentElement.dataset.theme = current;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themes[current].color);
    const select = document.querySelector('#theme-select');
    if (select) select.value = current;
  }
  apply(current);
  document.addEventListener('DOMContentLoaded', () => {
    const select = document.querySelector('#theme-select');
    for (const [value, theme] of Object.entries(themes)) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = theme.label;
      select.append(option);
    }
    select.value = current;
    select.addEventListener('change', () => {
      apply(select.value);
      const status = document.querySelector('#theme-status');
      try {
        localStorage.setItem(key, current);
        status.textContent = `Estilo ${themes[current].label} guardado en este navegador.`;
      } catch {
        status.textContent = 'Estilo aplicado. El navegador no permite guardar la preferencia.';
      }
    });
    window.addEventListener('storage', event => {
      if (event.key === key) apply(event.newValue);
    });
  });
})();
