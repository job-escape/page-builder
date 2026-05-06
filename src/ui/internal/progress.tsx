"use client";

import { Progress as HeroProgress } from "@heroui/react";
import * as React from "react";

import { cn } from "../../lib/cn";

const HeroProgressAny = HeroProgress as unknown as React.ComponentType<Record<string, unknown>>;

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
        classNames={{
          base: cn("h-4 w-full", className),
          track: "h-full bg-secondary",
          indicator: cn(
            "bg-brand",
            transitionDuration && "[transition-duration:var(--progress-duration)]",
            indicatorClassName,
          ),
        }}
        style={mergedStyle}
        {...(props as Record<string, unknown>)}
      />
    );
  },
);
Progress.displayName = "Progress";

export { Progress };
