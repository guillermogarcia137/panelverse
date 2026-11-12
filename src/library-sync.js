import {
  emptySyncState,
  editLibrary,
  mergeRemote,
  acknowledge,
  resolveConflict,
  visibleSeries,
} from "./sync-model.js";
import { createSyncStore } from "./sync-store.js";

// Coordina la copia local y Supabase para una sola cuenta.
// El modelo calcula los cambios; el almacén los escribe; este módulo decide cuándo enviarlos.
export function createLibrarySync({
  owner,
  client,
  legacy = [],
  store = createSyncStore(),
  onChange = () => {},
  onStatus = () => {},
  intervalMs = 15000,
  autoStart = true,
  events = globalThis.window,
  online = () => globalThis.navigator?.onLine !== false,
  channelFactory = (name) =>
    typeof BroadcastChannel === "function" ? new BroadcastChannel(name) : null,
}) {
  let state = null,
    stopped = false,
    running = false,
    again = false,
    timer = null,
    retryDelay = 2000,
    lastView = "",
    lastError = "",
    channel,
    failed = false;
  const ready = store.update(
    owner,
    (current) => current || editLibrary(emptySyncState(owner), [], legacy),
  );
  // Notifica a la interfaz solo si cambió la vista. structuredClone evita que la interfaz modifique el estado interno.
  function publish() {
    if (stopped || !state) return;
    const view = {
      series: visibleSeries(state),
      conflicts: state.conflicts,
      pending: state.pending.length,
      syncedAt: state.syncedAt,
    };
    const text = JSON.stringify(view);
    if (text !== lastView) {
      lastView = text;
      onChange(structuredClone(view));
    }
  }
  // Publica un resumen de conexión, operaciones pendientes y conflictos; no altera los datos guardados.
  function status(kind, message = "") {
    if (!stopped)
      onStatus({
        kind,
        message,
        pending: state?.pending.length ?? 0,
        conflicts: state?.conflicts.length ?? 0,
        syncedAt: state?.syncedAt ?? null,
      });
  }
  // Vuelve a leer IndexedDB porque otra pestaña puede haber escrito desde nuestra última lectura.
  async function refresh() {
    state = await store.read(owner);
    publish();
    return state;
  }
  // BroadcastChannel avisa a otras pestañas de esta web de que deben releer la copia local.
  function broadcast() {
    channel?.postMessage({ owner });
  }
  // Toda modificación pasa por una transacción local antes de actualizar la pantalla y avisar a las otras pestañas.
  async function persist(transform) {
    state = await store.update(owner, transform);
    publish();
    broadcast();
    return state;
  }
  // Agrupa peticiones cercanas en un temporizador. Si ya hay un envío, marca otra pasada sin solaparlos.
  function requestSync(delay = 150) {
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => sync(), delay);
  }
  // Conserva las operaciones pendientes ante un fallo de red para poder reintentarlas más tarde.
  function failure(error) {
    lastError =
      error?.code === "PGRST202" || error?.code === "42P01"
        ? "El servicio de sincronización aún no está preparado."
        : error?.status === 401
          ? "Vuelve a iniciar sesión para sincronizar."
          : "No se pudo conectar con la nube. Tus cambios siguen guardados en este dispositivo.";
    status(online() ? "error" : "offline", lastError);
    failed = true;
  }
  // RPC llama a una función de la base de datos. Enviamos la cuenta esperada para que el servidor compruebe la identidad.
  async function rpc(name, args = {}) {
    const response = await client.rpc(name, { ...args, expected_owner: owner });
    if (response.error) throw response.error;
    return response.data;
  }
  // Envía primero las operaciones pendientes y después descarga las versiones del servidor.
  // Solo acknowledge retira operaciones confirmadas; un corte de red no debe hacer perder cambios.
  async function sync() {
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    again = false;
    failed = false;
    clearTimeout(timer);
    try {
      await ready;
      await refresh();
      if (!online()) {
        status(
          "offline",
          "Sin conexión. Los cambios se enviarán al recuperar Internet.",
        );
        return;
      }
      status("working");
      // Upload first: a saved operation may already have succeeded before a lost response.
      let batches = 0;
      while (!stopped) {
        await refresh();
        const sent = state.pending.slice(0, 100);
        if (!sent.length || batches++ >= 25) break;
        const results = await rpc("panelverse_library_apply", {
          mutations: sent,
        });
        await persist((current) => acknowledge(current, sent, results));
      }
      if (stopped) return;
      const records = await rpc("panelverse_library_pull");
      await persist((current) => ({
        ...mergeRemote(current, records),
        syncedAt: new Date().toISOString(),
      }));
      lastError = "";
      retryDelay = 2000;
      status(
        state.conflicts.length
          ? "conflicts"
          : state.pending.length
            ? "pending"
            : "synced",
      );
      if (state.pending.length) again = true;
    } catch (error) {
      failure(error);
    } finally {
      running = false;
      if (failed && !stopped) {
        requestSync(retryDelay);
        retryDelay = Math.min(retryDelay * 2, 60000);
      } else if (again && !stopped) requestSync(250);
    }
  }
  // Guarda una edición local antes de programar su envío. El baseline permite detectar cambios concurrentes.
  async function commit(baseline, next) {
    await ready;
    if (stopped)
      throw new Error(
        "La cuenta ha cambiado. Vuelve a guardar en tu biblioteca actual.",
      );
    try {
      await persist((current) => editLibrary(current, baseline, next));
      status(state.conflicts.length ? "conflicts" : "pending");
      requestSync();
    } catch (error) {
      await refresh().catch(() => {});
      throw error;
    }
  }
  // Guarda la elección explícita de un conflicto y programa su sincronización con la nube.
  async function resolve(id, choice) {
    await ready;
    await persist((current) => resolveConflict(current, id, choice));
    status("pending");
    requestSync();
  }
  const wake = () => {
    if (!globalThis.document?.hidden) requestSync(0);
  };
  events?.addEventListener("online", wake);
  events?.addEventListener("focus", wake);
  channel = channelFactory("panelverse-library");
  if (channel)
    channel.onmessage = (event) => {
      if (event.data?.owner === owner)
        refresh()
          .then(() => {
            if (!running)
              status(
                state.conflicts.length
                  ? "conflicts"
                  : state.pending.length
                    ? "pending"
                    : state.syncedAt
                      ? "synced"
                      : "pending",
              );
          })
          .catch(failure);
    };
  const poll = intervalMs ? setInterval(wake, intervalMs) : null;
  ready
    .then((value) => {
      state = value;
      publish();
      if (autoStart) requestSync(0);
    })
    .catch((error) => status("error", error.message));
  return {
    ready,
    sync,
    commit,
    resolve,
    refresh,
    stop() {
      stopped = true;
      clearTimeout(timer);
      clearInterval(poll);
      channel?.close();
      events?.removeEventListener("online", wake);
      events?.removeEventListener("focus", wake);
    },
    getState: () => (state ? structuredClone(state) : null),
  };
}
