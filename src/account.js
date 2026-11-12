import { accountConfig } from "./account-config.js";
import { validateAccountConfig, accountStorageKey } from "./account-model.js";
let client = null,
  config = null,
  user = null,
  initializing = false,
  syncInfo = null;
const $ = (s) => document.querySelector(s);
const LAST_ACCOUNT = "panelverse.last-account.v1";
// Entrega el cliente ya preparado al motor de sincronización; no crea una segunda sesión.
export function getAccountClient() {
  return client;
}
// Recupera solo la identidad recordada para poder abrir su copia local sin conexión. No sustituye la validación de sesión.
function previousAccount() {
  try {
    const saved = JSON.parse(localStorage.getItem(LAST_ACCOUNT));
    accountStorageKey(saved?.id);
    return saved?.id ? saved : null;
  } catch {
    return null;
  }
}
// Distingue un fallo de conexión de un cierre de sesión: perder Internet no debe borrar la cuenta local.
function retryable(error) {
  return (
    navigator.onLine === false ||
    error?.name === "AuthRetryableFetchError" ||
    error instanceof TypeError
  );
}
// Pinta el estado de la cuenta y los proveedores habilitados sin guardar datos de la biblioteca.
function renderAccount() {
  const available = Boolean(client && config),
    hasProviders =
      available && (config.providers.google || config.providers.apple);
  $("#account-button-label").textContent = user ? "Mi cuenta" : "Cuenta";
  $("#account-heading").textContent = user
    ? "Tu cuenta"
    : "Tu espacio personal";
  $("#account-name").textContent =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email ||
    "";
  $("#account-profile").hidden = !user;
  $("#account-email").textContent = user?.email || "";
  $("#account-providers").hidden = Boolean(user);
  $("#signout-button").hidden = !user;
  $("#account-state").textContent = user
    ? "Sesión iniciada"
    : initializing
      ? "Comprobando cuenta…"
      : hasProviders
        ? "Acceso disponible"
        : available
          ? "Servicio conectado"
          : "Modo local";
  $("#account-description").textContent = user
    ? "Tu biblioteca se sincroniza con esta cuenta. Se conserva una copia en este navegador para leer y editar sin conexión."
    : hasProviders
      ? "Inicia sesión para tener la misma biblioteca en tus dispositivos. También puedes seguir usando la biblioteca sin cuenta."
      : "Organiza tus lecturas sin cuenta. El acceso con Google y Apple estará disponible al activar el servicio de cuentas.";
  $("#account-availability").textContent = user
    ? syncInfo?.message ||
      {
        working: "Sincronizando tu biblioteca…",
        synced: "Biblioteca sincronizada con la nube.",
        pending:
          "Hay cambios guardados en este dispositivo, pendientes de envío.",
        conflicts: "Revisa los cambios en la sección de sincronización.",
        offline:
          "Sin conexión. Los cambios se enviarán cuando vuelva Internet.",
        error: "La sincronización está pendiente. Tu copia local se conserva.",
      }[syncInfo?.kind] ||
      "Preparando tu biblioteca…"
    : hasProviders
      ? "Elige uno de los proveedores disponibles."
      : available
        ? "El servicio de cuentas está conectado. Google y Apple están pendientes de activación."
        : "El inicio de sesión todavía no está activado. Puedes seguir usando todas las funciones locales.";
  for (const provider of ["google", "apple"]) {
    const enabled = available && config.providers[provider] && !initializing;
    $(`#signin-${provider}`).disabled = !enabled;
    $(`#signin-${provider}-state`).textContent = enabled
      ? ""
      : "Pendiente de activación";
  }
  $("#connection").textContent = user
    ? {
        synced: "NUBE · SINCRONIZADA",
        working: "SINCRONIZANDO…",
        offline: "SIN CONEXIÓN",
        conflicts: "REVISAR CAMBIOS",
        error: "NUBE · PENDIENTE",
      }[syncInfo?.kind] || "NUBE · PENDIENTE"
    : "LOCAL · SIN CUENTA";
  $("#library-location").textContent = user
    ? "Biblioteca de tu cuenta"
    : "Biblioteca en este dispositivo";
}
// Centraliza el cambio de identidad y avisa al resto de módulos para que carguen únicamente los datos de esa cuenta.
function setUser(next) {
  try {
    accountStorageKey(next?.id ?? null);
  } catch {
    next = null;
  }
  const changed = user?.id !== next?.id;
  user = next || null;
  if (changed) syncInfo = null;
  try {
    if (user)
      localStorage.setItem(
        LAST_ACCOUNT,
        JSON.stringify({
          id: user.id,
          email: user.email,
          user_metadata: {
            full_name:
              user.user_metadata?.full_name || user.user_metadata?.name || "",
          },
        }),
      );
    else localStorage.removeItem(LAST_ACCOUNT);
  } catch {}
  renderAccount();
  if (changed)
    window.dispatchEvent(
      new CustomEvent("panelverse:account-changed", {
        detail: { userId: user?.id ?? null },
      }),
    );
}
// Comunica al lector el permiso temporal de Google Drive recibido en la sesión, si existe. No lo guarda en la biblioteca.
function readerSession(session) {
  window.dispatchEvent(
    new CustomEvent("panelverse:auth-session", {
      detail: { token: session?.provider_token || null },
    }),
  );
}
// Retira de la dirección los parámetros temporales de autenticación después de procesar el retorno del proveedor.
function cleanCallback() {
  const url = new URL(location.href);
  let changed = false;
  for (const key of ["code", "error", "error_code", "error_description"])
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  if (changed)
    history.replaceState(null, "", url.pathname + url.search + url.hash);
}
// Prepara Supabase, recupera la sesión y conecta los botones de acceso y salida.
// La importación dinámica descarga el SDK cuando se necesita, en lugar de incluirlo en todos los módulos.
export async function initializeAccount() {
  window.addEventListener("panelverse:sync-state", (event) => {
    syncInfo = event.detail;
    renderAccount();
  });
  $("#account-button").addEventListener("click", () =>
    $("#account-dialog").showModal(),
  );
  for (const provider of ["google", "apple"])
    $(`#signin-${provider}`).addEventListener("click", async () => {
      if (!client || !config?.providers[provider]) return;
      $("#account-message").textContent = "Abriendo el acceso seguro…";
      try {
        const { error } = await client.auth.signInWithOAuth({
          provider,
          options: { redirectTo: new URL("../", import.meta.url).href },
        });
        if (error) throw error;
      } catch {
        $("#account-message").textContent =
          "No se ha podido abrir el acceso. Inténtalo de nuevo más tarde.";
      }
    });
  $("#signout-button").addEventListener("click", async () => {
    if (!client) return;
    $("#signout-button").disabled = true;
    try {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw error;
      setUser(null);
      $("#account-message").textContent =
        "Sesión cerrada. La copia y los cambios pendientes de tu cuenta se conservan para cuando vuelvas a entrar.";
    } catch {
      $("#account-message").textContent =
        "No se ha podido cerrar la sesión. Comprueba la conexión e inténtalo de nuevo.";
    } finally {
      $("#signout-button").disabled = false;
    }
  });
  try {
    config = validateAccountConfig(accountConfig);
  } catch {
    renderAccount();
    $("#account-message").textContent =
      "El servicio de cuentas no está disponible. Tu biblioteca local sigue funcionando.";
    return;
  }
  renderAccount();
  if (!config) return;
  initializing = true;
  renderAccount();
  try {
    const { createClient } = await import("./vendor/account-client.js");
    client = createClient(config.url, config.publishableKey, {
      auth: {
        flowType: "pkce",
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
        storageKey: "panelverse.auth.v1",
      },
    });
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (data.session) {
      const result = await client.auth.getUser();
      if (result.error) {
        if (!retryable(result.error)) throw result.error;
        const previous = previousAccount();
        setUser(
          previous?.id === data.session.user.id ? previous : data.session.user,
        );
      } else setUser(result.data.user);
    } else if (navigator.onLine === false && previousAccount())
      setUser(previousAccount());
    readerSession(data.session);
    cleanCallback();
    client.auth.onAuthStateChange((event, session) => {
      if (
        !session &&
        navigator.onLine === false &&
        event !== "SIGNED_OUT" &&
        user
      )
        return;
      setUser(session?.user ?? null);
      if (session?.provider_token || !session) readerSession(session);
    });
  } catch (error) {
    if (retryable(error) && previousAccount()) {
      setUser(previousAccount());
      client?.auth.onAuthStateChange((event, session) => {
        if (session) setUser(session.user);
        else if (event === "SIGNED_OUT") setUser(null);
      });
      $("#account-message").textContent =
        "Usando la última cuenta de este navegador sin conexión. La nube volverá a verificar la sesión antes de aceptar cambios.";
    } else {
      client = null;
      setUser(null);
      $("#account-message").textContent =
        "No se ha podido comprobar tu cuenta. Puedes seguir con la biblioteca sin cuenta.";
    }
    cleanCallback();
  } finally {
    initializing = false;
    renderAccount();
  }
}
