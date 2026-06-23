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

const getNumberAttr = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return parsed;
};

const getLogic = (raw: string) => {
  return tryParse<LogicValue>(raw) || [];
};

const getStates = (raw: string) => {
  return tryParse<NodeStatesValue>(raw) || [];
};

export default function LoaderRegistry({ domNode }: ComponentRegistryProps) {
  const attribs = domNode?.attribs ?? {};
  const model = useBuilderModel();
  const localModel = useLocalModel();
  const { createInteraction } = useInteraction();
  const triggerRef = useRef<((trigger: string, logicValue: LogicValue, context?: Record<string, unknown>) => Promise<void>) | null>(
    null,
  );
  const stoppedRef = useRef(false);

  const percentage = Math.min(
    100,
    Math.max(0, getNumberAttr(attribs.percentage ?? attribs["data-lexical-loader-percentage"], 0)),
  );
  const visualTarget = 100;
  const speed = Math.max(
    0,
    getNumberAttr(attribs.speed ?? attribs["data-lexical-loader-speed"], 2000),
  );
  const logicRaw = attribs.logic ?? attribs["data-lexical-loader-logic"] ?? "";
  const statesRaw = attribs.states ?? attribs["data-lexical-loader-states"] ?? "";
  const logic = useMemo(() => getLogic(logicRaw), [logicRaw]);
  const states = useMemo(() => getStates(statesRaw), [statesRaw]);
  const activeState = useActiveState(states, model.$answers, localModel.$localStates, model.$subscriptionFacts);

  const [cssReady, setCssReady] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const halfTriggeredRef = useRef(false);
  const fullTriggeredRef = useRef(false);
  const lastIntRef = useRef(-1);

  triggerRef.current = createInteraction().handleTrigger;
  stoppedRef.current = activeState === "stopped";

  useEffect(() => {
    const runTrigger = (trigger: "half_load" | "full_load" | "progress_iterate", context?: Record<string, unknown>) => {
      triggerRef.current?.(trigger, logic, context).catch(() => undefined);
    };

    halfTriggeredRef.current = false;
    fullTriggeredRef.current = false;
    lastIntRef.current = -1;
    setCssReady(false);

    requestAnimationFrame(() => {
      startTimeRef.current = performance.now();
      setCssReady(true);
    });

    const TICK_MS = 30;
    timerRef.current = setInterval(() => {
      if (stoppedRef.current) return;

      const elapsed = performance.now() - startTimeRef.current;
      const progress = speed === 0 ? 1 : Math.min(elapsed / speed, 1);
      const value = Math.trunc(visualTarget * progress);

      if (value !== lastIntRef.current) {
        lastIntRef.current = value;

        if (!halfTriggeredRef.current && value >= 50) {
          halfTriggeredRef.current = true;
          runTrigger("half_load");
        }

        if (progress < 1) {
          runTrigger("progress_iterate", { loader_value: value });
        }
      }

      if (progress >= 1) {
        if (!fullTriggeredRef.current) {
          fullTriggeredRef.current = true;
          runTrigger("full_load");
        }
        if (timerRef.current !== null) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }
    }, TICK_MS);

    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [logic, percentage, speed, visualTarget]);

  if (activeState === "hidden") {
    return null;
  }

  return (
    <Progress
      indicatorClassName={cssReady ? "transition-transform ease-linear" : "transition-none"}
      transitionDuration={cssReady ? `${speed}ms` : undefined}
      value={cssReady ? visualTarget : 0}
    />
  );
}
