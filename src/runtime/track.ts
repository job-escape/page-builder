/**
 * The one helper a funnel calls to tell the ad platforms something happened.
 *
 * A `track` step names a conversion — `lead`, `purchase`, `initiate_checkout` —
 * and nothing else. Which pixels fire, and under which ids, is the host's to
 * know: the ids live in the host's configuration (a feature flag, today), never
 * in the artifact, so a pixel is swapped without republishing a funnel.
 *
 * Browser pixels only, and never awaited: a tracking call must not hold a
 * visitor up, and one that throws is not the visitor's problem. It is logged
 * under a stable name and the funnel carries on.
 *
 * Kept on `globalThis` for the reason `request` is: every entry — `runtime`,
 * `runtime-client`, `runtime-native` — bundles its own copy of this module, and
 * a host configures through one while `<Funnel>` fires through another.
 */

export type TrackOptions = {
  /** Fires the pixels for a conversion. Set once by the host app. */
  track?: (event: string) => void;
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
    // Stable event name: alerting selects on it.
    console.error("funnel_track_failed", {
      event,
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
}
