/**
 * The answers a visitor has given, and everything that reads them.
 *
 * One object per funnel session. Compiled modules never touch it directly —
 * they call `get` / `set` / `select` / `has`, and the declared type decides what
 * those mean (see `variables.ts`). That indirection is what lets a question be
 * switched between single- and multi-select by editing the manifest.
 *
 * Deliberately framework-free: no React, no Effector, no DOM beyond the cookie.
 * A React binding sits on top of `subscribe`; keeping it out of here means the
 * semantics are testable without rendering anything.
 *
 * **Write-through persistence.** Every change is written to the cookie
 * immediately rather than debounced, so the stored answers are never behind what
 * the visitor sees. A serialize plus a `document.cookie` assignment per tap is
 * negligible at funnel scale, and it removes the "lost the last answer" failure
 * that a debounce introduces when someone navigates during the window.
 */
import * as persistence from "./persistence";
import type { PersistenceOptions } from "./persistence";
import type { VariableTable, VariableValue } from "./types";
import {
  atMax as atMaxOf,
  count as countOf,
  has as hasOf,
  initialState,
  isEmpty as isEmptyOf,
  isSet as isSetOf,
  meetsMin as meetsMinOf,
  select as selectOf,
} from "./variables";

export type RequestStatus = "idle" | "pending" | "success" | "error";

/** Reserved prefix for runtime-owned reads. Never a declared variable name. */
const REQ = "$req.";

export type FunnelStoreOptions = {
  table: VariableTable;
  /** Absent disables persistence — used by preview, where nothing should stick. */
  persist?: PersistenceOptions;
  /**
   * A compiled module referenced a name the manifest does not declare. The
   * compiler validates this, so it means a bug — reported rather than thrown,
   * because crashing a live funnel over a typo is worse than a no-op.
   */
  onUnknown?: (name: string) => void;
};

export type FunnelStore = ReturnType<typeof createFunnelStore>;

/** Values are compared before notifying, so an unchanged write is a no-op. */
function same(a: VariableValue | undefined, b: VariableValue | undefined): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((entry, index) => entry === b[index]);
  }
  return a === b;
}

export function createFunnelStore(options: FunnelStoreOptions) {
  const { table, persist, onUnknown } = options;

  // Restored answers layered over declared defaults, so a variable added since
  // the visitor last came back gets its default rather than being absent.
  const restored = persist ? persistence.read(table, persist) : null;
  let values: Record<string, VariableValue> = { ...initialState(table), ...(restored ?? {}) };

  // Request status lives apart from answers on purpose: it must never be
  // persisted. A `pending` restored from a cookie would show a spinner for a
  // request that is not running.
  const requests = new Map<string, { status: RequestStatus; error?: string }>();

  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  const declOf = (name: string) => {
    const decl = table[name];
    if (!decl) onUnknown?.(name);
    return decl;
  };

  const flush = () => {
    if (persist) persistence.write(table, values, persist);
  };

  function get(name: string): VariableValue {
    if (name.startsWith(REQ)) return readRequest(name);
    const decl = declOf(name);
    if (!decl) return null;
    return values[name] ?? null;
  }

  /** `$req.<id>.status` and `$req.<id>.error`, so conditions read them as names. */
  function readRequest(name: string): VariableValue {
    const rest = name.slice(REQ.length);
    const dot = rest.lastIndexOf(".");
    if (dot < 0) return null;
    const entry = requests.get(rest.slice(0, dot));
    const field = rest.slice(dot + 1);
    if (field === "status") return entry?.status ?? "idle";
    if (field === "error") return entry?.error ?? null;
    return null;
  }

  function set(name: string, value: VariableValue): void {
    const decl = declOf(name);
    if (!decl) return;
    if (same(values[name], value)) return;
    values = { ...values, [name]: value };
    flush();
    notify();
  }

  /** Assign or toggle, per the declared type. The single/multi difference. */
  function select(name: string, value: string): void {
    const decl = declOf(name);
    if (!decl) return;
    const next = selectOf(decl, values[name], value);
    if (same(values[name], next)) return;
    values = { ...values, [name]: next };
    flush();
    notify();
  }

  function setStatus(id: string, status: RequestStatus, error?: string): void {
    const current = requests.get(id);
    if (current?.status === status && current?.error === error) return;
    requests.set(id, { status, error });
    notify();
  }

  const status = (id: string): RequestStatus => requests.get(id)?.status ?? "idle";

  /** Operators. Unknown names answer falsely rather than throwing. */
  const has = (name: string, value: string): boolean => {
    const decl = declOf(name);
    return decl ? hasOf(decl, values[name], value) : false;
  };
  const count = (name: string): number => countOf(values[name]);
  const isSet = (name: string): boolean => {
    const decl = declOf(name);
    return decl ? isSetOf(decl, values[name]) : false;
  };
  const isEmpty = (name: string): boolean => !isSet(name);
  const atMax = (name: string): boolean => {
    const decl = declOf(name);
    return decl ? atMaxOf(decl, values[name]) : false;
  };
  const meetsMin = (name: string): boolean => {
    const decl = declOf(name);
    return decl ? meetsMinOf(decl, values[name]) : false;
  };

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  /**
   * A stable object identity per change, so a React binding can compare by
   * reference instead of walking every answer.
   */
  const snapshot = (): Record<string, VariableValue> => values;

  function reset(): void {
    values = initialState(table);
    requests.clear();
    if (persist) persistence.clear(persist);
    notify();
  }

  return {
    get,
    set,
    select,
    has,
    count,
    isSet,
    isEmpty,
    atMax,
    meetsMin,
    status,
    setStatus,
    subscribe,
    snapshot,
    reset,
  };
}
