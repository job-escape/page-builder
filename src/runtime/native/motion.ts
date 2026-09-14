/**
 * A frame's motion, as React Native plays it — the other half of
 * `client/motion-css`, from the same definitions in `runtime/motion`.
 *
 * **The JavaScript driver throughout.** A width cannot move on the native
 * driver, and one view animating some props on each driver is a crash React
 * Native reports only at runtime. The frames here are a bar, a spinner, a
 * heading: well inside what the JS thread draws at sixty.
 */
import { useEffect, useRef, useState } from "react";
import { Animated, Easing } from "react-native";

import { CURVES, MOTION_PRESETS, carriedLooks, motionOf, transitionOf, type MotionPreset } from "../motion";
import { isPercent } from "../style/values";

type NativeStyle = Record<string, unknown>;

const curveOf = (easing: string): ((value: number) => number) => {
  if (easing === "linear") return Easing.linear;
  const curve = CURVES[easing as keyof typeof CURVES];
  return curve ? Easing.bezier(curve[0], curve[1], curve[2], curve[3]) : Easing.out(Easing.quad);
};

/** The props a transition glides, as numbers — a percent is its number, drawn back as a percent. */
const GLIDED = ["width", "height", "opacity"] as const;
type Glided = (typeof GLIDED)[number];

const numeric = (value: unknown): { number: number; percent: boolean } | null => {
  if (typeof value === "number" && Number.isFinite(value)) return { number: value, percent: false };
  if (isPercent(value)) return { number: Number.parseFloat(value), percent: true };
  return null;
};

/**
 * One value, tweened towards `target` whenever it changes.
 *
 * Starts at `start` — the look a `motionKey` carried from the previous screen —
 * or at the target, which is no motion at all.
 */
function useTween(
  target: { number: number; percent: boolean } | null,
  transition: ReturnType<typeof transitionOf>,
  start: { number: number; percent: boolean } | null,
): Animated.Value | Animated.AnimatedInterpolation<string | number> | null {
  const value = useRef<Animated.Value | null>(null);
  if (!value.current) value.current = new Animated.Value((start ?? target)?.number ?? 0);

  useEffect(() => {
    if (!target || !value.current) return undefined;
    if (!transition) {
      value.current.setValue(target.number);
      return undefined;
    }
    const animation = Animated.timing(value.current, {
      toValue: target.number,
      duration: transition.duration,
      delay: transition.delay,
      easing: curveOf(transition.easing),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [target?.number, target?.percent, transition?.duration, transition?.delay, transition?.easing]);

  if (!target) return null;
  if (!target.percent) return value.current;
  return value.current.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
    extrapolate: "clamp",
  });
}

/** A preset, looping on one 0 → 1 value and read through its stops. */
function presetStyle(preset: MotionPreset, progress: Animated.Value): NativeStyle {
  const { stops } = MOTION_PRESETS[preset];
  const inputRange = stops.map((stop) => stop.at);
  const channel = <K extends "opacity" | "translateY" | "scale" | "rotate">(name: K) => {
    if (!stops.some((stop) => stop[name] !== undefined)) return null;
    const outputRange = stops.map((stop) => stop[name] ?? (name === "scale" || name === "opacity" ? 1 : 0));
    return progress.interpolate({
      inputRange,
      outputRange: name === "rotate" ? outputRange.map((degrees) => `${degrees}deg`) : outputRange,
    });
  };
  const style: NativeStyle = {};
  const opacity = channel("opacity");
  if (opacity) style.opacity = opacity;
  const transform: NativeStyle[] = [];
  const translateY = channel("translateY");
  if (translateY) transform.push({ translateY });
  const scale = channel("scale");
  if (scale) transform.push({ scale });
  const rotate = channel("rotate");
  if (rotate) transform.push({ rotate });
  if (transform.length) style.transform = transform;
  return style;
}

/**
 * Everything a brick needs to move: whether to draw an `Animated` view at all,
 * and the style to lay over its own.
 *
 * `animated` is false for every brick that declares no motion, so a funnel with
 * none renders exactly the plain views it always did.
 */
export function useNativeMotion(options: {
  style: NativeStyle;
  transition: unknown;
  motion: unknown;
  motionKey: unknown;
}): { animated: boolean; style: NativeStyle } {
  const transition = transitionOf(options.transition);
  const motion = motionOf(options.motion);
  const key = typeof options.motionKey === "string" && options.motionKey ? options.motionKey : null;

  // What this key looked like on the screen before — read once, on mount.
  const [carried] = useState(() => (key && transition ? (carriedLooks.get(key) ?? null) : null));

  const tweens: Partial<Record<Glided, ReturnType<typeof useTween>>> = {};
  GLIDED.forEach((name) => {
    // A fixed list, so the hooks are called in the same order on every render.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    tweens[name] = useTween(numeric(options.style[name]), transition, carried ? numeric(carried[name]) : null);
  });

  useEffect(() => {
    if (!key) return;
    const look: Record<string, unknown> = {};
    GLIDED.forEach((name) => {
      look[name] = options.style[name];
    });
    carriedLooks.set(key, look);
  });

  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!motion) return undefined;
    progress.setValue(0);
    const cycle = Animated.timing(progress, {
      toValue: 1,
      duration: motion.duration,
      easing: curveOf(motion.spec.easing),
      useNativeDriver: false,
    });
    // Once is the cycle itself, and it ends on its last stop — an entrance
    // stays entered, as CSS `animation-fill-mode: both` keeps it on the web.
    const played =
      motion.repeat === "infinite"
        ? Animated.loop(cycle, { resetBeforeIteration: true })
        : motion.repeat === 1
          ? cycle
          : Animated.loop(cycle, { iterations: motion.repeat, resetBeforeIteration: true });
    const sequence = motion.delay ? Animated.sequence([Animated.delay(motion.delay), played]) : played;
    sequence.start();
    return () => sequence.stop();
  }, [motion?.preset, motion?.duration, motion?.delay, motion?.repeat, progress]);

  const animated = Boolean(transition || motion);
  if (!animated) return { animated: false, style: {} };

  const style: NativeStyle = {};
  if (transition) {
    GLIDED.forEach((name) => {
      if (tweens[name]) style[name] = tweens[name];
    });
  }
  if (motion) {
    const moving = presetStyle(motion.preset, progress);
    Object.assign(style, moving);
  }
  return { animated, style };
}
