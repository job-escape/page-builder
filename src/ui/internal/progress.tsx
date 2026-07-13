"use client";

import * as ProgressPrimitive from "@radix-ui/react-progress";
import * as React from "react";
import { twMerge } from "tailwind-merge";

import { cn } from "../../lib/cn";

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
    indicatorClassName?: string;
    indicatorStyle?: React.CSSProperties;
    transitionDuration?: string;
  }
>(({ className, value, indicatorClassName, indicatorStyle, transitionDuration, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn("relative h-4 w-full overflow-hidden rounded-full bg-secondary", className)}
    {...props}
  >
    <ProgressPrimitive.Indicator
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
  </ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
