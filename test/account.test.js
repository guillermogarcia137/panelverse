import test from 'node:test';
import assert from 'node:assert/strict';
import {accountStorageKey,validateAccountConfig} from '../src/account-model.js';
import {STORAGE_KEY} from '../src/model.js';
const config={url:'https://example.supabase.co',publishableKey:'sb_publishable_example_public_123',providers:{google:true,apple:false}};
test('la biblioteca sin cuenta conserva su clave y las cuentas tienen claves separadas',()=>{
  assert.equal(accountStorageKey(null),STORAGE_KEY);
  const first=accountStorageKey('00000000-0000-4000-8000-000000000001'),second=accountStorageKey('00000000-0000-4000-8000-000000000002');
  assert.notEqual(first,second);assert.notEqual(first,STORAGE_KEY);assert.throws(()=>accountStorageKey('../../otra'));
});
test('sin proyecto configurado el acceso se queda desactivado',()=>assert.equal(validateAccountConfig({url:'',publishableKey:''}),null));
test('la configuración de navegador acepta solo claves públicas y proveedores explícitos',()=>{
  assert.deepEqual(validateAccountConfig(config),config);
  assert.throws(()=>validateAccountConfig({...config,publishableKey:'sb_secret_never_in_the_browser'}));
  const token='x.'+btoa(JSON.stringify({role:'service_role'}))+'.x';
  assert.throws(()=>validateAccountConfig({...config,publishableKey:token}));
});
test('el proyecto de cuentas requiere HTTPS y una URL sin credenciales ni rutas',()=>{
  for(const url of ['http://example.supabase.co','https://user:pass@example.com','https://example.com/redirect','https://example.com/?key=x'])assert.throws(()=>validateAccountConfig({...config,url}));
});
