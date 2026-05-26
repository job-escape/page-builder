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
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  (
    { className, value, max = 100, indicatorClassName, transitionDuration, style, ...props },
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
        className={cn("h-4 w-full", className)}
        style={mergedStyle}
        {...(props as Record<string, unknown>)}
      >
        <HeroProgressAny.Track className="h-full bg-secondary">
          <HeroProgressAny.Fill
            className={cn(
              "bg-brand",
              transitionDuration && "[transition-duration:var(--progress-duration)]",
              indicatorClassName,
            )}
          />
        </HeroProgressAny.Track>
      </HeroProgressAny>
    );
  },
);
Progress.displayName = "Progress";

export { Progress };
