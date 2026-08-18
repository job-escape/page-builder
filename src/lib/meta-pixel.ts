"use client";

/**
 * The Meta (Facebook) pixel, owned by the engine rather than by each host app.
 *
 * A host hands over the *configuration* — which pixel ids this visitor is
 * reported to — and this owns the rest: Meta's base snippet, initialising each
 * id exactly once, the page view that follows, and holding events fired before
 * the configuration arrived.
 *
 * Which ids those are stays the host's decision. They come from a feature flag
 * targeted on the visitor (quiz version, utm source), and only the host has the
 * client and the attributes to evaluate that — so the host resolves and the
 * engine receives the answer.
 */

import { PixelTrackEvent } from "../types";

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[];
  push?: unknown;
  loaded?: boolean;
  version?: string;
};

type FbqWindow = { fbq?: Fbq; _fbq?: Fbq };

const SCRIPT_SRC = "https://connect.facebook.net/en_US/fbevents.js";

/**
 * How many events to hold while waiting for the configuration. Deep enough for
 * a visitor to walk several steps before a flag resolves, shallow enough that a
 * pixel blocked for the whole session does not grow a list nobody will read.
 */
const QUEUE_LIMIT = 50;

/** Accepts what a feature flag actually holds: a list, or one comma-separated string. */
export function resolveMetaPixelIds(value: unknown): string[] {
  const raw = typeof value === "string" ? value.split(",") : value;
  if (!Array.isArray(raw)) return [];

  const ids = raw
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);

  // A duplicate initialises the same pixel twice, and every conversion it
  // reports arrives twice with it.
  return [...new Set(ids)];
}

/**
 * Meta's base snippet, written out rather than injected as a `<script>` blob.
 *
 * `window.fbq` exists the moment this returns: the stub queues calls itself
 * until `fbevents.js` lands. Injecting the snippet through a `<script>` tag
 * instead leaves a window in which `fbq` is undefined — which is why a host
 * that lets a tag manager inject it ends up polling for it a hundred times.
 *
 * An `fbq` someone else already installed is adopted rather than replaced, so a
 * host whose tag manager loads the snippet keeps working.
 */
export function loadMetaPixel(): Fbq | undefined {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return undefined;
  }

  const target = window as unknown as FbqWindow;
  if (target.fbq) return target.fbq;

  const fbq = function queued(...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  } as Fbq;

  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];

  target.fbq = fbq;
  target._fbq ??= fbq;

  const script = document.createElement("script");
  script.async = true;
  script.src = SCRIPT_SRC;
  const first = document.querySelectorAll("script")[0];
  first?.parentNode?.insertBefore(script, first);

  return fbq;
}

/**
 * Every call into fbq goes through here. Swallowing is on purpose: this runs
 * inside the engine's action chain, and a throw would abort whatever the author
 * scheduled after it — including the action that moves the funnel on. A lost
 * event must not cost a step, and a pixel an ad blocker has replaced with a
 * booby-trapped stub must not cost the sale.
 */
function call(...args: unknown[]) {
  const { fbq } = window as unknown as FbqWindow;
  if (!fbq) return;
  try {
    fbq(...args);
  } catch {
    /* see above */
  }
}

/**
 * Pixels already handed to `fbq("init", …)`.
 *
 * Initialising one twice double-counts every event that follows on it, and the
 * ids arrive asynchronously from a flag — so the set, not the call site, is
 * what makes it exactly once.
 */
const initialised = new Set<string>();

/** Test seam: the initialised set outlives a module reload otherwise. */
export function resetMetaPixelConfig(): void {
  initialised.clear();
}

export type MetaPixelRuntime = {
  /** True the first time a configuration takes; false when there is nothing to do. */
  configure: (config: unknown) => boolean;
  track: (event: PixelTrackEvent) => void;
};

export function createMetaPixelRuntime(): MetaPixelRuntime {
  let configured = false;
  /** Events fired before there was a pixel to send them to. */
  const pending: PixelTrackEvent[] = [];

  const send = (event: PixelTrackEvent) => {
    // fbq reads the event id from the fourth argument, so an event carrying one
    // but no props still has to pass something for the third.
    const args: unknown[] = [event.eventType, event.eventName];
    if (event.eventProps) args.push(event.eventProps);
    else if (event.eventExtra) args.push({});
    if (event.eventExtra) args.push(event.eventExtra);

    call(...args);
  };

  return {
    configure(config) {
      const ids = resolveMetaPixelIds(config);
      // Nothing to initialise is not a failure to retry: the flag may simply
      // not have resolved yet, and the caller tries again when it does. An
      // empty list from a flag that HAS resolved means "report nowhere", and
      // reaches the same place — nothing is initialised.
      if (ids.length === 0) return false;

      const fresh = ids.filter((id) => !initialised.has(id));
      if (fresh.length === 0) return false;
      if (!loadMetaPixel()) return false;

      for (const id of fresh) {
        initialised.add(id);
        call("init", id);
      }
      // Meta's own arrival event, once per pass rather than once per pixel: it
      // goes to every pixel initialised so far.
      call("track", "PageView");

      configured = true;
      for (const event of pending.splice(0)) send(event);
      return true;
    },

    track(event) {
      if (!configured) {
        // Oldest first: what someone did most recently is the likelier thing to
        // matter if only some of it can be kept.
        if (pending.length >= QUEUE_LIMIT) pending.shift();
        pending.push(event);
        return;
      }
      send(event);
    },
  };
}
