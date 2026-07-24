"use client";

import { AnimationEvent, CSSProperties, useMemo } from "react";

import { NodeStatesValue } from "../../types";
import { useActiveState } from "../../hooks/use-active-state";
import { useBuilderModel } from "../../hooks/use-builder-model";
import { useInteraction } from "../../hooks/use-interaction";
import { useLocalModel } from "../../hooks/use-local-model";
import { ComponentRegistryProps, LogicValue } from "../../types";
import { tryParse } from "../../utils/try-parse";

import { Progress } from "../internal/progress";
import { cn } from "../../lib/cn";

const getNumberAttr = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const getLogic = (raw: string) => tryParse<LogicValue>(raw) || [];
const getStates = (raw: string) => tryParse<NodeStatesValue>(raw) || [];

const VARIANT_HEIGHT: Record<string, string> = {
  slim: "h-1.5",
  thick: "h-4",
  default: "h-3",
};

// ─── The loader is now entirely CSS ───────────────────────────────────────────
//
// Previously the sweep was driven by requestAnimationFrame + setTimeout +
// React state, and the half/full triggers were scheduled from inside the rAF
// callback. rAF does not run while the page isn't painting (backgrounded tab,
// screen dimmed, mid-gesture on iOS Safari), so the timers were never scheduled
// and the loader sat frozen at 0% with no dialog until the page repainted —
// ~1 minute of nothing, then a lurch forward. That was the "stuck before the
// loader" freeze.
//
// Now the browser owns the timeline:
//   * width is animated by a keyframe, so it can't depend on a JS callback
//     arriving to start;
//   * `stopped` is `animation-play-state: paused`, which freezes the bar exactly
//     where it is and resumes from there — no elapsed/frozen-at arithmetic;
//   * `half_load` / `full_load` are `animationend` events, not timers. The half
//     trigger is a zero-size element running the same sweep at half the duration.
//
// Two identically-shaped keyframes (…-fill / …-half) exist purely so one
// bubbled `animationend` handler can tell which finished, via `animationName`.
const FILL_ANIMATION = "pb-loader-fill";
const HALF_ANIMATION = "pb-loader-half";

const LOADER_CSS = `
@keyframes ${FILL_ANIMATION} { from { width: 0%; } to { width: 100%; } }
@keyframes ${HALF_ANIMATION} { from { width: 0%; } to { width: 100%; } }
.pb-loader-fill {
  animation: ${FILL_ANIMATION} var(--pb-loader-duration, 2000ms) linear forwards;
}
.pb-loader-half {
  position: absolute;
  top: 0;
  left: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
  animation: ${HALF_ANIMATION} var(--pb-loader-half-duration, 1000ms) linear forwards;
}
`;

export default function LightLoaderRegistry({ domNode }: ComponentRegistryProps) {
  const attribs = domNode?.attribs ?? {};
  const model = useBuilderModel();
  const localModel = useLocalModel();
  const { createInteraction } = useInteraction();

  const speed = Math.max(0, getNumberAttr(attribs.speed ?? attribs["data-lexical-loader-speed"], 2000));
  const variant = attribs.variant ?? attribs["data-lexical-loader-variant"] ?? "default";
  const color = attribs.color ?? attribs["data-lexical-loader-color"] ?? undefined;

  const logicRaw = attribs.logic ?? attribs["data-lexical-loader-logic"] ?? "";
  const statesRaw = attribs.states ?? attribs["data-lexical-loader-states"] ?? "";
  const logic = useMemo(() => getLogic(logicRaw), [logicRaw]);
  const states = useMemo(() => getStates(statesRaw), [statesRaw]);

  const activeState = useActiveState(states, model.$answers, localModel.$localStates, model.$subscriptionFacts);
  const isStopped = activeState === "stopped";

  // Restarts the sweep (and therefore re-arms both triggers) if the loader is
  // reconfigured, matching the old effect that reset on [logic, speed].
  const animationKey = `${logicRaw}|${speed}`;

  // Each animation runs once, so `animationend` fires once per run — no
  // already-fired bookkeeping needed. (Guarding with refs would actively break
  // the hidden→visible case: the elements remount and the sweep restarts, but
  // refs survive because the component stays mounted rendering null.)
  //
  // `animationend` bubbles, so one handler on the wrapper covers both bars and
  // `animationName` says which finished. The interaction is built at fire time,
  // as `button.tsx` does, rather than on every render.
  const handleAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    const trigger =
      event.animationName === HALF_ANIMATION
        ? "half_load"
        : event.animationName === FILL_ANIMATION
          ? "full_load"
          : null;
    if (!trigger) return;

    const { handleTrigger } = createInteraction();
    handleTrigger(trigger, logic).catch(() => undefined);
  };

  if (activeState === "hidden") return null;

  const playState = isStopped ? "paused" : "running";

  return (
    <div className="relative w-full" data-variant={variant} onAnimationEnd={handleAnimationEnd}>
      <style>{LOADER_CSS}</style>
      <Progress
        key={animationKey}
        value={0}
        className={cn("w-full", VARIANT_HEIGHT[variant] ?? VARIANT_HEIGHT.default)}
        indicatorClassName="pb-loader-fill"
        indicatorStyle={
          {
            "--pb-loader-duration": `${speed}ms`,
            animationPlayState: playState,
            ...(color ? { backgroundColor: color } : {}),
          } as CSSProperties
        }
      />
      <span
        key={`${animationKey}|half`}
        aria-hidden
        className="pb-loader-half"
        style={
          {
            "--pb-loader-half-duration": `${speed / 2}ms`,
            animationPlayState: playState,
          } as CSSProperties
        }
      />
    </div>
  );
}
