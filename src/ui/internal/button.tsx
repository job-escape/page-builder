import { Button as HeroButton } from "@heroui/react";
import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";

import * as React from "react";

import { cn } from "../../lib/cn";

const HeroButtonAny = HeroButton as unknown as React.ComponentType<Record<string, unknown>>;

function mergeRefs<T>(
  ...refs: Array<React.Ref<T> | undefined>
): React.RefCallback<T> {
  return (value) => {
    refs.forEach((ref) => {
      if (typeof ref === "function") {
        ref(value);
      } else if (ref && typeof ref === "object") {
        (ref as React.MutableRefObject<T | null>).current = value;
      }
    });
  };
}

interface SlotProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode;
  disabled?: boolean;
}

const Slot = React.forwardRef<HTMLElement, SlotProps>(
  ({ children, ...slotProps }, forwardedRef) => {
    if (!React.isValidElement(children)) {
      return null;
    }
    const child = children as React.ReactElement<Record<string, unknown>>;
    const childRef = (child as unknown as { ref?: React.Ref<unknown> }).ref;
    const childProps = child.props as Record<string, unknown>;
    return React.cloneElement(child, {
      ...slotProps,
      ...childProps,
      className: cn(
        slotProps.className as string | undefined,
        childProps.className as string | undefined,
      ),
      style: {
        ...(slotProps.style as React.CSSProperties | undefined),
        ...(childProps.style as React.CSSProperties | undefined),
      },
      ref: mergeRefs(forwardedRef as React.Ref<unknown>, childRef),
    } as Record<string, unknown>);
  },
);
Slot.displayName = "Slot";

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
    const merged = cn(
      buttonVariants({ variant, size, state: loading ? "loading" : null, className }),
    );

    if (asChild) {
      return (
        <Slot
          className={merged}
          ref={ref as React.Ref<HTMLElement>}
          {...props}
          disabled={loading || disabled}
        >
          {children}
        </Slot>
      );
    }

    return (
      <HeroButtonAny
        ref={ref}
        className={merged}
        isDisabled={loading || disabled}
        {...(props as Record<string, unknown>)}
      >
        {loading && <LoaderCircle className="animate-spin" />}
        {children}
      </HeroButtonAny>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
