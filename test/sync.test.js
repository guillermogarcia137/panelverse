import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,validateSeries} from '../src/model.js';
import {emptySyncState,editLibrary,mergeRemote,acknowledge,resolveConflict,visibleSeries,validateSyncState} from '../src/sync-model.js';
import {createLibrarySync} from '../src/library-sync.js';
const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const item=(id='comic',lastRead=0)=>({...seed[0],id,lastRead,status:lastRead?'reading':'pending'});
const record=(data,revision=1,op=crypto.randomUUID())=>({id:data.id,data,revision,deleted:false,operationId:op});
const edit=(state,next)=>editLibrary(state,visibleSeries(state),next);
const confirmed=(data)=>mergeRemote(emptySyncState(owner),[record(data)]);
test('las copias normalizan fechas y rechazan enlaces que la nube no admite',()=>{
  assert.equal(validateSeries({...item(),updatedAt:'2026-11-10'}).updatedAt,'2026-11-10T00:00:00.000Z');
  assert.throws(()=>validateSeries({...item(),url:'https://example.com/'+ 'x'.repeat(2048)}),/2048/);
});

test('dos dispositivos conservan altas de series distintas',()=>{
  let state=edit(emptySyncState(owner),[item('local')]);
  state=mergeRemote(state,[record(item('remote'))]);
  assert.deepEqual(visibleSeries(state).map(s=>s.id).sort(),['local','remote']);
  assert.equal(state.pending.length,1);assert.equal(state.conflicts.length,0);
});
test('una edición concurrente exige elegir versión y vuelve a comprobar la revisión',()=>{
  let state=edit(confirmed(item()),[item('comic',3)]);
  state=mergeRemote(state,[record(item('comic',7),2)]);
  assert.equal(state.pending.length,0);assert.equal(state.conflicts.length,1);
  assert.equal(visibleSeries(state)[0].lastRead,3);
  state=resolveConflict(state,'comic','local');
  assert.equal(state.pending[0].baseRevision,2);
  state=mergeRemote(state,[record(item('comic',8),3)]);
  assert.equal(state.conflicts.length,1);
  state=resolveConflict(state,'comic','remote');assert.equal(visibleSeries(state)[0].lastRead,8);
});
test('un dispositivo sin conexión no resucita una serie eliminada',()=>{
  let state=edit(confirmed(item()),[item('comic',4)]);
  state=mergeRemote(state,[{id:'comic',revision:2,deleted:true,data:null,operationId:crypto.randomUUID()}]);
  assert.equal(state.conflicts.length,1);
  state=resolveConflict(state,'comic','remote');assert.deepEqual(visibleSeries(state),[]);
});
test('un acuse antiguo conserva la edición realizada mientras viajaba la petición',()=>{
  let state=edit(confirmed(item()),[item('comic',1)]),sent=structuredClone(state.pending);
  state=edit(state,[item('comic',2)]);
  const ack={id:'comic',status:'applied',record:record(sent[0].data,2,sent[0].operationId)};
  state=acknowledge(state,sent,[ack]);
  assert.equal(state.pending[0].data.lastRead,2);assert.equal(state.pending[0].baseRevision,2);
  const newer=structuredClone(state.pending);
  state=acknowledge(state,newer,[{id:'comic',status:'applied',record:record(newer[0].data,3,newer[0].operationId)}]);
  state=acknowledge(state,sent,[ack]);
  assert.equal(state.records[0].revision,3);assert.equal(visibleSeries(state)[0].lastRead,2);assert.equal(state.pending.length,0);
});
test('una respuesta perdida se reconoce sin duplicar cambios',()=>{
  let state=edit(emptySyncState(owner),[item()]),pending=state.pending[0];
  state=mergeRemote(state,[record(pending.data,1,pending.operationId)]);
  assert.equal(state.pending.length,0);assert.equal(state.conflicts.length,0);
});
test('guardar desde una vista anterior no borra series nuevas de otra pestaña',()=>{
  const baseline=[item('a')];let state=mergeRemote(confirmed(item('a')),[record(item('b'))]);
  state=editLibrary(state,baseline,[item('a',2)]);
  assert.equal(visibleSeries(state).length,2);assert.equal(state.pending.length,1);
  assert.throws(()=>editLibrary(state,baseline,[item('a',3)]),{code:'LOCAL_CHANGED'});
});
test('las colas están ligadas a su cuenta y rechazan respuestas no válidas',()=>{
  const state=confirmed(item());assert.throws(()=>validateSyncState(state,other));
  assert.throws(()=>mergeRemote(state,[{...record(item()),revision:-1}]));
  const pending=edit(state,[item('comic',2)]);assert.throws(()=>acknowledge(pending,pending.pending,[]));
  const safe=edit(emptySyncState(owner),[item('__proto__')]);assert.equal(visibleSeries(safe)[0].id,'__proto__');
});

