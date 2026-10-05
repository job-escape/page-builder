/**
 * What a `sound` step reaches: the host's own way of making a noise.
 *
 * A funnel that pops when an answer is tapped feels alive, and a design should
 * be able to ask for that. What it must not do is decide *how*: a browser has
 * WebAudio and an autoplay policy, a phone has a native player and a silent
 * switch, and a host may have a sound setting the visitor turned off. So the
 * step carries a **name** — `pop`, `success`, a name of the host's own — the
 * way `track` carries a conversion's key and never a pixel id, and the host
 * says what that name sounds like.
 *
 * No default player, on purpose. A sound nobody asked their host to make is a
 * page that makes noise on somebody's train, and a synthesiser living in here
 * would be one every host ships whether it plays anything or not. A host that
 * configures nothing is silent, and a design that names a sound it does not
 * know is silent too — both are the right failure for a noise.
 */

/** The names a design can count on a host knowing. A host may know more. */
export const SOUND_NAMES = ["pop", "success", "fanfare", "nudge", "tick"] as const;

export type SoundName = (typeof SOUND_NAMES)[number];

export type SoundOptions = {
  /**
   * Make the sound called `name`. Called from inside the tap that asked for
   * it, which is what a browser's autoplay policy wants; never awaited. An
   * unknown name is the host's to ignore.
   */
  play?: (name: string) => void | Promise<unknown>;
};

/**
 * Shared across copies of this module, for the reason `track`'s options are:
 * a host calls `configureSounds` from one entry and the steps run from
 * another, and a bundler that gives each its own copy would otherwise give
 * each its own, empty, options.
 */
const SHARED = Symbol.for("@job-escape/page-builder/sounds");

const shared = (): { options: SoundOptions } => {
  const holder = globalThis as unknown as Record<symbol, { options: SoundOptions } | undefined>;
  holder[SHARED] ??= { options: {} };
  return holder[SHARED];
};

/** The host's hook. Call it once, where the funnel is mounted. */
export function configureSounds(next: SoundOptions): void {
  const state = shared();
  state.options = { ...state.options, ...next };
}

const failed = (name: string) => (cause: unknown) => {
  console.error("funnel_sound_failed", {
    sound: name,
    message: cause instanceof Error ? cause.message : String(cause),
  });
};

/**
 * Play a named sound through the host. Fired and not awaited, and never in the
 * way: a player that throws, or rejects because the browser refused to start
 * audio, is logged and the steps after it run as if it had played.
 */
export function playSound(name: string): void {
  const { options } = shared();
  if (!name || !options.play) return;
  const report = failed(name);
  try {
    const played = options.play(name);
    if (played && typeof (played as Promise<unknown>).then === "function") {
      (played as Promise<unknown>).then(undefined, report);
    }
  } catch (cause) {
    report(cause);
  }
}
