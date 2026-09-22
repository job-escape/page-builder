import type { HeardEvent, PopupRule } from "./types";

/**
 * What the popup rules remember, and where the host says to keep it.
 *
 * - The events heard this session, so a rule asking "they submitted their
 *   email" still matches on the next page of the same visit.
 * - How often each rule has fired, for its cap — per session, per day and ever.
 *
 * Two places, both the host's: `session` lives as long as a visit (the web's
 * `sessionStorage`; memory in an app), `persistent` outlives it (the web's
 * `localStorage`; an app's disk, read into memory at start). Both are read
 * synchronously, because a rule is evaluated the moment an event is heard.
 *
 * Every access is guarded: storage throws in private windows and when site
 * data is blocked, and a popup is never worth breaking the page for.
 */
export type PopupStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type PopupMemory = {
  heardEvents(): HeardEvent[];
  rememberEvent(event: HeardEvent): HeardEvent[];
  canFire(rule: PopupRule): boolean;
  recordFired(rule: PopupRule): void;
};

const HEARD_KEY = "popup_rules:heard";
const FIRED_KEY = "popup_rules:fired";
/** Enough for any rule to look back over a visit, small enough to stay cheap. */
const MAX_HEARD = 200;

function read<T>(storage: PopupStore | undefined, key: string, fallback: T): T {
  try {
    const raw = storage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(storage: PopupStore | undefined, key: string, value: unknown) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Full or blocked — the rules just forget.
  }
}

/** A store that lives as long as this object: an app's session, or a test's. */
export function memoryStore(): PopupStore & { clear(): void } {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    clear: () => values.clear(),
  };
}

type DayCount = { day: string; count: number };

export function createPopupMemory({
  session,
  persistent,
  now = () => new Date(),
}: {
  session?: PopupStore;
  persistent?: PopupStore;
  /** The clock, for the per-day cap. */
  now?: () => Date;
}): PopupMemory {
  const today = () => now().toISOString().slice(0, 10);
  const heardEvents = () => read<HeardEvent[]>(session, HEARD_KEY, []);

  return {
    heardEvents,

    rememberEvent(event) {
      const next = [...heardEvents(), event].slice(-MAX_HEARD);
      write(session, HEARD_KEY, next);
      return next;
    },

    canFire(rule) {
      if (!rule.cap) return true;
      const { times, per } = rule.cap;
      if (per === "session") {
        return (read<Record<string, number>>(session, FIRED_KEY, {})[rule.id] ?? 0) < times;
      }
      if (per === "day") {
        const entry = read<Record<string, DayCount>>(persistent, `${FIRED_KEY}:day`, {})[rule.id];
        return !entry || entry.day !== today() || entry.count < times;
      }
      return (read<Record<string, number>>(persistent, `${FIRED_KEY}:ever`, {})[rule.id] ?? 0) < times;
    },

    recordFired(rule) {
      const sessionCounts = read<Record<string, number>>(session, FIRED_KEY, {});
      write(session, FIRED_KEY, { ...sessionCounts, [rule.id]: (sessionCounts[rule.id] ?? 0) + 1 });

      const days = read<Record<string, DayCount>>(persistent, `${FIRED_KEY}:day`, {});
      const current = days[rule.id];
      write(persistent, `${FIRED_KEY}:day`, {
        ...days,
        [rule.id]: { day: today(), count: current?.day === today() ? current.count + 1 : 1 },
      });

      const ever = read<Record<string, number>>(persistent, `${FIRED_KEY}:ever`, {});
      write(persistent, `${FIRED_KEY}:ever`, { ...ever, [rule.id]: (ever[rule.id] ?? 0) + 1 });
    },
  };
}
