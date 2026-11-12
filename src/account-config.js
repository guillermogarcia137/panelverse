// Solo configuración PUBLICA del proyecto. Nunca claves secretas, service_role ni secretos OAuth.
// Configuración pública de conexión, visible en el navegador. Los permisos reales los aplica Supabase con sus políticas RLS.
export const accountConfig = {
  url: "https://zfsedjblvipnuztzdrbb.supabase.co",
  publishableKey: "sb_publishable_0GHERs017OAjckYV38sVmg_jWyykpAZ",
  providers: { google: true, apple: false },
};
