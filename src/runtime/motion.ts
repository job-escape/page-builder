/**
 * Time, for the parts of a funnel that move — the one clock both renderers use.
 *
 * A loader counting to 100 is a variable changing sixty times a second, and
 * which frames it lands on has to be decided in one place: if the web and the
 * phone each ran their own tween, the same artifact would read `63%` on one and
 * `61%` on the other at the same instant, and "native works exactly as the web
 * does" would be true only on average.
 *
 * No React, no DOM. `requestAnimationFrame` where there is one — a browser, and
 * React Native, which provides it — and a timer where there is not, so a server
 * render or a test runs the same code.
 */
import type { MotionEasing } from "./compiler/source";

/** The CSS curves, as `cubic-bezier` control points — both renderers draw from these. */
export const CURVES: Record<Exclude<MotionEasing, "linear">, [number, number, number, number]> = {
  ease: [0.25, 0.1, 0.25, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
};

/**
 * A cubic bezier from (0,0) to (1,1), solved for y at x — what a browser does
 * for `transition-timing-function`. Newton's method with a bisection fallback,
 * which converges in a handful of steps for these four curves.
 */
function bezier([x1, y1, x2, y2]: [number, number, number, number], x: number): number {
  const at = (a: number, b: number, t: number) =>
    3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3;
  const slope = (a: number, b: number, t: number) =>
    3 * a * (1 - t) ** 2 + 6 * (b - a) * t * (1 - t) + 3 * (1 - b) * t ** 2;

  let t = x;
  for (let step = 0; step < 8; step += 1) {
    const error = at(x1, x2, t) - x;
    if (Math.abs(error) < 1e-5) return at(y1, y2, t);
    const d = slope(x1, x2, t);
    if (Math.abs(d) < 1e-6) break;
    t -= error / d;
  }
  let low = 0;
  let high = 1;
  t = x;
  for (let step = 0; step < 30; step += 1) {
    const value = at(x1, x2, t);
    if (Math.abs(value - x) < 1e-5) break;
    if (value < x) low = t;
    else high = t;
    t = (low + high) / 2;
  }
  return at(y1, y2, t);
}

/** Progress 0..1 through time, as progress 0..1 through the value. */
export function ease(easing: MotionEasing | string | undefined, progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  if (!easing || easing === "linear") return p;
  const curve = CURVES[easing as Exclude<MotionEasing, "linear">];
  return curve ? bezier(curve, p) : p;
}

/** Milliseconds as an animation can use them: 0 – 10 minutes, never NaN. */
export const durationOf = (value: unknown): number =>
  Math.min(600_000, Math.max(0, Number(value) || 0));

type FrameRequest = (callback: (now: number) => void) => unknown;
type FrameCancel = (handle: unknown) => void;

const now = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

function frameApi(): { request: FrameRequest; cancel: FrameCancel } {
  const scope = globalThis as unknown as {
    requestAnimationFrame?: FrameRequest;
    cancelAnimationFrame?: FrameCancel;
  };
  if (typeof scope.requestAnimationFrame === "function" && typeof scope.cancelAnimationFrame === "function") {
    return {
      request: (callback) => scope.requestAnimationFrame!(callback),
      cancel: (handle) => scope.cancelAnimationFrame!(handle),
    };
  }
  return {
    request: (callback) => setTimeout(() => callback(now()), 16),
    cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
}

/**
 * Run `onFrame(progress)` every frame for `ms`, ending on exactly `1`.
 *
 * Returns a promise that answers `true` when it ran to the end, and a `stop`
 * that answers it `false` without drawing another frame — the canceller a
 * screen owns. A duration of zero draws the last frame at once.
 */
export function playFrames(
  ms: number,
  onFrame: (progress: number) => void,
): { done: Promise<boolean>; stop: () => void } {
  const { request, cancel } = frameApi();
  let handle: unknown;
  let settled = false;
  let finish: (value: boolean) => void = () => undefined;
  const done = new Promise<boolean>((resolve) => {
    finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
  });

  const duration = durationOf(ms);
  if (duration === 0) {
    onFrame(1);
    finish(true);
    return { done, stop: () => finish(false) };
  }

  const started = now();
  const tick = (): void => {
    if (settled) return;
    const progress = Math.min(1, (now() - started) / duration);
    onFrame(progress);
    if (progress >= 1) {
      finish(true);
      return;
    }
    handle = request(tick);
  };
  handle = request(tick);

  return {
    done,
    stop: () => {
      if (settled) return;
      cancel(handle);
      finish(false);
    },
  };
}

// ─── A frame's own motion ────────────────────────────────────────────────────

/**
 * How a frame moves when a value it is drawn with changes — a bar's width
 * bound to a loader's variable, a card fading as it is chosen.
 *
 * Declared on the frame rather than played by a step, because it is a property
 * of the *look*: whatever changes the width — a step, a request, a selection,
 * another screen — the bar glides to it.
 */
export type FrameTransition = {
  /** Milliseconds. */
  duration?: number;
  easing?: MotionEasing;
  /** Milliseconds before it starts. */
  delay?: number;
};

/**
 * A motion a frame plays on its own — a spinner, a pulse, a shimmer while
 * something loads, an entrance. A closed list, so the phone and the browser
 * play the same frames: every preset is defined once, below, by numbers.
 */
export type MotionPreset = "spin" | "pulse" | "shimmer" | "fadeIn" | "slideUp";

export type FrameMotion = {
  preset: MotionPreset;
  duration?: number;
  delay?: number;
  /** How many times; `"infinite"` for a spinner. Entrances default to once, loops to forever. */
  repeat?: number | "infinite";
};

type PresetSpec = {
  duration: number;
  repeat: number | "infinite";
  easing: MotionEasing;
  /**
   * The keyframes, as stops through one cycle. Each is the look at that point —
   * `opacity`, `translateY` in points, `scale`, `rotate` in degrees.
   */
  stops: Array<{ at: number; opacity?: number; translateY?: number; scale?: number; rotate?: number }>;
};

export const MOTION_PRESETS: Record<MotionPreset, PresetSpec> = {
  spin: {
    duration: 900,
    repeat: "infinite",
    easing: "linear",
    stops: [
      { at: 0, rotate: 0 },
      { at: 1, rotate: 360 },
    ],
  },
  pulse: {
    duration: 1200,
    repeat: "infinite",
    easing: "ease-in-out",
    stops: [
      { at: 0, scale: 1, opacity: 1 },
      { at: 0.5, scale: 1.06, opacity: 0.85 },
      { at: 1, scale: 1, opacity: 1 },
    ],
  },
  shimmer: {
    duration: 1200,
    repeat: "infinite",
    easing: "ease-in-out",
    stops: [
      { at: 0, opacity: 1 },
      { at: 0.5, opacity: 0.45 },
      { at: 1, opacity: 1 },
    ],
  },
  fadeIn: {
    duration: 300,
    repeat: 1,
    easing: "ease-out",
    stops: [
      { at: 0, opacity: 0 },
      { at: 1, opacity: 1 },
    ],
  },
  slideUp: {
    duration: 360,
    repeat: 1,
    easing: "ease-out",
    stops: [
      { at: 0, opacity: 0, translateY: 12 },
      { at: 1, opacity: 1, translateY: 0 },
    ],
  },
};

/** A `transition` prop read tolerantly — `null` when there is nothing to play. */
export function transitionOf(value: unknown): Required<FrameTransition> | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as FrameTransition;
  const duration = durationOf(raw.duration);
  if (duration === 0) return null;
  const easing = raw.easing && (raw.easing === "linear" || raw.easing in CURVES) ? raw.easing : "ease-out";
  return { duration, easing, delay: durationOf(raw.delay) };
}

/** A `motion` prop read tolerantly — `null` for anything that is not a known preset. */
export function motionOf(
  value: unknown,
): { preset: MotionPreset; spec: PresetSpec; duration: number; delay: number; repeat: number | "infinite" } | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as FrameMotion;
  const spec = MOTION_PRESETS[raw.preset];
  if (!spec) return null;
  const duration = durationOf(raw.duration) || spec.duration;
  const repeat =
    raw.repeat === "infinite" ? "infinite" : Number.isFinite(Number(raw.repeat)) && Number(raw.repeat) > 0
      ? Math.floor(Number(raw.repeat))
      : spec.repeat;
  return { preset: raw.preset, spec, duration, delay: durationOf(raw.delay), repeat };
}

/**
 * The last look of every frame that carries a `motionKey`, across screens.
 *
 * A progress bar in a header is a different frame on every screen, so nothing
 * would glide: each screen draws its own bar already at its own width. A key
 * says "these are the same bar" — the new one starts at the width the old one
 * ended on and glides from there. One map per page; keys are the designer's.
 */
export const carriedLooks = new Map<string, Record<string, unknown>>();
