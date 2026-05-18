"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

const getLogic  = (raw: string) => tryParse<LogicValue>(raw)      || [];
const getStates = (raw: string) => tryParse<NodeStatesValue>(raw) || [];

const VARIANT_HEIGHT: Record<string, string> = {
  slim:    "h-1.5",
  thick:   "h-4",
  default: "h-3",
};

export default function LoaderRegistry({ domNode }: ComponentRegistryProps) {
  const attribs    = domNode?.attribs ?? {};
  const model      = useBuilderModel();
  const localModel = useLocalModel();
  const { createInteraction } = useInteraction();

  const triggerRef   = useRef<((trigger: string, logicValue: LogicValue) => Promise<void>) | null>(null);
  const stoppedRef   = useRef<boolean>(false);
  const startTimeRef = useRef<number>(0);
  const halfFiredRef = useRef<boolean>(false);
  const fullFiredRef = useRef<boolean>(false);

  const speed   = Math.max(0, getNumberAttr(attribs.speed   ?? attribs["data-lexical-loader-speed"],   2000));
  const variant = attribs.variant ?? attribs["data-lexical-loader-variant"] ?? "default";

  const logicRaw  = attribs.logic  ?? attribs["data-lexical-loader-logic"]  ?? "";
  const statesRaw = attribs.states ?? attribs["data-lexical-loader-states"] ?? "";
  const logic  = useMemo(() => getLogic(logicRaw),   [logicRaw]);
  const states = useMemo(() => getStates(statesRaw), [statesRaw]);

  const activeState = useActiveState(states, model.$answers, localModel.$localStates);

  triggerRef.current = createInteraction().handleTrigger;
  stoppedRef.current = activeState === "stopped";

  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const runTrigger = (trigger: "half_load" | "full_load") => {
      triggerRef.current?.(trigger, logic).catch(() => undefined);
    };

    halfFiredRef.current = false;
    fullFiredRef.current = false;
    startTimeRef.current = performance.now();
    setDisplayValue(0);

    let rafId = 0;
    let elapsedAtPause = 0;

    const tick = () => {
      if (stoppedRef.current) {
        // Keep the start time anchored to "now" while paused so the
        // animation resumes from where it left off instead of jumping.
        startTimeRef.current = performance.now() - elapsedAtPause;
        rafId = requestAnimationFrame(tick);
        return;
      }

      const elapsed = performance.now() - startTimeRef.current;
      elapsedAtPause = elapsed;
      const progress = speed === 0 ? 1 : Math.min(elapsed / speed, 1);
      const value = 100 * progress;

      setDisplayValue(value);

      if (!halfFiredRef.current && value >= 50) {
        halfFiredRef.current = true;
        runTrigger("half_load");
      }

      if (progress >= 1) {
        setDisplayValue(100);
        if (!fullFiredRef.current) {
          fullFiredRef.current = true;
          runTrigger("full_load");
        }
        return;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [logic, speed]);

  if (activeState === "hidden") return null;

  return (
    <div className="relative w-full" data-variant={variant}>
      <Progress
        value={displayValue}
        className={cn("w-full", VARIANT_HEIGHT[variant] ?? VARIANT_HEIGHT.default)}
        indicatorClassName="transition-none"
      />
    </div>
  );
}
