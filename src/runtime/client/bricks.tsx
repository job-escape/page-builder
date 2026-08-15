/**
 * The bricks. Four of them, matching what a canvas node can be.
 *
 * Everything a designer composes bottoms out here: a Button, a Plan Card, an
 * Option are all Frames with properties, not components someone has to build.
 * `Frame` is therefore the most load-bearing type in the system and gets
 * public-API treatment — additive changes, tolerant readers.
 *
 * Styles are inline rather than class-based on purpose: a compiled funnel
 * carries its own values and must render identically wherever it is mounted,
 * with no stylesheet to ship, load, or collide with the host page.
 */
import type { CSSProperties, ReactNode } from "react";

export type FrameLayout = "none" | "row" | "column";
export type Align = "start" | "center" | "end" | "stretch";
export type Justify = "start" | "center" | "end" | "between";

const ALIGN: Record<Align, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
};

const JUSTIFY: Record<Justify, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
};

export type FrameProps = {
  layout?: FrameLayout;
  gap?: number;
  padding?: number | [number, number] | [number, number, number, number];
  width?: number | "fill" | "hug";
  height?: number | "fill" | "hug";
  align?: Align;
  justify?: Justify;
  fill?: string;
  border?: string;
  radius?: number;
  opacity?: number;
  shadow?: string;
  grow?: boolean;
  scroll?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  /** Set by the compiler from the declared semantics — drives role and keyboard. */
  role?: "button" | "radio" | "checkbox" | "group" | "radiogroup" | "dialog";
  ariaLabel?: string;
  ariaChecked?: boolean;
  testId?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

const size = (value: FrameProps["width"]): string | number | undefined => {
  if (value === undefined) return undefined;
  if (value === "fill") return "100%";
  if (value === "hug") return "auto";
  return value;
};

const pad = (value: FrameProps["padding"]): string | number | undefined => {
  if (value === undefined) return undefined;
  if (typeof value === "number") return value;
  return value.map((entry) => `${entry}px`).join(" ");
};

export function Frame({
  layout = "none",
  gap,
  padding,
  width,
  height,
  align,
  justify,
  fill,
  border,
  radius,
  opacity,
  shadow,
  grow,
  scroll,
  onClick,
  disabled,
  role,
  ariaLabel,
  ariaChecked,
  testId,
  style,
  children,
}: FrameProps) {
  const interactive = Boolean(onClick) && !disabled;

  const css: CSSProperties = {
    display: layout === "none" ? "block" : "flex",
    flexDirection: layout === "row" ? "row" : layout === "column" ? "column" : undefined,
    gap,
    padding: pad(padding),
    width: size(width),
    height: size(height),
    alignItems: align ? ALIGN[align] : undefined,
    justifyContent: justify ? JUSTIFY[justify] : undefined,
    background: fill,
    border,
    borderRadius: radius,
    opacity,
    boxShadow: shadow,
    flexGrow: grow ? 1 : undefined,
    overflowY: scroll ? "auto" : undefined,
    boxSizing: "border-box",
    cursor: interactive ? "pointer" : undefined,
    // A frame that takes clicks must also take keys; see the handler below.
    userSelect: interactive ? "none" : undefined,
    ...style,
  };

  return (
    <div
      style={css}
      onClick={interactive ? onClick : undefined}
      // Space and Enter on an interactive frame, because a div is not a button
      // and a keyboard user would otherwise have no way to choose an option.
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      role={role}
      tabIndex={interactive ? 0 : undefined}
      aria-label={ariaLabel}
      aria-checked={ariaChecked}
      aria-disabled={disabled || undefined}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

export type TextProps = {
  size?: number;
  weight?: number;
  color?: string;
  align?: "left" | "center" | "right";
  lineHeight?: number;
  style?: CSSProperties;
  children?: ReactNode;
};

export function Text({ size: fontSize, weight, color, align, lineHeight, style, children }: TextProps) {
  return (
    <span
      style={{
        fontSize,
        fontWeight: weight,
        color,
        textAlign: align,
        lineHeight: lineHeight ? `${lineHeight}px` : undefined,
        display: "block",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export type ImageProps = {
  src: string;
  alt?: string;
  width?: number | "fill";
  height?: number;
  radius?: number;
  fit?: "cover" | "contain";
  style?: CSSProperties;
};

export function Image({ src, alt = "", width, height, radius, fit = "cover", style }: ImageProps) {
  return (
    <img
      src={src}
      alt={alt}
      style={{
        width: size(width),
        height,
        borderRadius: radius,
        objectFit: fit,
        display: "block",
        ...style,
      }}
    />
  );
}

/** The catalogue a compiled module receives as `ui`. */
export const ui = { Frame, Text, Image };

export type Ui = typeof ui;
