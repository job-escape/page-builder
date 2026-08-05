"use client";

import { ProgressBar as AriaProgressBar } from "react-aria-components";
import { twMerge } from "tailwind-merge";

import * as React from "react";

import { cn } from "../../lib/cn";

const AriaProgressBarAny = AriaProgressBar as unknown as React.ComponentType<
  Record<string, unknown>
>;

interface ProgressProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "defaultValue"> {
  value?: number | null;
  max?: number;
  indicatorClassName?: string;
  indicatorStyle?: React.CSSProperties;
  transitionDuration?: string;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  (
    { className, value, max, indicatorClassName, indicatorStyle, transitionDuration, ...props },
    ref,
  ) => (
    <AriaProgressBarAny
      ref={ref}
      value={value ?? 0}
      maxValue={max ?? 100}
      className={cn("relative h-4 w-full overflow-hidden rounded-full bg-secondary", className)}
      {...(props as Record<string, unknown>)}
    >
      <div
        className={twMerge("h-full w-full flex-1 bg-brand transition-all", indicatorClassName)}
        style={{
          // Fill by width (anchored to the inline-start) rather than translateX, so
          // the bar follows text direction: LTR fills from the left, RTL from the
          // right. translateX is physical and ignores `dir`. Inline width overrides
          // the `w-full` class.
          width: `${value || 0}%`,
          // Width is the animated property now, so width is what must transition.
          // Callers that sweep the bar hand us the FINAL value plus a duration and
          // let CSS do the animation; a leftover `transition-transform` class from
          // the old translateX fill would transition nothing, snapping the bar
          // straight to `value`. Pin the property inline so it beats that class.
          ...(transitionDuration ? { transitionProperty: "width", transitionDuration } : {}),
          ...indicatorStyle,
        }}
      />
    </AriaProgressBarAny>
  ),
);
Progress.displayName = "Progress";

export { Progress };