function memoryStore(){
  const values=new Map();let chain=Promise.resolve();
  return {read:async id=>structuredClone(values.get(id)??null),update(id,transform){const task=chain.then(()=>{const value=transform(structuredClone(values.get(id)??null));values.set(id,structuredClone(value));return structuredClone(value);});chain=task.catch(()=>{});return task;}};
}
function cloud(){
  const owners=new Map(),calls=[];let failAfterWrite=false,hold=null;
  return {calls,owners,failNext(){failAfterWrite=true;},holdNext(promise){hold=promise;},client(id){return {async rpc(name,args){
    if(args.expected_owner!==id)return {data:null,error:{code:'28000',status:401}};
    const rows=owners.get(id)||new Map();owners.set(id,rows);
    if(name==='panelverse_library_pull')return {data:structuredClone([...rows.values()]),error:null};
    const results=[];
    for(const mutation of args.mutations){
      calls.push(structuredClone(mutation));let current=rows.get(mutation.id);
      if(current?.operationId===mutation.operationId){results.push({id:mutation.id,status:'applied',record:current});continue;}
      if((current?.revision??0)!==mutation.baseRevision){results.push({id:mutation.id,status:'conflict',record:current});continue;}
      current={id:mutation.id,data:mutation.data,deleted:mutation.deleted,revision:(current?.revision??0)+1,operationId:mutation.operationId};rows.set(mutation.id,current);results.push({id:mutation.id,status:'applied',record:current});
    }
    if(hold){const wait=hold;hold=null;await wait;}
    if(failAfterWrite){failAfterWrite=false;return {data:null,error:{code:'NETWORK'}};}
    return {data:structuredClone(results),error:null};
  }}}};
}
function engine(options){return createLibrarySync({owner,legacy:[],events:null,channelFactory:()=>null,intervalMs:0,autoStart:false,...options});}
test('los cambios sin conexión sobreviven al reinicio y se envían después',async()=>{
  const store=memoryStore(),server=cloud();let connected=false;
  let sync=engine({store,client:server.client(owner),online:()=>connected});await sync.ready;
  await sync.commit([],[item()]);await sync.sync();assert.equal(server.calls.length,0);sync.stop();
  connected=true;sync=engine({store,client:server.client(owner),online:()=>connected});await sync.ready;await sync.sync();sync.stop();
  const saved=await store.read(owner);assert.equal(saved.pending.length,0);assert.equal(saved.records.length,1);assert.ok(saved.syncedAt);
});
test('reintentar una subida cuya respuesta se perdió no incrementa dos veces la revisión',async()=>{
  const store=memoryStore(),server=cloud();server.failNext();let sync=engine({store,client:server.client(owner)});await sync.ready;
  await sync.commit([],[item()]);await sync.sync();assert.equal((await store.read(owner)).pending.length,1);sync.stop();
  sync=engine({store,client:server.client(owner)});await sync.ready;await sync.sync();sync.stop();
  assert.equal(server.calls.length,2);assert.equal(server.calls[0].operationId,server.calls[1].operationId);
  assert.equal(server.owners.get(owner).get('comic').revision,1);assert.equal((await store.read(owner)).pending.length,0);
});
test('editar durante una subida envía la versión nueva con la revisión confirmada',async()=>{
  const store=memoryStore(),server=cloud();let release;const waiting=new Promise(resolve=>{release=resolve;});server.holdNext(waiting);
  const sync=engine({store,client:server.client(owner)});await sync.ready;await sync.commit([],[item()]);
  const running=sync.sync();
  while(!server.calls.length)await new Promise(resolve=>setTimeout(resolve,1));
  await sync.commit([item()],[item('comic',2)]);release();await running;sync.stop();
  assert.equal(server.calls.length,2);assert.equal(server.calls[1].baseRevision,1);assert.equal(server.owners.get(owner).get('comic').data.lastRead,2);
});
test('una respuesta de la cuenta anterior no se muestra tras cerrar su motor',async()=>{
  const store=memoryStore(),server=cloud();let release;server.holdNext(new Promise(resolve=>{release=resolve;}));
  let renders=0;const first=engine({store,client:server.client(owner),onChange:()=>renders++});await first.ready;await first.commit([],[item()]);const running=first.sync();
  while(!server.calls.length)await new Promise(resolve=>setTimeout(resolve,1));
  first.stop();const before=renders;const second=engine({owner:other,store,client:server.client(other)});await second.ready;release();await running;await second.sync();second.stop();
  assert.equal(renders,before);assert.deepEqual(visibleSeries(await store.read(other)),[]);assert.equal((await store.read(owner)).pending.length,0);
});
