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
  return Number.isNaN(parsed) ? fallback : parsed;
};

const getLogic  = (raw: string) => tryParse<LogicValue>(raw)      || [];
const getStates = (raw: string) => tryParse<NodeStatesValue>(raw) || [];

// Height in px (applied inline by <Progress>) — matches shadcn h-1.5 / h-3 / h-4.
const VARIANT_HEIGHT: Record<string, number> = {
  slim:    6,
  thick:   16,
  default: 12,
};

export default function LoaderRegistry({ domNode }: ComponentRegistryProps) {
  const attribs    = domNode?.attribs ?? {};
  const model      = useBuilderModel();
  const localModel = useLocalModel();
  const { createInteraction } = useInteraction();  

  const triggerRef    = useRef<((trigger: string, logicValue: LogicValue) => Promise<void>) | null>(null);
  const halfTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fullTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef  = useRef<number>(0);
  const frozenAtRef   = useRef<number>(0);
  const halfFiredRef  = useRef<boolean>(false);
  const hasStartedRef = useRef<boolean>(false);

  const speed   = Math.max(0, getNumberAttr(attribs.speed   ?? attribs["data-lexical-loader-speed"],   2000));
  const variant = attribs.variant ?? attribs["data-lexical-loader-variant"] ?? "default";

  const logicRaw  = attribs.logic  ?? attribs["data-lexical-loader-logic"]  ?? "";
  const statesRaw = attribs.states ?? attribs["data-lexical-loader-states"] ?? "";
  const logic  = useMemo(() => getLogic(logicRaw),   [logicRaw]);
  const states = useMemo(() => getStates(statesRaw), [statesRaw]);

  const activeState = useActiveState(states, model.$answers, localModel.$localStates);
  const isStopped   = activeState === "stopped";

  triggerRef.current = createInteraction().handleTrigger;

  const [cssReady,           setCssReady]           = useState(false);
  const [targetValue,        setTargetValue]        = useState(0);
  const [transitionDuration, setTransitionDuration] = useState(speed);

  const clearTimers = () => {
    if (halfTimerRef.current !== null) { clearTimeout(halfTimerRef.current); halfTimerRef.current = null; }
    if (fullTimerRef.current !== null) { clearTimeout(fullTimerRef.current); fullTimerRef.current = null; }
  };

  const scheduleTimers = (fromValue: number, duration: number) => {
    clearTimers();

    if (!halfFiredRef.current) {
      const halfDelay = duration * ((50 - fromValue) / (100 - fromValue));
      halfTimerRef.current = setTimeout(() => {
        halfFiredRef.current = true;
        triggerRef.current?.("half_load", logic).catch(() => undefined);
      }, halfDelay);
    }

    fullTimerRef.current = setTimeout(() => {
      triggerRef.current?.("full_load", logic).catch(() => undefined);
    }, duration);
  };

  useEffect(() => {
    frozenAtRef.current   = 0;
    halfFiredRef.current  = false;
    hasStartedRef.current = false;

    setCssReady(false);
    setTargetValue(0);
    setTransitionDuration(speed);

    const rafId = requestAnimationFrame(() => {
      hasStartedRef.current = true;
      startTimeRef.current  = performance.now();

      setCssReady(true);
      setTargetValue(100);
      setTransitionDuration(speed);
      scheduleTimers(0, speed);
    });

    return () => {
      cancelAnimationFrame(rafId);
      clearTimers();
    };
  }, [logic, speed]);

  useEffect(() => {
    if (!hasStartedRef.current) return;

    if (isStopped) {
      clearTimers();

      const elapsed = performance.now() - startTimeRef.current;
      const frozen  = Math.min(
        Math.round((elapsed / transitionDuration) * (100 - frozenAtRef.current) + frozenAtRef.current),
        100,
      );
      frozenAtRef.current = frozen;
      setTargetValue(frozen);

    } else {
      const remaining = speed * ((100 - frozenAtRef.current) / 100);
      startTimeRef.current = performance.now() - (frozenAtRef.current / 100 * speed);

      setTransitionDuration(remaining);
      setTargetValue(100);
      scheduleTimers(frozenAtRef.current, remaining);
    }
  }, [isStopped]);

  if (activeState === "hidden") return null;

  return (
    <div className="relative w-full" data-variant={variant}>
      <Progress
        value={targetValue}
        className="w-full"
        barHeight={VARIANT_HEIGHT[variant] ?? VARIANT_HEIGHT.default}
        indicatorClassName={cssReady ? "transition-transform ease-linear" : "transition-none"}
        transitionDuration={cssReady ? `${transitionDuration}ms` : undefined}
      />
    </div>
  );
}
