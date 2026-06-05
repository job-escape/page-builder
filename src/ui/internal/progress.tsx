"use client";

import { ProgressBar as HeroProgress } from "@heroui/react";
import * as React from "react";

import { cn } from "../../lib/cn";

type HeroProgressType = React.ComponentType<Record<string, unknown>> & {
  Track: React.ComponentType<Record<string, unknown>>;
  Fill: React.ComponentType<Record<string, unknown>>;
};

const HeroProgressAny = HeroProgress as unknown as HeroProgressType;

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number | null;
  max?: number;
  indicatorClassName?: string;
  transitionDuration?: string;
  /** Bar height in px. Defaults to 16 to match the shadcn `h-4` original. */
  barHeight?: number;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  (
    {
      className,
      value,
      max = 100,
      indicatorClassName,
      transitionDuration,
      barHeight = 16,
      style,
      ...props
    },
    ref,
  ) => {
    const mergedStyle: React.CSSProperties = {
      ...style,
      ...(transitionDuration
        ? ({ "--progress-duration": transitionDuration } as React.CSSProperties)
        : {}),
    };
    return (
      <HeroProgressAny
        ref={ref}
        value={value ?? 0}
        maxValue={max}
        aria-label="progress"
        className={cn("w-full", className)}
        style={mergedStyle}
        {...(props as Record<string, unknown>)}
      >
        {/*
          The track height/shape is set via INLINE STYLES rather than utility
          classes on purpose. This package's Tailwind classes are not compiled by
          the consuming app (its `dist` is not in the consumer's Tailwind sources),
          so any utility override would be purged and HeroUI's own shipped CSS
          (".progress-bar__track { height: 0.5rem }") would win — rendering an ~8px
          bar. Inline styles always apply and out-rank shipped CSS, so the shadcn
          sizing (default 16px tall, full pill) holds regardless of consumer setup.
        */}
        <HeroProgressAny.Track
          className={cn("relative w-full overflow-hidden bg-secondary")}
          style={{ height: barHeight, borderRadius: 9999 }}
        >
          <HeroProgressAny.Fill
            className={cn(
              "h-full bg-brand",
              transitionDuration && "[transition-duration:var(--progress-duration)]",
              indicatorClassName,
            )}
            style={{ borderRadius: 9999 }}
          />
        </HeroProgressAny.Track>
      </HeroProgressAny>
    );
  },
);
Progress.displayName = "Progress";

export { Progress };
