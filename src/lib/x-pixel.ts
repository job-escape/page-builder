"use client";

/**
 * The X (Twitter) pixel, owned by the engine rather than by each host app.
 *
 * X is the odd one out among the ad vendors: `twq` does not take an event
 * *name*, it takes a conversion id minted in the X Ads UI, shaped
 * `tw-<pixel>-<conversion>`. So the id names the ad account as well as the
 * conversion, and any id written into source code pins both — which is how a
 * funnel ends up reporting to a pixel it was moved off months earlier.
 *
 * A host therefore hands over the *configuration* and nothing else, and this
 * owns the rest: injecting X's snippet, configuring the pixel exactly once,
 * mapping an authored event name to its conversion, dropping the parameters X
 * has no field for, and holding events fired before the configuration arrived.
 */

type Twq = ((...args: unknown[]) => void) & {
  version?: string;
  queue?: unknown[];
  exe?: (...args: unknown[]) => void;
};

type TwqWindow = { twq?: Twq };

const SCRIPT_SRC = "https://static.ads-twitter.com/uwt.js";

/**
 * How many events to hold while waiting for the configuration.
 *
 * A host that reads its pixel from a feature flag resolves one a beat after the
 * page does, and a selling-page view fires on arrival — so without a queue the
 * funnel loses exactly the event that marks someone showing up. Deep enough for
 * a visitor to walk several steps, shallow enough that a pixel blocked for the
 * whole session does not grow a list nobody will read.
 */
const QUEUE_LIMIT = 50;

/**
 * Which parameters X accepts on a conversion.
 *
 * The engine hands every adapter the funnel's whole analytics context — the step
 * index, the page ids, the visitor's ids — which is right for a warehouse and
 * wrong for X: it reads a fixed set, and the rest is baggage on the narrowest
 * request of the four vendors.
 */
const SUPPORTED_PARAMS = new Set([
  "value",
  "currency",
  "conversion_id",
  "contents",
  "num_items",
  "search_string",
  "description",
  "status",
]);

/**
 * Authored event name → the key the configuration calls it by.
 *
 * The two vocabularies are named independently: an event name comes from the
 * constructor's `x_push` action, a key from whoever set the conversions up in
 * the X Ads UI. A key named exactly as the event always wins, so adding one is
 * enough to switch an event on without touching this table.
 */
const KEY_ALIASES: Record<string, string> = {
  selling_page_view: "selling_page",
  email: "lead",
};

/** Keys that name the pixel rather than a conversion. */
const PIXEL_KEYS = new Set(["id", "pixel", "pixel_id", "pixelId"]);

/** What the host's configuration resolves to. */
export type XPixelResolution = {
  /** Handed to `twq("config", …)`. */
  pixelId?: string;
  /** Conversion ids by configuration key. */
  events: Record<string, string>;
  /**
   * Used for any event with no conversion of its own. Set only when the host
   * supplies a single id, meaning one conversion covers everything.
   */
  fallbackEventId?: string;
};

/** `tw-reh74-reh75` → `reh74`. A bare pixel id passes through. */
function pixelOf(id: string): string | undefined {
  const parts = id.split("-");
  return parts.length === 3 && parts[0] === "tw" ? parts[1] || undefined : id;
}

/**
 * Reads the configuration in whatever shape it arrives.
 *
 * Deliberately total, and deliberately not validated: a value authored in a
 * feature-flag UI can be anything at all, and this runs during render, where a
 * throw takes hydration down and blanks the funnel. Three shapes are understood
 * and everything else resolves to "no pixel":
 *
 *   `{ id, purchase, … }`  a pixel and one conversion per event
 *   `["tw-a-b"]` / `"tw-a-b"`  one conversion for every event
 *   `"reh74"`  a pixel with no conversion — see `createXPixel`
 */
export function resolveXPixelConfig(value: unknown): XPixelResolution {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && entry[1].trim() !== "",
    );

    const events: Record<string, string> = {};
    for (const [key, id] of entries) {
      if (!PIXEL_KEYS.has(key)) events[key] = id.trim();
    }

    const named = entries.find(([key]) => PIXEL_KEYS.has(key))?.[1];
    // Normally stated outright; falling back to the pixel inside a conversion
    // keeps a configuration working without it.
    const pixelId = named
      ? pixelOf(named.trim())
      : Object.values(events)
          .map((id) => pixelOf(id))
          .find(Boolean);

    return { pixelId, events };
  }

  const first = Array.isArray(value)
    ? value.find(
        (entry): entry is string =>
          typeof entry === "string" && entry.trim() !== "",
      )
    : value;

  const raw = typeof first === "string" ? first.trim() : undefined;
  if (!raw) return { events: {} };

  return raw.startsWith("tw-")
    ? { pixelId: pixelOf(raw), events: {}, fallbackEventId: raw }
    : { pixelId: raw, events: {} };
}

