export const STORAGE_KEY = 'panelverse.library.v1';
export const statuses = {reading: 'Leyendo', pending: 'Pendiente', finished: 'Terminado'};
export const seed = [{id:'superman-2023',title:'Superman (2023)',publisher:'DC Comics',status:'pending',lastRead:0,total:null,url:'https://marmota.me/comic/superman-2023/superman-35/',cover:'./assets/superman.svg',notes:'Serie de ejemplo. Enlace de referencia al #35. Ajusta el último número leído y el enlace a tu progreso real.',updatedAt:'2026-11-10T12:00:00.000Z'}];
export function httpUrl(value, optional = false) {
  if (!value && optional) return '';
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Usa enlaces http:// o https:// sin credenciales.');
  if(parsed.href.length>2048)throw new Error('Los enlaces no pueden superar 2048 caracteres.');
  return parsed.href;
}
export function validateSeries(input) {
  if (!input || typeof input !== 'object') throw new Error('La serie no tiene un formato válido.');
  const title = String(input.title ?? '').trim();
  if (!title || title.length > 120) throw new Error('El título debe tener entre 1 y 120 caracteres.');
  if (!Object.hasOwn(statuses,input.status)) throw new Error('Estado de lectura no válido.');
  const lastRead = Number(input.lastRead);
  const total = input.total === '' || input.total == null ? null : Number(input.total);
  if (!Number.isInteger(lastRead) || lastRead < 0 || lastRead > 99999) throw new Error('El último número leído debe ser un entero entre 0 y 99999.');
  if (total !== null && (!Number.isInteger(total) || total < 1 || total > 99999 || lastRead > total)) throw new Error('El total debe ser mayor o igual al último número leído.');
  const id = input.id ? String(input.id) : crypto.randomUUID();
  if (!/^[\w-]{1,100}$/.test(id)) throw new Error('Identificador de serie no válido.');
  const cover = input.cover === './assets/superman.svg' ? input.cover : httpUrl(input.cover || '', true);
  return {id,title,publisher:String(input.publisher || '').slice(0,60),status:input.status,lastRead,total,url:httpUrl(input.url),cover,notes:String(input.notes || '').slice(0,2000),updatedAt:typeof input.updatedAt === 'string' && Number.isFinite(Date.parse(input.updatedAt)) ? new Date(input.updatedAt).toISOString() : new Date().toISOString()};
}
export function parseBackup(text) {
  const data = JSON.parse(text);
  if (data?.version !== 1 || !Array.isArray(data.series) || data.series.length > 2000) throw new Error('Elige una copia PanelVerse v1 con un máximo de 2000 series.');
  const result = data.series.map(validateSeries);
  if (new Set(result.map(s=>s.id)).size !== result.length) throw new Error('La copia contiene identificadores duplicados.');
  return result;
}
export function mergeSeries(current, incoming) {
  const map = new Map(current.map(s=>[s.id,s]));
  incoming.forEach(s=>map.set(s.id,s));
  if (map.size > 2000) throw new Error('La biblioteca puede contener hasta 2000 series.');
  return [...map.values()];
}
export function advance(series) {
  const lastRead = Math.min(series.lastRead + 1, series.total ?? 99999);
  return {...series,lastRead,status:series.total && lastRead >= series.total ? 'finished' : 'reading',updatedAt:new Date().toISOString()};
}
export function selectSeries(series, filter='all', query='', sort='recent') {
  const normalize = value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  return series.filter(s=>(filter==='all'||s.status===filter)&&normalize(s.title+' '+s.publisher).includes(normalize(query.trim()))).sort((a,b)=>sort==='title'?a.title.localeCompare(b.title,'es'):sort==='progress'?b.lastRead-a.lastRead:Date.parse(b.updatedAt)-Date.parse(a.updatedAt));
}
