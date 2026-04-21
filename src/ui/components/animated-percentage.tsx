"use client";

import { useEffect, useRef } from "react";

import { ComponentRegistryProps } from "../../types";

const getNumberAttr = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export default function AnimatedPercentageRegistry({ domNode }: ComponentRegistryProps) {
  const attribs = domNode?.attribs ?? {};

  const start  = getNumberAttr(attribs["percentage-animation-start"],  0);
  const finish = getNumberAttr(attribs["percentage-animation-finish"], 100);
  const speed  = getNumberAttr(attribs["percentage-animation-speed"],  2000);

  const spanRef = useRef<HTMLSpanElement>(null);
  const rafRef  = useRef<number | null>(null);

  useEffect(() => {
    const el = spanRef.current;
    if (!el) return;

    // Cancel any in-flight animation before starting a new one
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    // Local closure variable — completely isolated per effect run,
    // no ref mutation that could bleed across restarts
    let startTime: number | null = null;

    const frame = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;

      const elapsed  = timestamp - startTime;
      const progress = Math.min(elapsed / speed, 1);
      el.textContent = `${Math.round(start + progress * (finish - start))}%`;
      const eased = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      // Direct DOM write — zero React re-renders, zero interference
      el.textContent = `${Math.round(start + eased * (finish - start))}%`;

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [start, finish, speed]);

  return <span ref={spanRef}>{start}%</span>;
}
