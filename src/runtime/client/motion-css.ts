/**
 * A frame's motion, as the browser plays it — see `runtime/motion` for what
 * each prop means and why the presets are numbers rather than CSS.
 *
 * The keyframes are *generated* from `MOTION_PRESETS`, not written here, so the
 * phone and the browser cannot drift: React Native interpolates the same stops.
 */
import { useEffect, useLayoutEffect, useState, type CSSProperties } from "react";

import { CURVES, MOTION_PRESETS, carriedLooks, motionOf, transitionOf, type MotionPreset } from "../motion";

/** The properties a `transition` glides — what a bound value can change. */
const GLIDED = ["width", "height", "opacity", "background-color", "background", "border-radius", "transform"];

const cubic = (easing: string): string => {
  if (easing === "linear") return "linear";
  const curve = CURVES[easing as keyof typeof CURVES];
  return curve ? `cubic-bezier(${curve.join(", ")})` : "ease-out";
};

/** `transition` as the CSS declaration, or nothing. */
export function transitionCss(value: unknown): string | undefined {
  const transition = transitionOf(value);
  if (!transition) return undefined;
  const timing = `${transition.duration}ms ${cubic(transition.easing)} ${transition.delay}ms`;
  return GLIDED.map((property) => `${property} ${timing}`).join(", ");
}

const keyframeName = (preset: MotionPreset): string => `pb-motion-${preset}`;

/** One stop as CSS — the same four numbers native interpolates. */
function stopCss(stop: (typeof MOTION_PRESETS)[MotionPreset]["stops"][number]): string {
  const transforms: string[] = [];
  if (stop.translateY !== undefined) transforms.push(`translateY(${stop.translateY}px)`);
  if (stop.scale !== undefined) transforms.push(`scale(${stop.scale})`);
  if (stop.rotate !== undefined) transforms.push(`rotate(${stop.rotate}deg)`);
  const parts: string[] = [];
  if (stop.opacity !== undefined) parts.push(`opacity: ${stop.opacity}`);
  if (transforms.length) parts.push(`transform: ${transforms.join(" ")}`);
  return `${Math.round(stop.at * 100)}% { ${parts.join("; ")} }`;
}

export const MOTION_KEYFRAMES = (Object.keys(MOTION_PRESETS) as MotionPreset[])
  .map(
    (preset) =>
      `@keyframes ${keyframeName(preset)} { ${MOTION_PRESETS[preset].stops.map(stopCss).join(" ")} }`,
  )
  .join("\n");

const STYLE_ID = "pb-motion-keyframes";

/**
 * Put the keyframes in the page once. Written into `<head>` by the first frame
 * that needs them rather than shipped as a stylesheet: this package ships no
 * CSS (see `AGENTS.md`), and a funnel with no motion writes nothing at all.
 */
function ensureKeyframes(): void {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `${MOTION_KEYFRAMES}\n@media (prefers-reduced-motion: reduce) { [data-pb-motion] { animation: none !important; } }`;
  document.head.appendChild(style);
}

/** `motion` as the CSS `animation`, or nothing. */
export function motionCss(value: unknown): CSSProperties {
  const motion = motionOf(value);
  if (!motion) return {};
  const repeat = motion.repeat === "infinite" ? "infinite" : String(motion.repeat);
  return {
    animation: `${keyframeName(motion.preset)} ${motion.duration}ms ${cubic(motion.spec.easing)} ${motion.delay}ms ${repeat} both`,
  };
}

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * A brick's motion, wired: keyframes present, and the look it should start from.
 *
 * `look` is what the brick is drawn with now. With a `motionKey` and a
 * transition, the first render draws the look that key last had — on the
 * previous screen — and the next frame draws `look`, so the browser's own
 * transition carries it across. Every render remembers the look for the next
 * screen.
 */
export function useWebMotion<Look extends Record<string, unknown>>(options: {
  motion: unknown;
  transition: unknown;
  motionKey: unknown;
  look: Look;
}): Look {
  const { motion, transition, look } = options;
  const key = typeof options.motionKey === "string" && options.motionKey ? options.motionKey : null;
  const gliding = Boolean(transitionOf(transition));
  const [from, setFrom] = useState<Look | null>(() => {
    if (!key || !gliding) return null;
    const last = carriedLooks.get(key) as Look | undefined;
    if (!last) return null;
    const differs = Object.keys(look).some((name) => last[name] !== look[name]);
    return differs ? { ...look, ...last } : null;
  });

  useIsomorphicLayoutEffect(() => {
    if (motionOf(motion)) ensureKeyframes();
  }, [motion]);

  useIsomorphicLayoutEffect(() => {
    if (!from || typeof requestAnimationFrame === "undefined") {
      if (from) setFrom(null);
      return undefined;
    }
    // Two frames: one to paint where it was, one to start going where it is.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setFrom(null));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [from]);

  useEffect(() => {
    if (key) carriedLooks.set(key, look);
  });

  return from ?? look;
}
