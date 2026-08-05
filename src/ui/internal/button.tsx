"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";

import * as React from "react";

import { cn } from "../../lib/cn";
import { Slot, type SlotProps } from "../../lib/slot";

const AriaButtonAny = AriaButton as unknown as React.ComponentType<Record<string, unknown>>;

const buttonVariants = cva(
  "inline-flex items-center justify-center cursor-pointer gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-brand text-brand-foreground shadow-xs hover:[background:linear-gradient(0deg,var(--alpha-90,rgba(255,255,255,0.10))0%,var(--alpha-90,rgba(255,255,255,0.10))100%),var(--brand,#1D4ED8)] disabled:opacity-50",
        old: "bg-brand text-brand-foreground bg-brand hover:bg-[#2563EB]/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent text-foreground hover:text-accent-foreground",
        empty: "underline",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-brand underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3",
        lg: "h-11 rounded-lg px-8",
        icon: "h-10 w-10",
      },
      state: {
        loading: "opacity-50",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, children, loading, disabled, ...props }, ref) => {
    const classes = cn(
      buttonVariants({ variant, size, state: loading ? "loading" : null, className }),
    );
    const isDisabled = Boolean(loading || disabled);

    if (asChild) {
      return (
        <Slot
          ref={ref as unknown as React.Ref<HTMLElement>}
          className={classes}
          {...({ disabled: isDisabled || undefined, ...props } as SlotProps)}
        >
          {children}
        </Slot>
      );
    }

    return (
      <AriaButtonAny
        ref={ref}
        className={classes}
        // react-aria ignores the native `disabled` prop — only isDisabled
        // blocks interaction; without it a loading button stays clickable. It
        // still renders the native attribute, so disabled:* classes keep working.
        isDisabled={isDisabled}
        {...(props as Record<string, unknown>)}
      >
        {loading && <LoaderCircle className="animate-spin" />}
        {children}
      </AriaButtonAny>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
