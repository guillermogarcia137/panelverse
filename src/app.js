import {initializeReader} from './reader.js';
import {STORAGE_KEY,statuses,seed,validateSeries,parseBackup,mergeSeries,advance,selectSeries} from './model.js';
import {initializeAccount,getAccountClient} from './account.js';
import {accountStorageKey} from './account-model.js';
import {createLibrarySync} from './library-sync.js';
const $ = s=>document.querySelector(s);
const escape = value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let series=[],filter='all',loadFailed=false,activeStorageKey=STORAGE_KEY,activeUserId=null,syncEngine=null,editorBaseline=null,editorSaving=false;
function loadLibrary(userId=null){activeStorageKey=accountStorageKey(userId);series=[];loadFailed=false;try{const raw=localStorage.getItem(activeStorageKey);series=raw===null?(userId?[]:structuredClone(seed)):parseBackup(raw);}catch{loadFailed=true;}}
loadLibrary();
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),5000);}
async function save(next){
  if(loadFailed){toast('No se pudo leer la biblioteca guardada. Exporta los datos originales desde Copias de seguridad antes de continuar.');return false;}
  const engine=syncEngine,owner=activeUserId,baseline=structuredClone(series);
  try{
    if(owner){if(!engine)throw new Error('La biblioteca de la cuenta aún no está preparada.');await engine.commit(baseline,next);if(owner!==activeUserId)return false;}
    else{localStorage.setItem(activeStorageKey,JSON.stringify({version:1,series:next}));series=next;render();}
    return true;
  }catch(error){toast(error.message||'No se pudo guardar. Exporta una copia y comprueba el almacenamiento del navegador.');return false;}
}
function cover(s,cls=''){return `<div class="cover ${cls}"><div class="cover-fallback"><span>PV / ${escape(s.publisher||'TU COLECCIÓN')}</span><strong>${escape(s.title)}</strong><small>UNA HISTORIA POR DESCUBRIR</small></div>${s.cover?`<img src="${escape(s.cover)}" alt="Portada de ${escape(s.title)}" loading="lazy" referrerpolicy="no-referrer">`:''}</div>`;}
function imageFallbacks(){document.querySelectorAll('.cover img').forEach(img=>img.addEventListener('error',()=>img.remove(),{once:true}));}
function progress(s){return s.total?`<div class="progress" role="progressbar" aria-label="Progreso de ${escape(s.title)}" aria-valuenow="${s.lastRead}" aria-valuemin="0" aria-valuemax="${s.total}"><span style="width:${s.lastRead/s.total*100}%"></span></div>`:'';}
function render(){
  for(const key of ['all',...Object.keys(statuses)]) $(`#count-${key}`).textContent=series.filter(s=>key==='all'||s.status===key).length;
  const list=selectSeries(series,filter,$('#search').value,$('#sort').value);
  $('#library-title').innerHTML=`${filter==='all'?'Mi biblioteca':({reading:'En lectura',pending:'Próximas historias',finished:'Historias terminadas'})[filter]} <span>${list.length}</span>`;
  $('#grid').innerHTML=list.length?list.map(s=>`<article class="comic-card"><button class="cover-button" data-action="details" data-id="${s.id}" aria-label="Ver ${escape(s.title)}">${cover(s)}<span class="status ${s.status}">${statuses[s.status]}</span></button><div class="card-info"><p class="eyebrow">${escape(s.publisher||'MI COLECCIÓN')}</p><h3><button class="title-button" data-action="details" data-id="${s.id}">${escape(s.title)}</button></h3><p class="reading-line">${s.lastRead?'Leído hasta el <b>#'+s.lastRead+'</b>':'Aún por descubrir'}${s.total?' <span>/ '+s.total+'</span>':''}</p>${progress(s)}<div class="card-actions"><a class="read-link" href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${s.status==='pending'?'Empezar a leer':'Continuar leyendo'} ↗</a><button class="increment" data-action="advance" data-id="${s.id}" ${s.lastRead >= (s.total??99999)?'disabled':''} aria-label="Marcar un número más leído de ${escape(s.title)}">+1 leído</button></div></div></article>`).join(''):`<div class="empty"><span>▧</span><h3>${series.length?'No hay series en esta vista':'Tu universo empieza con una historia'}</h3><p>${series.length?'Prueba otro filtro o busca un título diferente.':'Añade tu primera serie para empezar tu biblioteca.'}</p><button class="quiet" id="empty-add">Añadir una serie</button></div>`;
  $('#empty-add')?.addEventListener('click',()=>openEditor());
  const reading=selectSeries(series,'reading')[0];
  $('#resume').innerHTML=reading?`<div class="resume-card">${cover(reading,'mini')}<div><p class="eyebrow accent">DONDE LO DEJASTE</p><h2>${escape(reading.title)}</h2><p>Último leído: #${reading.lastRead} · El siguiente capítulo te espera.</p></div><a class="primary" href="${escape(reading.url)}" target="_blank" rel="noopener noreferrer">Continuar leyendo ↗</a></div>`:`<div class="welcome-strip"><span class="orb" aria-hidden="true">↗</span><div><strong>Una viñeta más. Otro universo.</strong><p>Añade tus series, guarda tu progreso y vuelve a la historia cuando quieras.</p></div><span class="edition">( ARCHIVO / 01 )</span></div>`;
  imageFallbacks();
}
function openEditor(s){editorBaseline=s?structuredClone(s):null;const form=$('#series-form');form.reset();for(const key of ['id','title','publisher','status','lastRead','total','url','cover','notes'])form.elements[key].value=s?.[key]??(key==='status'?'pending':key==='lastRead'?0:'');$('#editor-title').textContent=s?'Editar serie':'Añadir serie';$('#form-error').textContent='';$('#editor').showModal();}
function openDetails(s){$('#details').innerHTML=`<div class="dialog-heading"><p class="eyebrow">FICHA DE LA SERIE</p><button class="icon-button" data-close aria-label="Cerrar">×</button></div><div class="detail-layout">${cover(s)}<div><p class="eyebrow accent">${escape(s.publisher)}</p><h2>${escape(s.title)}</h2><span class="status inline ${s.status}">${statuses[s.status]}</span><p>Último número leído: <b>#${s.lastRead}</b>${s.total?' de '+s.total:''}</p>${progress(s)}<p class="notes">${escape(s.notes||'Sin notas todavía.')}</p><a class="primary" href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">Abrir lectura ↗</a></div></div><div class="dialog-actions"><button class="danger" data-action="delete" data-id="${s.id}">Eliminar serie</button><button class="quiet" data-action="edit" data-id="${s.id}">Editar serie</button></div>`;$('#details').showModal();imageFallbacks();}
function confirmChange(message){return new Promise(resolve=>{const dialog=$('#confirmation'); $('#confirmation-message').textContent=message;dialog.returnValue='cancel';dialog.addEventListener('close',()=>resolve(dialog.returnValue==='accept'),{once:true});dialog.showModal();});}
document.addEventListener('click',async event=>{const close=event.target.closest('[data-close]');if(close){close.closest('dialog').close();return;}const button=event.target.closest('[data-action]');if(!button)return;const s=series.find(s=>s.id===button.dataset.id);if(!s)return;switch(button.dataset.action){case 'details':openDetails(s);break;case 'edit':$('#details').close();openEditor(s);break;case 'advance':if(await save(series.map(v=>v.id===s.id?advance(v):v)))toast('Progreso guardado. El enlace se actualiza desde Editar serie.');break;case 'delete':if(await confirmChange(`¿Eliminar «${s.title}» de tu biblioteca?`)){if(await save(series.filter(v=>v.id!==s.id))){$('#details').close();toast('Serie eliminada.');}}}});
$('#series-form').addEventListener('submit',async event=>{
  event.preventDefault();if(editorSaving)return;editorSaving=true;
  const owner=activeUserId,form=event.currentTarget,submit=form.querySelector('[type="submit"]');submit.disabled=true;
  try{
    const s=validateSeries({...Object.fromEntries(new FormData(form)),updatedAt:new Date().toISOString()});
    if(!series.some(v=>v.id===s.id)&&series.length>=2000)throw new Error('Has alcanzado el máximo de 2000 series.');
    if(editorBaseline&&JSON.stringify(series.find(v=>v.id===s.id)??null)!==JSON.stringify(editorBaseline)){
      if(!await confirmChange('Esta serie ha cambiado mientras la editabas. ¿Guardar tus cambios sobre la versión actual?')||owner!==activeUserId)return;
    }
    if(await save([...series.filter(v=>v.id!==s.id),s])){$('#editor').close();toast('Serie guardada.');}
  }catch(error){$('#form-error').textContent=error.message;}
  finally{editorSaving=false;submit.disabled=false;}
});
$('#navigation').addEventListener('click',e=>{const button=e.target.closest('[data-filter]');if(!button)return;filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});render();});
$('#search').addEventListener('input',render);$('#sort').addEventListener('change',render);
$('#add-button').addEventListener('click',()=>openEditor());$('#help-button').addEventListener('click',()=>$('#help').showModal());$('#backup-button').addEventListener('click',()=>$('#backup').showModal());
function download(content,name){const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportLibrary(){download(loadFailed?localStorage.getItem(activeStorageKey)||'{}':JSON.stringify({version:1,exportedAt:new Date().toISOString(),series},null,2),`panelverse-${new Date().toISOString().slice(0,10)}.json`);}
$('#export-button').addEventListener('click',exportLibrary);
$('#import-file').addEventListener('change',async event=>{const owner=activeUserId;try{const file=event.target.files[0];if(!file)return;if(file.size>5_000_000)throw new Error('La copia no puede superar 5 MB.');const incoming=parseBackup(await file.text());if(!await confirmChange(`¿Importar ${incoming.length} series? Las coincidencias se actualizarán.${owner?' Los cambios se enviarán a tu cuenta en Supabase.':''}`)||owner!==activeUserId)return;const next=mergeSeries(series,incoming);exportLibrary();if(loadFailed){loadFailed=false;if(!await save(next)){loadFailed=true;return;}}else if(!await save(next))return;$('#import-result').textContent=`Importación completada: ${incoming.length} series procesadas.`;toast('Biblioteca importada.');}catch(error){$('#import-result').textContent='No se ha importado: '+error.message;}finally{event.target.value='';}});
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}}));
window.addEventListener('storage',event=>{if(!activeUserId&&event.key===activeStorageKey)location.reload();});
render();if(loadFailed)toast('No se ha podido leer la biblioteca. Tus datos originales se conservan; puedes exportarlos.');
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});

