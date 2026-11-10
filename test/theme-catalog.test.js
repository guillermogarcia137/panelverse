import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const context={};
runInNewContext(readFileSync(new URL('../src/theme-catalog.js',import.meta.url),'utf8'),context);
const {themes,palette,contrast}=context.PanelVerseThemeKit;
test('el catálogo conserva los estilos existentes y contiene 42 temas únicos',()=>{
  assert.equal(themes.length,42);assert.equal(new Set(themes.map(t=>t.id)).size,42);
  for(const id of ['navy-original','navy-sans','github-navy'])assert.ok(themes.some(t=>t.id===id));
  assert.equal(themes.filter(t=>t.group==='Omarchy').length,22);
});
test('todas las paletas contienen colores hexadecimales completos',()=>{
  for(const t of themes)for(const key of ['bg','surface','sidebar','text','muted','accent','border'])assert.match(t[key],/^#[a-f\d]{6}$/i,`${t.id}: ${key}`);
});
test('texto principal, secundario y lateral mantienen contraste legible',()=>{
  for(const t of themes){const p=palette(t);for(const [fg,bg] of [[p.text,p.bg],[p.text,p.surface],[p.muted,p.surface],[p.sidebarText,p.sidebar],[p.sidebarMuted,p.sidebar]])assert.ok(contrast(fg,bg)>=4.5,`${t.id}: contraste ${fg} / ${bg}`);}
});
test('los botones y enlaces ajustan su contraste a cada tema',()=>{
  for(const t of themes){const p=palette(t);assert.ok(contrast(p.ink,p.accent)>=4.5,`${t.id}: botón`);assert.ok(contrast(p.link,p.surface)>=4.5,`${t.id}: enlace`);}
});
