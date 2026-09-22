import { allMatches } from "./evaluate";
import type { PopupMemory } from "./memory";
import type { PopupRule, VisitorFacts } from "./types";

/**
 * Popup rules authored in console, evaluated against a host's own analytics.
 *
 * One per app. The host starts it once rules may be fetched, hands it every
 * analytics event it hears together with the visitor facts of that moment, and
 * draws `open()`. **Every rule whose condition is met opens its popup** — on
 * load, on an event, and while another popup is already up. They are queued
 * rather than dropped: one is on screen at a time, because two dialogs over one
 * page cover each other, and the next opens when the one before it closes.
 *
 * Framework-free — a store with `subscribe`, for `useSyncExternalStore` — so the
 * webapp and the mobile app run the same queue rather than two that drift.
 *
 * **An event heard before the rules arrive is not lost.** The rules are a fetch,
 * and the event a rule most often names — a page's view — fires as that page
 * mounts, which is before the fetch has answered. Such an event is held and
 * asked again, with the facts of its own moment, once the rules are in. The
 * webapp's first version remembered it and asked nothing, so a rule on the
 * first page's view never opened on a fresh load.
 */
export type PopupRulesController = {
  /** Fetch the rules, then ask every rule that needs no event, and what waited. */
  start(facts: VisitorFacts): Promise<void>;
  /** Fetch the rules again — an app returning to the foreground. The queue stays. */
  reload(): Promise<void>;
  /** An analytics event, as the host sent it. */
  heard(event: { name: string; props?: Record<string, unknown>; facts: VisitorFacts }): void;
  /** The open popup is on screen: counted against its cap. */
  shown(rule: PopupRule): void;
  /** The open popup is gone; the next one waiting opens. */
  closed(): void;
  /** The popup to draw, or null. */
  open(): PopupRule | null;
  subscribe(listener: () => void): () => void;
};

type Waiting = { name: string; props: Record<string, unknown>; facts: VisitorFacts };

export function createPopupRules({
  load,
  memory,
  now = Date.now,
}: {
  /** The rules, or null when they could not be had — see `fetchPopupRules`. */
  load: () => Promise<PopupRule[] | null>;
  memory: PopupMemory;
  now?: () => number;
}): PopupRulesController {
  let rules: PopupRule[] | null = null;
  let queue: PopupRule[] = [];
  let waiting: Waiting[] = [];
  const listeners = new Set<() => void>();

  const set = (next: PopupRule[]) => {
    if (next === queue) return;
    queue = next;
    listeners.forEach((listener) => listener());
  };

  /** A rule already waiting is not added again: met twice before it was seen is one popup. */
  const enqueue = (matched: PopupRule[]) => {
    const fresh = matched.filter((rule) => !queue.some((queued) => queued.id === rule.id));
    if (fresh.length) set([...queue, ...fresh]);
  };

  const ask = (event: Waiting | null, facts: VisitorFacts) => {
    if (!rules?.length) return;
    enqueue(
      allMatches({
        rules,
        event: event?.name ?? null,
        eventProps: event?.props ?? {},
        facts,
        heard: memory.heardEvents(),
        allowed: memory.canFire,
      }),
    );
  };

  /** Null when they could not be had, which is not the same answer as "none". */
  const fetchRules = async (): Promise<PopupRule[] | null> => {
    try {
      return await load();
    } catch {
      return null;
    }
  };

  return {
    async start(facts) {
      rules = (await fetchRules()) ?? [];
      ask(null, facts);
      const held = waiting;
      waiting = [];
      held.forEach((event) => ask(event, event.facts));
    },

    async reload() {
      const next = await fetchRules();
      // A failed reload keeps what was working rather than silencing every rule;
      // an answer of none is an answer, and clears them.
      if (next !== null) rules = next;
    },

    heard({ name, props = {}, facts }) {
      if (!name) return;
      memory.rememberEvent({ name, props, at: now() });
      if (rules === null) {
        waiting.push({ name, props, facts });
        return;
      }
      ask({ name, props, facts }, facts);
    },

    shown(rule) {
      memory.recordFired(rule);
    },

    closed() {
      set(queue.slice(1));
    },

    open: () => queue[0] ?? null,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