function syncStatus(info){
  const labels={working:'Sincronizando…',synced:'Biblioteca sincronizada',pending:'Cambios pendientes',offline:'Sin conexión',conflicts:'Hay cambios que revisar',error:'Sincronización pendiente'};
  $('#sync-state').textContent=labels[info.kind]||'Preparando biblioteca…';
  $('#sync-panel').dataset.state=info.kind;
  $('#sync-description').textContent=info.message||(info.conflicts?`${info.conflicts} serie(s) cambiaron en otro dispositivo. Elige qué versión conservar.`:info.pending?`${info.pending} cambio(s) guardados en este dispositivo, pendientes de envío.`:info.syncedAt?`Última sincronización: ${new Date(info.syncedAt).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}. Disponible en tus dispositivos con esta cuenta.`:'La biblioteca de tu cuenta se guarda en la nube y conserva una copia en este navegador.');
  $('#sync-now').disabled=info.kind==='working';
  window.dispatchEvent(new CustomEvent('panelverse:sync-state',{detail:info}));
}
function syncView(view){
  series=view.series;loadFailed=false;render();
  // A v1 mirror keeps JSON backups compatible; IndexedDB is the durable source for the account.
  try{localStorage.setItem(activeStorageKey,JSON.stringify({version:1,series}));}catch{}
  $('#sync-conflicts').innerHTML=view.conflicts.map(c=>`<article class="sync-conflict"><h3>${escape(c.local.data?.title||c.remote.data?.title||c.id)}</h3><div class="sync-versions"><div><strong>Este dispositivo</strong>${conflictVersion(c.local)}</div><div><strong>Nube</strong>${conflictVersion(c.remote)}</div></div><div class="sync-actions"><button class="quiet" data-resolve="local" data-id="${escape(c.id)}">Conservar mi cambio</button><button class="quiet" data-resolve="remote" data-id="${escape(c.id)}">Usar versión de la nube</button></div></article>`).join('');
}
function conflictVersion(record){if(record.deleted)return '<p>Serie eliminada</p>';const s=record.data;return `<p>${escape(s.title)}${s.publisher?' · '+escape(s.publisher):''}<br>#${s.lastRead}${s.total?' / '+s.total:''} · ${escape(statuses[s.status])}</p><details><summary>Ver todos los datos</summary><p>Lectura: ${escape(s.url)}</p><p>Portada: ${escape(s.cover||'Sin portada')}</p><p>Notas: ${escape(s.notes||'Sin notas')}</p></details>`;}
window.addEventListener('panelverse:account-changed',event=>{
  for(const id of ['editor','details','backup','confirmation'])document.getElementById(id).close();
  syncEngine?.stop();syncEngine=null;activeUserId=event.detail.userId;loadLibrary(activeUserId);render();
  $('#sync-panel').hidden=!activeUserId;$('#sync-conflicts').innerHTML='';
  if(!activeUserId)return;
  syncStatus({kind:'working',pending:0,conflicts:0});
  try{
    const raw=localStorage.getItem(activeStorageKey),backupKey=activeStorageKey+'.before-cloud.v1';
    if(raw!==null&&localStorage.getItem(backupKey)===null)localStorage.setItem(backupKey,raw);
    const engine=createLibrarySync({owner:activeUserId,client:getAccountClient(),legacy:loadFailed?[]:series,
      onChange:view=>{if(syncEngine===engine)syncView(view);},onStatus:info=>{if(syncEngine===engine)syncStatus(info);}});
    syncEngine=engine;
    engine.ready.catch(error=>{if(syncEngine===engine){loadFailed=true;syncStatus({kind:'error',message:error.message,pending:0,conflicts:0});}});
  }catch(error){loadFailed=true;syncStatus({kind:'error',message:error.message,pending:0,conflicts:0});}
});
$('#sync-now').addEventListener('click',()=>syncEngine?.sync());
$('#sync-conflicts').addEventListener('click',async event=>{const button=event.target.closest('[data-resolve]');if(!button)return;try{await syncEngine.resolve(button.dataset.id,button.dataset.resolve);}catch(error){toast(error.message);}});
$('#upload-local').addEventListener('click',async()=>{
  const owner=activeUserId;if(!owner||!syncEngine)return;
  try{
    const raw=localStorage.getItem(STORAGE_KEY),guest=raw===null?structuredClone(seed):parseBackup(raw);
    const missing=guest.filter(item=>!series.some(current=>current.id===item.id));
    if(!missing.length){toast('Las series de la biblioteca sin cuenta ya están en esta cuenta.');return;}
    if(!await confirmChange(`¿Copiar ${missing.length} series de tu biblioteca sin cuenta a esta cuenta en Supabase? Se conserva el original y se descarga una copia. Las coincidencias no se sustituyen.`)||owner!==activeUserId)return;
    download(JSON.stringify({version:1,exportedAt:new Date().toISOString(),series:guest},null,2),`panelverse-sin-cuenta-${new Date().toISOString().slice(0,10)}.json`);
    if(await save(mergeSeries(guest,series)))toast('Biblioteca copiada a tu cuenta. Los cambios se sincronizarán cuando haya conexión.');
  }catch(error){toast(error.message);}
});
initializeReader();
initializeAccount().catch(()=>toast('El acceso de cuentas no está disponible.'));