/** The conversion an authored event fires under, or nothing if X has none. */
export function xConversionId(
  { events, fallbackEventId }: XPixelResolution,
  event: string,
): string | undefined {
  // Content may name a conversion of its own, verbatim.
  if (event.startsWith("tw-")) return event;

  return events[event] ?? events[KEY_ALIASES[event] ?? ""] ?? fallbackEventId;
}

/** Keeps only what X reads, and drops the empties among those. */
export function pickXParams(
  props?: Record<string, unknown>,
): Record<string, unknown> {
  if (!props) return {};
  return Object.fromEntries(
    Object.entries(props).filter(
      ([key, value]) => SUPPORTED_PARAMS.has(key) && value !== undefined,
    ),
  );
}

/**
 * Pixels already handed to `twq("config", …)`.
 *
 * Configuring one twice double-counts every conversion that follows on it, and
 * the id arrives asynchronously — so the set, not the call site, is what makes
 * it exactly once.
 */
const configured = new Set<string>();

/** Injects X's snippet if needed and configures a pixel it has not yet. */
export function loadXPixel(pixelId: string): Twq | undefined {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return undefined;
  }
  const id = pixelId.trim();
  if (!id) return undefined;

  const target = window as unknown as TwqWindow;

  if (!target.twq) {
    /**
     * X's own snippet. `exe` is installed by uwt.js once it lands and is called
     * with the queue object as its receiver, so the stub has to forward `this`
     * along with the arguments — spreading them (`stub.exe(...args)`) drops the
     * receiver, and uwt.js then reads its queue off `undefined` and throws on
     * the first event after the script loads.
     */
    const stub = function queued(this: unknown, ...args: unknown[]) {
      if (stub.exe) Reflect.apply(stub.exe, stub, args);
      else stub.queue?.push(args);
    } as Twq;
    stub.version = "1.1";
    stub.queue = [];
    target.twq = stub;

    const script = document.createElement("script");
    script.async = true;
    script.src = SCRIPT_SRC;
    const first = document.querySelectorAll("script")[0];
    first?.parentNode?.insertBefore(script, first);
  }

  if (!configured.has(id)) {
    configured.add(id);
    try {
      target.twq?.("config", id);
    } catch {
      // An ad blocker may have replaced `twq` with a stub that throws. This runs
      // inside a React effect, so letting it out would take the render down —
      // over a pixel, which is the one thing that must never cost a funnel.
    }
  }

  return target.twq;
}

/** Test seam: the configured set outlives a module reload otherwise. */
export function resetXPixelConfig(): void {
  configured.clear();
}

export type XPixelRuntime = {
  /** True the first time a configuration takes; false when there is nothing to do. */
  configure: (config: unknown) => boolean;
  track: (event: string, props?: Record<string, unknown>) => void;
};

type PendingEvent = { event: string; props?: Record<string, unknown> };

export function createXPixelRuntime(): XPixelRuntime {
  let resolution: XPixelResolution = { events: {} };
  const pending: PendingEvent[] = [];

  const send = ({ event, props }: PendingEvent) => {
    const conversionId = xConversionId(resolution, event);
    // No conversion for this event, which is a normal state rather than an
    // error: the configuration decides which of the funnel's events the ad
    // account counts.
    if (!conversionId || !resolution.pixelId) return;

    const twq =
      loadXPixel(resolution.pixelId) ?? (window as unknown as TwqWindow).twq;
    if (!twq) return;

    try {
      twq("event", conversionId, pickXParams(props));
    } catch {
      // Never let a blocked pixel abort the authored action chain.
    }
  };

  return {
    configure(config) {
      const next = resolveXPixelConfig(config);
      /**
       * A pixel with no conversion on it is not worth configuring.
       *
       * `twq("config", …)` activates the tag: it shows up in X's Pixel Helper
       * and counts as a visit on that ad account, while an event can only be
       * fired under a conversion id. So a pixel with none would advertise the
       * funnel to an account it can never report a sale to — which is what a
       * bare pixel id in an environment variable amounts to.
       *
       * Nothing to configure is not a failure to retry either: a flag may
       * simply not have resolved yet, and the caller tries again when it does.
       */
      const hasConversion =
        Boolean(next.fallbackEventId) || Object.keys(next.events).length > 0;
      if (!next.pixelId || !hasConversion) return false;
      if (resolution.pixelId === next.pixelId) return false;

      resolution = next;
      if (!loadXPixel(next.pixelId)) return false;

      for (const event of pending.splice(0)) send(event);
      return true;
    },

    track(event, props) {
      if (!resolution.pixelId) {
        // Oldest first: what someone did most recently is the likelier thing to
        // matter if only some of it can be kept.
        if (pending.length >= QUEUE_LIMIT) pending.shift();
        pending.push({ event, props });
        return;
      }
      send({ event, props });
    },
  };
}
