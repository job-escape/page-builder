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
        transform: `translateX(-${100 - (value || 0)}%)`,
        ...(transitionDuration ? { transitionDuration } : {}),
        ...indicatorStyle,
      }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
