import {accountConfig} from './account-config.js';
import {validateAccountConfig,accountStorageKey} from './account-model.js';
let client=null,config=null,user=null,initializing=false;
const $=s=>document.querySelector(s);
function renderAccount(){
  const available=Boolean(client&&config), hasProviders=available&&(config.providers.google||config.providers.apple);
  $('#account-button-label').textContent=user?'Mi cuenta':'Cuenta';
  $('#account-heading').textContent=user?'Tu cuenta':'Tu espacio personal';
  $('#account-name').textContent=user?.user_metadata?.full_name||user?.user_metadata?.name||user?.email||'';
  $('#account-profile').hidden=!user;
  $('#account-email').textContent=user?.email||'';
  $('#account-providers').hidden=Boolean(user);
  $('#signout-button').hidden=!user;
  $('#account-state').textContent=user?'Sesión iniciada':initializing?'Comprobando cuenta…':hasProviders?'Acceso disponible':available?'Servicio conectado':'Modo local';
  $('#account-description').textContent=user?'Tu biblioteca de esta cuenta está separada de la biblioteca sin cuenta en este navegador.':hasProviders?'Inicia sesión para tener tu espacio personal en este navegador. También puedes seguir usando la biblioteca sin cuenta.':'Organiza tus lecturas sin cuenta. El acceso con Google y Apple estará disponible al activar el servicio de cuentas.';
  $('#account-availability').textContent=user?'La sincronización entre dispositivos todavía no está activada.':hasProviders?'Elige uno de los proveedores disponibles.':available?'El servicio de cuentas está conectado. Google y Apple están pendientes de activación.':'El inicio de sesión todavía no está activado. Puedes seguir usando todas las funciones locales.';
  for(const provider of ['google','apple']){
    const enabled=available&&config.providers[provider]&&!initializing;
    $(`#signin-${provider}`).disabled=!enabled;
    $(`#signin-${provider}-state`).textContent=enabled?'':'Pendiente de activación';
  }
  $('#connection').textContent=user?'CUENTA · DATOS LOCALES':'LOCAL · SIN CUENTA';
}
function setUser(next){
  try{accountStorageKey(next?.id??null);}catch{next=null;}
  const changed=user?.id!==next?.id;
  user=next||null;renderAccount();
  if(changed)window.dispatchEvent(new CustomEvent('panelverse:account-changed',{detail:{userId:user?.id??null}}));
}
function cleanCallback(){const url=new URL(location.href);let changed=false;for(const key of ['code','error','error_code','error_description'])if(url.searchParams.has(key)){url.searchParams.delete(key);changed=true;}if(changed)history.replaceState(null,'',url.pathname+url.search+url.hash);}
export async function initializeAccount(){
  $('#account-button').addEventListener('click',()=>$('#account-dialog').showModal());
  for(const provider of ['google','apple'])$(`#signin-${provider}`).addEventListener('click',async()=>{
    if(!client||!config?.providers[provider])return;
    $('#account-message').textContent='Abriendo el acceso seguro…';
    try{
      const {error}=await client.auth.signInWithOAuth({provider,options:{redirectTo:new URL('../',import.meta.url).href}});
      if(error)throw error;
    }catch{$('#account-message').textContent='No se ha podido abrir el acceso. Inténtalo de nuevo más tarde.';}
  });
  $('#signout-button').addEventListener('click',async()=>{
    if(!client)return;
    $('#signout-button').disabled=true;
    try{const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;setUser(null);$('#account-message').textContent='Sesión cerrada en este navegador. Tus bibliotecas locales se conservan.';}
    catch{$('#account-message').textContent='No se ha podido cerrar la sesión. Comprueba la conexión e inténtalo de nuevo.';}
    finally{$('#signout-button').disabled=false;}
  });
  try{config=validateAccountConfig(accountConfig);}catch{renderAccount();$('#account-message').textContent='El servicio de cuentas no está disponible. Tu biblioteca local sigue funcionando.';return;}
  renderAccount();
  if(!config)return;
  initializing=true;renderAccount();
  try{
    const {createClient}=await import('./vendor/account-client.js');
    client=createClient(config.url,config.publishableKey,{auth:{flowType:'pkce',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true,storageKey:'panelverse.auth.v1'}});
    const {data,error}=await client.auth.getSession();if(error)throw error;
    if(data.session){const result=await client.auth.getUser();if(result.error)throw result.error;setUser(result.data.user);}
    cleanCallback();
    client.auth.onAuthStateChange((_event,session)=>setUser(session?.user??null));
  }catch{client=null;$('#account-message').textContent='No se ha podido comprobar tu cuenta. Puedes seguir con la biblioteca local.';cleanCallback();}
  finally{initializing=false;renderAccount();}
}
