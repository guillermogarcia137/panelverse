import { STORAGE_KEY } from "./model.js";
// Forma una clave de almacenamiento por cuenta; sin cuenta utiliza la biblioteca del invitado.
export function accountStorageKey(userId) {
  if (userId == null) return STORAGE_KEY;
  if (
    !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(userId)
  )
    throw new Error("Identificador de cuenta no válido.");
  return `${STORAGE_KEY}.user.${userId}`;
}
// Comprueba la configuración pública de Supabase antes de crear el cliente.
// Una clave service_role tiene privilegios de servidor y nunca debe incluirse en el navegador.
export function validateAccountConfig(config) {
  if (!config?.url && !config?.publishableKey) return null;
  const url = new URL(config.url);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "La URL del proyecto debe usar HTTPS y no incluir rutas o credenciales.",
    );
  const key = config.publishableKey;
  if (typeof key !== "string") throw new Error("Falta la clave pública.");
  if (!/^sb_publishable_[\w-]{10,}$/.test(key)) {
    if (key.split(".").length !== 3)
      throw new Error("Se requiere una clave pública de navegador.");
    let claims;
    try {
      claims = JSON.parse(
        atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
    } catch {
      throw new Error("Se requiere una clave pública de navegador.");
    }
    if (claims.role !== "anon")
      throw new Error(
        "No se permiten claves privadas o service_role en la aplicación.",
      );
  }
  return {
    url: url.origin,
    publishableKey: key,
    providers: {
      google: config.providers?.google === true,
      apple: config.providers?.apple === true,
    },
  };
}
