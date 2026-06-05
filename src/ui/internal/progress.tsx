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
        className="w-full"
        style={mergedStyle}
        {...(props as Record<string, unknown>)}
      >
        {/*
          HeroUI's ".progress-bar .progress-bar__track" rule applies "h-2" via a
          descendant selector, which out-specifies plain utility classes. We force
          the shadcn sizing convention (default h-4, full pill) on the track with
          "!" utilities so the height/shape actually win. The consumer's className
          (e.g. a variant height) is forwarded here and overrides the default.
        */}
        <HeroProgressAny.Track
          className={cn(
            "relative w-full overflow-hidden !h-4 !rounded-full bg-secondary",
            className,
          )}
        >
          <HeroProgressAny.Fill
            className={cn(
              "h-full !rounded-full bg-brand",
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
