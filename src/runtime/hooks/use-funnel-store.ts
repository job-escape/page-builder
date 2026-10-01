/**
 * The funnel's store: its variable table, its timers, and everything that
 * keeps the store current without a visitor doing anything — what was saved,
 * the device, a running timer, the clock.
 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import type { FunnelCoreOptions } from "../funnel-types";
import { createFunnelStore, type FunnelStore } from "../store";
import { createTimerBook, type TimerBook } from "../timers";
import type { VariableTable } from "../types";

import { useBeforePaint } from "./use-before-paint";

type StoreOptions = Pick<
  FunnelCoreOptions<unknown, unknown>,
  | "manifest"
  | "persist"
  | "visitor"
  | "device"
  | "timerStorage"
  | "onUnknown"
  | "onAnswer"
  | "restoreOnMount"
  | "initialValues"
>;

export function useFunnelStore({
  manifest,
  persist,
  visitor,
  device,
  timerStorage,
  onUnknown,
  onAnswer,
  restoreOnMount = true,
  initialValues,
}: StoreOptions): { table: VariableTable; store: FunnelStore; timers: TimerBook } {
  // Read when a store is made, through a ref: a host writing the object inline
  // must not rebuild the store — and lose every answer — on each render.
  const initialRef = useRef(initialValues);
  initialRef.current = initialValues;
  const table: VariableTable = useMemo(
    () => Object.fromEntries(manifest.variables.map((decl) => [decl.name, decl])),
    [manifest.variables],
  );

  /*
    `persist` by value, never by identity. Hosts write it as a literal —
    `persist={{ funnelId, version }}` — which is a new object every render, and
    a store keyed on the object was rebuilt each time. Answers survived that,
    being read back out of the cookie, but everything the store does not keep
    did not: a screen's own state went, and a flow still running — an opening
    step waiting two seconds — finished into a store nobody was drawing from.
  */
  const persistKey = persist ? `${persist.funnelId} ${persist.version}` : null;
  /*
    The device at the moment a store is made, read through a ref so that a
    device change is not a reason to make a new one — see `device` in the
    options. A store rebuilt for another reason starts on the device the funnel
    is on now.
  */
  const currentDevice = useRef(device);
  currentDevice.current = device;
  /*
    The timers, made once per funnel identity like the store — and read through a
    ref for the storage, which hosts write as a fresh object on every render.
  */
  const storageRef = useRef(timerStorage);
  storageRef.current = timerStorage;
  const timers = useMemo(
    () => createTimerBook({ storage: storageRef.current ?? null }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [persist?.funnelId],
  );

  const store = useMemo(
    () =>
      createFunnelStore({
        table,
        persist,
        visitor,
        device: currentDevice.current,
        onUnknown: (name) => onUnknown?.("variable", name),
        onChange: onAnswer,
        timers,
        // Read after hydration, below: the first render has to be the one a
        // server made, and a server has no cookie to read.
        deferRestore: true,
        initial: initialRef.current,
      }),
    // A new store per funnel identity, not per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [table, persistKey, visitor, onUnknown, onAnswer, timers],
  );

  /*
    What was saved, read once the first render has been committed and before
    the browser paints it — so hydration matches the server, and a funnel drawn
    only in the browser never shows its defaults at all. Before the opening
    steps and the timers, which run in plain effects and read what it restores.
  */
  useBeforePaint(() => {
    if (restoreOnMount) store.restore();
  }, [store, restoreOnMount]);

  /*
    A running timer redraws what reads it — once per displayed second, never per
    frame. Checked four times a second so a reading turns over within a quarter
    of a second of the real one, and skipped entirely while nothing is running.
    Timers restored from storage start this the moment they are ready.
  */
  useEffect(() => {
    let last = timers.signature();
    const interval = setInterval(() => {
      if (!timers.running() && timers.signature() === last) return;
      const next = timers.signature();
      if (next === last) return;
      last = next;
      store.tick();
    }, 250);
    void timers.ready.then(() => {
      last = timers.signature();
      store.tick();
    });
    return () => clearInterval(interval);
  }, [timers, store]);

  /*
    The clock, for calculated variables that read it: a countdown's seconds are
    `endsAt - now`, which changes with nothing written. Redrawn once a second,
    and only for a funnel that has such a formula.
  */
  const clocked = useMemo(
    () =>
      manifest.variables.some(
        (decl) => decl.formula && JSON.stringify(decl.formula).includes('"now"'),
      ),
    [manifest.variables],
  );
  useEffect(() => {
    if (!clocked) return undefined;
    const interval = setInterval(() => store.tick(), 1000);
    return () => clearInterval(interval);
  }, [clocked, store]);

  useBeforePaint(() => {
    store.setDevice(device ?? "mobile");
  }, [store, device]);

  // Whoever mounts the funnel redraws when anything in the store changes.
  useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);

  return { table, store, timers };
}
