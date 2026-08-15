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
import { createElement, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

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

/**
 * What makes any brick clickable, in one place.
 *
 * Shared by `Frame` and `Text` rather than written twice: neither is a
 * `<button>`, so both need the keyboard handler and the roles spelled out, and
 * two copies of that is two chances for one of them to lose a click. `Text`
 * had no copy at all, and its `onClick` went nowhere.
 */
function interactionProps({
  onClick,
  disabled,
  role,
  ariaLabel,
  ariaChecked,
  testId,
}: {
  onClick?: () => void;
  disabled?: boolean;
  role?: FrameProps["role"];
  ariaLabel?: string;
  ariaChecked?: boolean;
  testId?: string;
}) {
  const interactive = Boolean(onClick) && !disabled;

  return {
    onClick: interactive ? onClick : undefined,
    // Space and Enter, because a div and a span are not buttons and a keyboard
    // user would otherwise have no way to choose an option.
    onKeyDown: interactive
      ? (event: KeyboardEvent<HTMLElement>) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClick?.();
          }
        }
      : undefined,
    role,
    tabIndex: interactive ? 0 : undefined,
    "aria-label": ariaLabel,
    "aria-checked": ariaChecked,
    "aria-disabled": disabled || undefined,
    "data-testid": testId,
  };
}

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
      {...interactionProps({ onClick, disabled, role, ariaLabel, ariaChecked, testId })}
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
  /**
   * Text takes clicks, because designers attach navigation to words.
   *
   * It did not, and the prop was simply dropped on the floor: the compiler
   * emitted `onClick` for a text frame with an interaction, this component
   * destructured a fixed list that did not include it, and the funnel rendered
   * a line of copy that did nothing. Nothing failed anywhere — the click just
   * had no handler. `Frame`'s interactive behaviour, shared rather than copied.
   */
  onClick?: () => void;
  disabled?: boolean;
  role?: "button" | "radio" | "checkbox" | "group" | "radiogroup" | "dialog";
  ariaLabel?: string;
  ariaChecked?: boolean;
  testId?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

export function Text({
  size: fontSize,
  weight,
  color,
  align,
  lineHeight,
  onClick,
  disabled,
  role,
  ariaLabel,
  ariaChecked,
  testId,
  style,
  children,
}: TextProps) {
  const interactive = Boolean(onClick) && !disabled;

  return (
    <span
      style={{
        fontSize,
        fontWeight: weight,
        color,
        textAlign: align,
        lineHeight: lineHeight ? `${lineHeight}px` : undefined,
        display: "block",
        cursor: interactive ? "pointer" : undefined,
        userSelect: interactive ? "none" : undefined,
        ...style,
      }}
      {...interactionProps({ onClick, disabled, role, ariaLabel, ariaChecked, testId })}
    >
      {children}
    </span>
  );
}

export type InputProps = {
  /** The declared variable this field reads from and writes to. */
  value?: string;
  onValue?: (next: string) => void;
  placeholder?: string;
  /**
   * Chooses the keyboard on a phone as much as the validation — `email` gets an
   * @ key, `tel` gets a number pad. A funnel is used with a thumb.
   */
  type?: "text" | "email" | "tel" | "number";
  invalid?: boolean;
  size?: number;
  color?: string;
  fill?: string;
  border?: string;
  radius?: number;
  padding?: number | [number, number] | [number, number, number, number];
  width?: number | "fill" | "hug";
  height?: number;
  ariaLabel?: string;
  testId?: string;
  style?: CSSProperties;
};

/**
 * A field a visitor types into.
 *
 * Controlled by the funnel's own state rather than by the DOM: the answer has
 * to survive navigating away and back, and a value the browser owns does not.
 * `onValue` writes straight to the declared variable, so a condition can read
 * what was typed the moment it is typed.
 */
export function Input({
  value = "",
  onValue,
  placeholder,
  type = "text",
  invalid,
  size: fontSize,
  color,
  fill,
  border,
  radius,
  padding,
  width,
  height,
  ariaLabel,
  testId,
  style,
}: InputProps) {
  return (
    <input
      value={value}
      onChange={(event) => onValue?.(event.target.value)}
      placeholder={placeholder}
      type={type}
      // Announced, because the placeholder disappears the moment anyone types
      // and a screen reader user would be left with an unlabelled box.
      aria-label={ariaLabel ?? placeholder}
      aria-invalid={invalid || undefined}
      data-testid={testId}
      style={{
        fontSize,
        color,
        background: fill,
        border: border ?? "1px solid rgba(15,23,42,0.15)",
        borderColor: invalid ? "#dc2626" : undefined,
        borderRadius: radius,
        padding: pad(padding) ?? 12,
        width: size(width) ?? "100%",
        height,
        boxSizing: "border-box",
        outline: "none",
        ...style,
      }}
    />
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

/**
 * The catalogue a compiled module receives as `ui`.
 *
 * **Factories, not components.** A compiled module has no imports — React is not
 * in its scope — so it cannot use JSX and cannot call `createElement`. It writes
 * `ui.Frame(props, children)` and gets an element back. Keeping that shape here
 * is what lets the emitted output stay import-free.
 *
 * The components themselves are exported above for anything that *does* have
 * React in scope and wants JSX.
 */
type Children = ReactNode | ReactNode[];
type Factory<P> = (props?: P, children?: Children) => ReactNode;

/**
 * Children are spread rather than passed as one array, so React sees positional
 * children and does not demand keys. Generated code emits a plain array of
 * siblings; making it key-free is the runtime's job, not the compiler's.
 */
const spread = (children: Children): ReactNode[] =>
  Array.isArray(children) ? children : [children];

export const ui: {
  Frame: Factory<Omit<FrameProps, "children">>;
  Text: Factory<Omit<TextProps, "children">>;
  Image: Factory<ImageProps>;
  Input: Factory<InputProps>;
} = {
  Frame: (props, children) =>
    createElement(Frame, props as FrameProps, ...spread(children)),
  Text: (props, children) => createElement(Text, props as TextProps, ...spread(children)),
  Image: (props) => createElement(Image, props as ImageProps),
  Input: (props) => createElement(Input, props as InputProps),
};

export type Ui = typeof ui;
