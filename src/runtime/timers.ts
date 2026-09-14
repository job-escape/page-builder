/**
 * Timers that remember — a countdown's deadline outlives the page it ran on.
 *
 * An offer that "expires in 10:00" and resets to 10:00 on every reload is a
 * lie a visitor catches in one refresh. So a timer is stored as the moment it
 * started and, for a countdown, the moment it ends — never as seconds left —
 * and reading it is arithmetic against the clock.
 *
 * **Not in the answers cookie.** That blob is keyed by funnel *version* and
 * discarded when the funnel is republished (see `persistence`), which is right
 * for answers whose shape may have changed and wrong for a deadline: a designer
 * fixing a typo would hand every visitor mid-countdown a fresh ten minutes. So
 * timers live under their own key, by funnel id alone.
 *
 * **Storage is the host's.** The web keeps it in `localStorage` (it never needs
 * to reach a server, unlike an answer); an app hands in whatever it stores with.
 * Either may be asynchronous — `ready` is what a `timer` step waits on before it
 * decides whether a timer already exists.
 */

export type TimerMode = "countdown" | "elapsed";

export type TimerRecord = {
  mode: TimerMode;
  /** Epoch milliseconds. */
  start: number;
  /** Epoch milliseconds, for a countdown. */
  deadline?: number;
};

/**
 * Where timers are kept. Either half may answer a promise, for a host whose
 * storage is asynchronous — React Native's `AsyncStorage` is.
 */
export type TimerStorage = {
  read: () => Record<string, TimerRecord> | null | Promise<Record<string, TimerRecord> | null>;
  write: (records: Record<string, TimerRecord>) => void | Promise<void>;
};

export const timerStorageKey = (funnelId: string | number): string => `jb_timers_${funnelId}`;

/** A record read back from storage, or nothing if it is not one. */
function recordOf(value: unknown): TimerRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<TimerRecord>;
  if (record.mode !== "countdown" && record.mode !== "elapsed") return null;
  if (typeof record.start !== "number" || !Number.isFinite(record.start)) return null;
  if (record.mode === "countdown" && (typeof record.deadline !== "number" || !Number.isFinite(record.deadline))) {
    return null;
  }
  return { mode: record.mode, start: record.start, ...(record.mode === "countdown" ? { deadline: record.deadline } : {}) };
}

/**
 * The browser's storage, for a funnel id. `null` where there is none — a server
 * render, a sandbox that throws on access — and then timers simply do not
 * outlive the page.
 */
export function webTimerStorage(funnelId: string | number): TimerStorage | null {
  let storage: Storage | null = null;
  try {
    storage = typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    storage = null;
  }
  if (!storage) return null;
  const key = timerStorageKey(funnelId);
  return {
    read: () => {
      try {
        const raw = storage!.getItem(key);
        return raw ? (JSON.parse(raw) as Record<string, TimerRecord>) : null;
      } catch {
        return null;
      }
    },
    write: (records) => {
      try {
        storage!.setItem(key, JSON.stringify(records));
      } catch {
        // Full, or blocked. A timer that does not survive a reload is a lesser
        // wrong than a funnel that throws.
      }
    },
  };
}

export type TimerBook = ReturnType<typeof createTimerBook>;

export function createTimerBook(options: { storage?: TimerStorage | null; clock?: () => number } = {}) {
  const clock = options.clock ?? (() => Date.now());
  const storage = options.storage ?? null;
  let records: Record<string, TimerRecord> = {};

  const adopt = (stored: Record<string, TimerRecord> | null | undefined): void => {
    if (!stored || typeof stored !== "object") return;
    const next: Record<string, TimerRecord> = {};
    Object.entries(stored).forEach(([id, value]) => {
      const record = recordOf(value);
      if (record) next[id] = record;
    });
    // Anything started while storage was still loading wins over what it held.
    records = { ...next, ...records };
  };

  let ready: Promise<void> = Promise.resolve();
  if (storage) {
    try {
      const stored = storage.read();
      if (stored && typeof (stored as Promise<unknown>).then === "function") {
        ready = (stored as Promise<Record<string, TimerRecord> | null>).then(adopt, () => undefined);
      } else {
        adopt(stored as Record<string, TimerRecord> | null);
      }
    } catch {
      // Unreadable storage is no storage.
    }
  }

  const save = (): void => {
    if (!storage) return;
    try {
      void storage.write(records);
    } catch {
      // See `webTimerStorage`.
    }
  };

  /**
   * Start a timer, or leave a running one alone.
   *
   * A timer that exists is kept — ended or not — unless `restart` says to begin
   * again. That is the whole of "an offer expires once".
   */
  function start(id: string, spec: { mode?: TimerMode; seconds?: number; restart?: boolean }): TimerRecord {
    const mode: TimerMode = spec.mode === "elapsed" ? "elapsed" : "countdown";
    const existing = records[id];
    if (existing && existing.mode === mode && !spec.restart) return existing;
    const at = clock();
    const record: TimerRecord =
      mode === "countdown"
        ? { mode, start: at, deadline: at + Math.max(0, Number(spec.seconds) || 0) * 1000 }
        : { mode, start: at };
    records = { ...records, [id]: record };
    save();
    return record;
  }

  /**
   * Whole seconds: left on a countdown (rounded up, so `00:01` shows until the
   * last second is really gone), gone by on an elapsed one. `null` for a timer
   * nobody has started.
   */
  function read(id: string): number | null {
    const record = records[id];
    if (!record) return null;
    const at = clock();
    if (record.mode === "countdown") return Math.max(0, Math.ceil(((record.deadline ?? at) - at) / 1000));
    return Math.max(0, Math.floor((at - record.start) / 1000));
  }

  /** Milliseconds until a countdown ends — 0 if it has, `null` if it is not one. */
  function remainingMs(id: string): number | null {
    const record = records[id];
    if (!record || record.mode !== "countdown") return null;
    return Math.max(0, (record.deadline ?? 0) - clock());
  }

  /** Whether anything is still moving, so the host knows to keep ticking. */
  function running(): boolean {
    const at = clock();
    return Object.values(records).some(
      (record) => record.mode === "elapsed" || (record.deadline ?? 0) > at,
    );
  }

  /** A signature of every displayed second — changes exactly when a reading does. */
  function signature(): string {
    return Object.keys(records)
      .sort()
      .map((id) => `${id}:${read(id)}`)
      .join("|");
  }

  function clear(): void {
    records = {};
    save();
  }

  return {
    get ready() {
      return ready;
    },
    start,
    read,
    remainingMs,
    running,
    signature,
    clear,
  };
}
