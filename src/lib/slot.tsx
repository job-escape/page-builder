"use client";

import * as React from "react";

import { cn } from "./cn";

type UnknownProps = Record<string, unknown>;

function mergeRefs<T>(...refs: (React.Ref<T> | undefined)[]): React.RefCallback<T> {
  return (value) => {
    refs.forEach((ref) => {
      if (typeof ref === "function") {
        ref(value);
      } else if (ref && typeof ref === "object") {
        const mutable = ref as React.MutableRefObject<T | null>;
        mutable.current = value;
      }
    });
  };
}

export interface SlotProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode;
}

/**
 * Local replacement for @radix-ui/react-slot. Radix merge semantics: the
 * child's own props win on conflicts, except event handlers (composed
 * child-first, then slot), className (merged via cn) and style (slot first,
 * child wins per-property).
 */
export const Slot = React.forwardRef<HTMLElement, SlotProps>(
  ({ children, ...slotProps }, forwardedRef) => {
    if (!React.isValidElement(children)) {
      return null;
    }
    const child = children as React.ReactElement<UnknownProps>;
    const childProps = child.props;
    const slotPropsRecord = slotProps as UnknownProps;
    const merged: UnknownProps = { ...slotPropsRecord };

    Object.entries(childProps).forEach(([key, childValue]) => {
      if (key === "children" || childValue === undefined) {
        return;
      }
      const slotValue = slotPropsRecord[key];
      if (slotValue === undefined) {
        merged[key] = childValue;
      } else if (
        /^on[A-Z]/.test(key) &&
        typeof slotValue === "function" &&
        typeof childValue === "function"
      ) {
        merged[key] = (...args: unknown[]) => {
          (childValue as (...a: unknown[]) => void)(...args);
          (slotValue as (...a: unknown[]) => void)(...args);
        };
      } else if (key === "className") {
        merged.className = cn(slotValue as string, childValue as string);
      } else if (key === "style") {
        merged.style = {
          ...(slotValue as React.CSSProperties),
          ...(childValue as React.CSSProperties),
        };
      } else {
        merged[key] = childValue;
      }
    });

    const childRef = (childProps as { ref?: React.Ref<HTMLElement> }).ref;
    merged.ref = mergeRefs(forwardedRef, childRef);

    return React.cloneElement(child, merged);
  },
);
Slot.displayName = "Slot";
