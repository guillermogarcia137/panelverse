import { parseBackup, validateSeries } from "./model.js";
import { accountStorageKey } from "./account-model.js";

const copy = (value) => structuredClone(value);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const byId = (items) => new Map(items.map((item) => [item.id, item]));
// Separa registros confirmados, operaciones pendientes y conflictos; cada estado pertenece a una cuenta.
export function emptySyncState(owner) {
  accountStorageKey(owner);
  if (!owner) throw new Error("Falta la cuenta.");
  return {
    version: 1,
    owner,
    records: [],
    pending: [],
    conflicts: [],
    syncedAt: null,
  };
}
// Comprueba una versión del servidor. Un registro borrado se conserva como marca para comunicar la eliminación.
export function validateRecord(record) {
  if (
    !record ||
    !Number.isSafeInteger(record.revision) ||
    record.revision < 1 ||
    typeof record.deleted !== "boolean" ||
    !/^[-\w]{1,100}$/.test(record.id)
  )
    throw new Error("Registro de sincronización no válido.");
  const data = record.deleted ? null : validateSeries(record.data);
  if (data && data.id !== record.id)
    throw new Error("Identificador de sincronización no válido.");
  return {
    id: record.id,
    revision: record.revision,
    deleted: record.deleted,
    data,
    operationId: record.operationId ?? null,
  };
}
// Una operación pendiente lleva un id único y la revisión de partida para detectar ediciones simultáneas.
function validateMutation(item) {
  if (
    !item ||
    !Number.isSafeInteger(item.baseRevision) ||
    item.baseRevision < 0 ||
    typeof item.deleted !== "boolean" ||
    !/^[-\w]{1,100}$/.test(item.id) ||
    !/^[-\da-f]{36}$/i.test(item.operationId)
  )
    throw new Error("Cambio pendiente no válido.");
  const data = item.deleted ? null : validateSeries(item.data);
  if (data && data.id !== item.id)
    throw new Error("Identificador pendiente no válido.");
  return { ...item, data };
}
// Valida toda la copia sin conexión antes de usarla, incluida su pertenencia a la cuenta actual.
export function validateSyncState(input, owner) {
  if (
    input?.version !== 1 ||
    input.owner !== owner ||
    !Array.isArray(input.records) ||
    !Array.isArray(input.pending) ||
    !Array.isArray(input.conflicts)
  )
    throw new Error(
      "La copia de sincronización no es válida. Conserva una copia antes de continuar.",
    );
  accountStorageKey(owner);
  const state = {
    ...input,
    records: input.records.map(validateRecord),
    pending: input.pending.map(validateMutation),
    conflicts: input.conflicts.map((c) => ({
      id: c.id,
      local: validateMutation(c.local),
      remote: validateRecord(c.remote),
    })),
  };
  for (const items of [state.records, state.pending, state.conflicts])
    if (new Set(items.map((v) => v.id)).size !== items.length)
      throw new Error("Identificadores duplicados en la copia local.");
  if (
    state.conflicts.some(
      (c) =>
        c.id !== c.local.id ||
        c.id !== c.remote.id ||
        state.pending.some((p) => p.id === c.id),
    )
  )
    throw new Error("Conflicto local no válido.");
  visibleSeries(state);
  return state;
}
// Combina la base confirmada con las operaciones locales para mostrar cambios aunque todavía no haya Internet.
export function visibleSeries(state) {
  const map = new Map(
    state.records.filter((r) => !r.deleted).map((r) => [r.id, r.data]),
  );
  for (const item of [...state.pending, ...state.conflicts.map((c) => c.local)])
    if (item.deleted) map.delete(item.id);
    else map.set(item.id, item.data);
  return parseBackup(JSON.stringify({ version: 1, series: [...map.values()] }));
}
// Compara la biblioteca que se editó con la propuesta nueva y crea solo las operaciones necesarias.
// No pisa en silencio una edición que haya cambiado desde el baseline recibido.
export function editLibrary(
  input,
  baseline,
  next,
  uuid = () => crypto.randomUUID(),
) {
  const state = copy(input),
    before = byId(baseline),
    after = byId(parseBackup(JSON.stringify({ version: 1, series: next }))),
    actual = byId(visibleSeries(state));
  const ids = [...new Set([...before.keys(), ...after.keys()])].filter(
    (id) => !same(before.get(id), after.get(id)),
  );
  if (ids.some((id) => !same(before.get(id), actual.get(id)))) {
    const error = new Error(
      "La biblioteca ha cambiado en otra pestaña o dispositivo. Revisa la versión actual y vuelve a guardar.",
    );
    error.code = "LOCAL_CHANGED";
    throw error;
  }
  for (const id of ids) {
    const pending = state.pending.find((p) => p.id === id),
      record = state.records.find((r) => r.id === id),
      conflict = state.conflicts.find((c) => c.id === id);
    const mutation = {
      id,
      baseRevision: pending?.baseRevision ?? record?.revision ?? 0,
      operationId: uuid(),
      deleted: !after.has(id),
      data: after.get(id) ?? null,
    };
    state.pending = state.pending.filter((p) => p.id !== id);
    if (conflict) conflict.local = mutation;
    else state.pending.push(mutation);
  }
  visibleSeries(state);
  return state;
}
// Sustituye una revisión confirmada por id sin duplicar la serie.
function putRecord(state, record) {
  const previous = state.records.find((r) => r.id === record.id);
  if (!previous || previous.revision <= record.revision)
    state.records = [
      ...state.records.filter((r) => r.id !== record.id),
      record,
    ];
}
// Compara el contenido, incluida la marca de borrado, sin depender del orden de llegada de las respuestas.
function matches(item, record) {
  return item.deleted === record.deleted && same(item.data, record.data);
}
// Conserva ambas versiones de una edición simultánea para que la persona pueda decidir.
function makeConflict(state, pending, record) {
  state.pending = state.pending.filter((p) => p.id !== record.id);
  state.conflicts = [
    ...state.conflicts.filter((c) => c.id !== record.id),
    { id: record.id, local: pending, remote: record },
  ];
}
// Integra revisiones del servidor con las operaciones locales; los cambios incompatibles pasan a conflictos.
export function mergeRemote(input, rows) {
  if (!Array.isArray(rows)) throw new Error("Respuesta de la nube no válida.");
  const state = copy(input);
  for (const value of rows) {
    const record = validateRecord(value),
      previous = state.records.find((r) => r.id === record.id);
    if (previous && previous.revision > record.revision) continue;
    putRecord(state, record);
    const conflict = state.conflicts.find((c) => c.id === record.id);
    if (conflict) {
      conflict.remote = record;
      continue;
    }
    const pending = state.pending.find((p) => p.id === record.id);
    if (!pending || record.revision <= pending.baseRevision) continue;
    if (record.operationId === pending.operationId || matches(pending, record))
      state.pending = state.pending.filter((p) => p.id !== record.id);
    else makeConflict(state, pending, record);
  }
  visibleSeries(state);
  return state;
}
// Retira únicamente las operaciones enviadas que el servidor confirmó.
// Una edición más reciente que se guardó durante la petición debe seguir en la cola.
export function acknowledge(input, sent, results) {
  if (!Array.isArray(results) || results.length !== sent.length)
    throw new Error("Confirmación de la nube incompleta.");
  let state = copy(input);
  for (const mutation of sent) {
    const result = results.find((r) => r.id === mutation.id);
    if (!result || !["applied", "conflict"].includes(result.status))
      throw new Error("Confirmación de la nube no válida.");
    const record = validateRecord(result.record);
    if (record.id !== mutation.id)
      throw new Error("Confirmación de otra serie.");
    if (result.status === "conflict") {
      state = mergeRemote(state, [record]);
      continue;
    }
    putRecord(state, record);
    const pending = state.pending.find((p) => p.id === mutation.id);
    if (pending?.operationId === mutation.operationId)
      state.pending = state.pending.filter((p) => p.id !== mutation.id);
    else if (pending && pending.baseRevision === mutation.baseRevision)
      pending.baseRevision = record.revision;
    // A second tab can receive the same acknowledgement after a newer edit.
    const conflict = state.conflicts.find((c) => c.id === mutation.id);
    if (conflict?.local.operationId === mutation.operationId)
      state.conflicts = state.conflicts.filter((c) => c.id !== mutation.id);
  }
  return state;
}
// Convierte la elección local/remota en el nuevo estado; conservar lo local puede requerir otra operación de envío.
export function resolveConflict(
  input,
  id,
  choice,
  uuid = () => crypto.randomUUID(),
) {
  const state = copy(input),
    conflict = state.conflicts.find((c) => c.id === id);
  if (!conflict) throw new Error("Este conflicto ya se ha resuelto.");
  if (!["local", "remote"].includes(choice))
    throw new Error("Elige una versión.");
  state.conflicts = state.conflicts.filter((c) => c.id !== id);
  if (choice === "local")
    state.pending.push({
      ...conflict.local,
      baseRevision: conflict.remote.revision,
      operationId: uuid(),
    });
  return state;
}
