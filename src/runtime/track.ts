/**
 * The helpers a funnel calls to tell the host something happened — the ad
 * platforms, and the funnel's own analytics.
 *
 * A `track` step names a conversion — `lead`, `purchase`, `initiate_checkout` —
 * and nothing else. Which pixels fire, and under which ids, is the host's to
 * know: the ids live in the host's configuration (a feature flag, today), never
 * in the artifact, so a pixel is swapped without republishing a funnel.
 *
 * An `analytics` step names an event and its properties, read as it runs. Where
 * that is sent — which collector, under whose credentials — is the host's for
 * the same reason: the artifact is a public file and can hold no key.
 *
 * Browser-side only, and never awaited: a tracking call must not hold a visitor
 * up, and one that throws is not the visitor's problem. It is logged under a
 * stable name and the funnel carries on.
 *
 * Kept on `globalThis` for the reason `request` is: every entry — `runtime`,
 * `runtime-client`, `runtime-native` — bundles its own copy of this module, and
 * a host configures through one while `<Funnel>` fires through another.
 */

/** An analytics event's properties, as the step read them when it ran. */
export type AnalyticsProperties = Record<string, unknown>;

export type TrackOptions = {
  /** Fires the pixels for a conversion. Set once by the host app. */
  track?: (event: string) => void;
  /**
   * Sends one event and its properties to the host's analytics. Set once by the
   * host app. It may answer a promise — a sender is usually a fetch — which is
   * never awaited, and whose rejection is logged rather than left unhandled.
   */
  analytics?: (event: string, properties: AnalyticsProperties) => void | Promise<unknown>;
};

const SHARED = Symbol.for("@job-escape/page-builder/tracking");

const shared = (): { options: TrackOptions } => {
  const holder = globalThis as unknown as Record<symbol, { options: TrackOptions } | undefined>;
  holder[SHARED] ??= { options: {} };
  return holder[SHARED];
};

/** Configure once, at mount. The compiled module never sees any of this. */
export function configureTracking(next: TrackOptions): void {
  const state = shared();
  state.options = { ...state.options, ...next };
}

/** Logs a sender that failed. Stable names: alerting selects on them. */
const failed = (name: string, event: string) => (cause: unknown) => {
  console.error(name, {
    event,
    message: cause instanceof Error ? cause.message : String(cause),
  });
};

/**
 * Tell the host's pixels that `event` happened. Returns at once; a host with no
 * tracker configured makes this nothing at all.
 */
export function track(event: string): void {
  const { options } = shared();
  if (!event || !options.track) return;
  try {
    options.track(event);
  } catch (cause) {
    failed("funnel_track_failed", event)(cause);
  }
}

/**
 * Send the host's analytics `event` with `properties`. Returns at once; a host
 * with no sender configured makes this nothing at all.
 */
export function analytics(event: string, properties: AnalyticsProperties = {}): void {
  const { options } = shared();
  if (!event || !options.analytics) return;
  const report = failed("funnel_analytics_failed", event);
  try {
    const sent = options.analytics(event, properties);
    if (sent && typeof (sent as Promise<unknown>).then === "function") {
      (sent as Promise<unknown>).then(undefined, report);
    }
  } catch (cause) {
    report(cause);
  }
}
