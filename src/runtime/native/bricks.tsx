/**
 * The four bricks, drawn with React Native.
 *
 * The same props the web bricks take, and the same `ui` catalogue shape, because
 * the walk that calls them is shared — `tree-screen` only ever reaches
 * `props.ui.*`, so it renders here unchanged. What differs is entirely below the
 * contract.
 *
 * Three things are not renames, and they are the reason this file is longer than
 * a mapping table:
 *
 * - **A stroke is not a border.** React Native has no spread and no inset, and
 *   `borderWidth` consumes layout, which a stroke must not. An inside stroke is
 *   close enough to a border to be one; outside and centre are drawn as an
 *   absolutely-positioned sibling that takes no part in layout and no taps.
 * - **A gradient is a component**, not a background — a child behind the
 *   content, not a style key.
 * - **`ScrollView` styles in two halves.** `style` is the viewport; the layout
 *   belongs to `contentContainerStyle`. Padding on the first does nothing and a
 *   height on the second breaks scrolling, so the computed style is split.
 */
import { createElement, useState, type ReactNode } from "react";
import {
  I18nManager,
  Image as RNImage,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type ImageStyle,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { boxFromProps, paddingFrom } from "../style/adapt-legacy";
import { flexForSize } from "../style/emit-css";
import { useFollowLink, type FollowLink } from "../link-context";

/**
 * A designer's left, as this device would draw it.
 *
 * `left` and `right` are what a designer picks, and what every artifact
 * already published carries. What they mean is "the side the line starts on",
 * which in an RTL layout is the other one — so the sides swap here rather than
 * anywhere upstream, and the authored vocabulary never has to change.
 */
function mirrorAlign(align: "left" | "center" | "right"): "left" | "center" | "right" {
  if (align === "center" || !I18nManager.isRTL) return align;
  return align === "left" ? "right" : "left";
}
import { isRuns, plainOf, runsOf, type RichText, type TextRun } from "../rich-text";
import {
  nativeBox,
  nativeColor,
  nativeLineHeight,
  nativePadding,
  nativeRadius,
  nativeSize,
  type NativeGradient,
  type NativeOverlayStroke,
  type NativeStyle,
} from "../style/emit-native";
import type { TokenLookup } from "../style/tokens";
import type { FrameProps, ImageProps, InputProps, TextProps } from "../client/bricks";

/**
 * Drawn by the host app, not imported here.
 *
 * `expo-linear-gradient` is a native module, and a package that must not force a
 * dependency on one takes it as an injection instead. The app registers what it
 * has; a renderer without one paints the first stop as a flat fill, which is
 * wrong in a way you can see rather than a crash.
 */
export type NativeDeps = {
  Gradient?: (props: {
    colors: string[];
    locations: number[];
    angle: number;
    style: StyleProp<ViewStyle>;
  }) => ReactNode;
};

let deps: NativeDeps = {};

export function configureNativeBricks(next: NativeDeps): void {
  deps = { ...deps, ...next };
}

/** Where token references resolve. Set once by the host, as `configureRequests` is. */
let lookup: TokenLookup = {};

export function configureTokens(next: TokenLookup): void {
  lookup = next;
}

// ─── Shared plumbing ──────────────────────────────────────────────────────────

/** Which keys belong to the scrolled content rather than to the viewport. */
const CONTENT_KEYS = new Set([
  "flexDirection",
  "alignItems",
  "justifyContent",
  "gap",
  "rowGap",
  "columnGap",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
]);

function splitForScroll(
  style: NativeStyle,
  scroll: boolean | undefined,
): { view: NativeStyle; content: NativeStyle | undefined } {
  if (!scroll) return { view: style, content: undefined };

  const view: NativeStyle = {};
  const content: NativeStyle = {};
  Object.entries(style).forEach(([key, value]) => {
    (CONTENT_KEYS.has(key) ? content : view)[key] = value;
  });
  // Short content still fills the viewport, which is what a browser's document
  // does and therefore what parity requires.
  content.flexGrow = 1;
  return { view, content };
}

function layoutOf(props: FrameProps): NativeStyle {
  const style: NativeStyle = {};
  if (props.layout && props.layout !== "none") style.flexDirection = props.layout;
  if (props.gap !== undefined) style.gap = props.gap;

  const along = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch" };
  const between = { start: "flex-start", center: "center", end: "flex-end", between: "space-between" };
  if (props.align) style.alignItems = along[props.align];
  if (props.justify) style.justifyContent = between[props.justify];
  if (props.grow || flexForSize(props.width).grow) style.flexGrow = 1;
  return style;
}

/**
 * Accessibility, in one spelling.
 *
 * React Native has accepted the ARIA names — `role`, `aria-checked`,
 * `aria-label` — since 0.71, and `react-native-web` prefers them over the older
 * `accessibility*` props. Using them means the brick says the same thing the web
 * brick says, rather than a translation of it that can drift.
 *
 * `role` passes straight through: RN's accepted values are ARIA's, `dialog`,
 * `group` and `radiogroup` included.
 */
function a11y(props: Pick<FrameProps, "role" | "ariaLabel" | "ariaChecked" | "disabled">) {
  return {
    role: props.role,
    "aria-label": props.ariaLabel,
    "aria-checked": props.ariaChecked,
    "aria-disabled": props.disabled,
  } as const;
}

function GradientLayer({ gradient }: { gradient: NativeGradient }) {
  const Gradient = deps.Gradient;
  if (!Gradient) {
    // Visibly the first colour rather than nothing, so a missing dependency is
    // something you see in a preview instead of a blank box in production.
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: gradient.colors[0] }]} />;
  }
  return <Gradient {...gradient} style={StyleSheet.absoluteFill} />;
}

function StrokeLayer({ stroke }: { stroke: NativeOverlayStroke }) {
  return (
    <View
      // Paint, not layout, and never a tap target — which is the whole reason a
      // stroke is not drawn as a border.
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          margin: -stroke.inset,
          borderWidth: stroke.width,
          borderColor: stroke.color,
          ...(stroke.radius === undefined ? {} : nativeRadius(stroke.radius)),
        } as ViewStyle,
      ]}
    />
  );
}

// ─── Frame ────────────────────────────────────────────────────────────────────

/** The press every tappable brick answers with — see the web brick's `pressScale`. */
const PRESSED = { transform: [{ scale: 0.97 }] };

export function Frame({ children, onClick, disabled, scroll, states, ...props }: FrameProps) {
  const box = nativeBox(boxFromProps(props as Record<string, unknown>), lookup);
  const style = { ...box.style, ...layoutOf(props as FrameProps) };
  const { view, content } = splitForScroll(style, scroll);

  /**
   * The pressed look, resolved once rather than while a finger is down.
   *
   * Only `press`: a phone has no pointer to hover with, so a hover layer is
   * data this platform correctly ignores rather than something it is missing.
   *
   * Style only, not the gradient or the stroke layers — those are separate
   * views behind and in front of the content, and swapping them under a press
   * is a second mechanism for a case nobody has drawn yet.
   */
  const pressedStyle = states?.press
    ? (() => {
        const merged = {
          ...(props as Record<string, unknown>),
          ...(states.press as Record<string, unknown>),
        };
        return {
          ...nativeBox(boxFromProps(merged), lookup).style,
          ...layoutOf(merged as FrameProps),
        };
      })()
    : null;

  const inner = (
    <>
      {box.gradient ? <GradientLayer gradient={box.gradient} /> : null}
      {children}
      {box.overlayStroke ? <StrokeLayer stroke={box.overlayStroke} /> : null}
    </>
  );

  if (scroll) {
    return (
      <ScrollView
        style={view as ViewStyle}
        contentContainerStyle={content as ViewStyle}
        testID={props.testId}
      >
        {/* Pressable inside, never outside: a Pressable wrapping a ScrollView
            swallows the drag and the surface stops scrolling. */}
        {onClick ? (
          <Pressable onPress={onClick} style={({ pressed }) => (pressed ? PRESSED : null)}>
            {inner}
          </Pressable>
        ) : (
          inner
        )}
      </ScrollView>
    );
  }

  if (onClick) {
    return (
      <Pressable
        // Every tappable frame shrinks a little under a finger, over whatever
        // pressed look the design drew — the web brick's `pressScale`.
        style={({ pressed }) =>
          (pressed
            ? {
                ...view,
                ...pressedStyle,
                transform: [...(((view as ViewStyle).transform as never[]) ?? []), ...PRESSED.transform],
              }
            : view) as ViewStyle
        }
        onPress={onClick}
        disabled={disabled}
        {...a11y({ ...props, disabled })}
        testID={props.testId}
      >
        {inner}
      </Pressable>
    );
  }

  return (
    <View style={view as ViewStyle} testID={props.testId}>
      {inner}
    </View>
  );
}

// ─── Text ─────────────────────────────────────────────────────────────────────

/**
 * One run, as a nested `Text`.
 *
 * React Native's own answer to inline styling: a `Text` inside a `Text` inherits
 * the parent's type and overrides what it states, which is exactly what a run
 * is. So there is no measuring, no manual line breaking and no second layout
 * pass here — the platform does what the browser does for a `<span>`.
 *
 * `onPress` on the inner `Text` fires for taps on *those characters only*,
 * which is the behaviour a link inside a sentence has to have. The web brick's
 * anchor gets it from the DOM for the same reason.
 */
function runText(run: TextRun, at: number, follow: FollowLink | null): ReactNode {
  const marks: TextStyle = {
    ...(run.bold ? { fontWeight: "700" as TextStyle["fontWeight"] } : {}),
    ...(run.italic ? { fontStyle: "italic" as TextStyle["fontStyle"] } : {}),
    ...(run.underline ? { textDecorationLine: "underline" as TextStyle["textDecorationLine"] } : {}),
  };

  // Only when there is somewhere to go — see the web brick's `runElement`.
  const link = run.link && follow ? run.link : null;

  return (
    <RNText
      key={at}
      style={marks}
      onPress={link ? () => follow?.(link) : undefined}
      role={link ? "link" : undefined}
    >
      {run.text}
    </RNText>
  );
}

export function Text({
  children,
  runs,
  onClick,
  size,
  weight,
  color,
  align,
  lineHeight,
  width,
  height,
  grow,
  ...props
}: TextProps) {
  const follow = useFollowLink();
  // A tappable line of copy shrinks under a finger like a frame does.
  const [pressed, setPressed] = useState(false);
  const fontSize = size ?? 16;
  const style: TextStyle = {
    fontSize,
    /**
     * The box the words are aligned in — see `TextProps.width`.
     *
     * Resolved through the same `nativeSize` the `Frame` brick uses, so a text
     * frame set to fill is a flex child here for the same reason and by the
     * same rule, and the two renderers agree about what the designer picked.
     */
    ...(nativeSize(width, "width") as TextStyle),
    ...(nativeSize(height, "height") as TextStyle),
    ...(grow || flexForSize(width).grow ? { flexGrow: 1 } : {}),
    ...(weight === undefined ? {} : { fontWeight: String(weight) as TextStyle["fontWeight"] }),
    ...(color ? { color: nativeColor(color, lookup) } : {}),
    /**
     * The same logical alignment the web brick does, spelled the way React
     * Native can express it.
     *
     * There is no `start` here — RN's `textAlign` is physical, and its `auto`
     * follows the *text's own* script rather than the layout's, so a Latin
     * brand name inside an Arabic screen would align the wrong way. So the
     * sides are swapped explicitly against `I18nManager`, which is the one
     * thing on a phone that knows the layout direction.
     *
     * Read at draw time rather than captured: `I18nManager.isRTL` changes with
     * an app restart, and a value closed over at module load would be the
     * previous run's answer.
     */
    ...(align ? { textAlign: mirrorAlign(align) } : {}),
    /**
     * Absolute points, always. The web brick's unitless multiplier would be read
     * here as a line 1.4 points tall, stacking every row of text on the last —
     * which is why `LineHeight` carries its unit through the artifact.
     */
    lineHeight: nativeLineHeight(
      typeof lineHeight === "number" ? { kind: "multiple", value: lineHeight } : { kind: "multiple", value: 1.4 },
      fontSize,
    ),
  };

  const spans = runs ? runsOf(runs) : null;

  return (
    <RNText
      style={onClick && pressed ? [style, PRESSED] : style}
      onPress={onClick}
      onPressIn={onClick ? () => setPressed(true) : undefined}
      onPressOut={onClick ? () => setPressed(false) : undefined}
      role={onClick ? "button" : undefined}
      // The words without their emphasis: a screen reader is read a name, and
      // the marks are not part of one.
      aria-label={props.ariaLabel ?? (spans ? plainOf(spans) : undefined)}
      testID={props.testId}
    >
      {spans ? spans.map((run, at) => runText(run, at, follow)) : children}
    </RNText>
  );
}

// ─── Image ────────────────────────────────────────────────────────────────────

export function Image({ src, alt, width, height, radius, fit }: ImageProps) {
  const style: ImageStyle = {
    ...(nativeSize(width, "width") as ImageStyle),
    ...(height === undefined ? {} : { height }),
    ...(radius === undefined ? {} : (nativeRadius(radius) as ImageStyle)),
    resizeMode: fit ?? "cover",
  };

  return <RNImage source={{ uri: src }} style={style} accessibilityLabel={alt} accessible={!!alt} />;
}

// ─── Input ────────────────────────────────────────────────────────────────────

/** The type decides the keyboard as much as the validation. A funnel is used with a thumb. */
const KEYBOARDS = {
  text: "default",
  email: "email-address",
  tel: "phone-pad",
  number: "numeric",
} as const;

export function Input({
  value,
  onValue,
  onLeave,
  placeholder,
  type = "text",
  invalid,
  size,
  color,
  padding,
  width,
  height,
  ariaLabel,
  testId,
  ...rest
}: InputProps) {
  const box = nativeBox(boxFromProps(rest as Record<string, unknown>), lookup);

  return (
    <TextInput
      value={value}
      onChangeText={onValue}
      onBlur={onLeave}
      placeholder={placeholder}
      keyboardType={KEYBOARDS[type]}
      autoCapitalize={type === "email" ? "none" : "sentences"}
      autoCorrect={type !== "email"}
      aria-label={ariaLabel}
      testID={testId}
      style={[
        box.style as TextStyle,
        {
          ...(size === undefined ? {} : { fontSize: size }),
          ...(color ? { color: nativeColor(color, lookup) } : {}),
          // Normalised first: the brick contract still accepts CSS shorthand
          // (`16`, `[16, 8]`), and three shapes for one concept is three chances
          // for two renderers to expand it differently.
          ...(paddingFrom(padding) ? nativePadding(paddingFrom(padding)!) : {}),
          ...(nativeSize(width, "width") as TextStyle),
          ...(height === undefined ? {} : { height }),
          // Invalid overrides the designed border rather than sitting beside it:
          // two borders on one field is a field with a mystery second outline.
          ...(invalid ? { borderWidth: 1, borderColor: "#dc2626" } : {}),
        },
      ]}
    />
  );
}

// ─── The catalogue ────────────────────────────────────────────────────────────

/**
 * Identical in shape to the web catalogue, because the walk that calls it is the
 * same file. Children are spread positionally so React sees siblings and does
 * not demand keys — the emitted output stays key-free on both platforms.
 */
type Children = ReactNode | ReactNode[];
const spread = (children: Children): ReactNode[] => (Array.isArray(children) ? children : [children]);

export const ui = {
  Frame: (props?: Omit<FrameProps, "children">, children?: Children) =>
    createElement(Frame, props as FrameProps, ...spread(children)),
  /**
   * Rich copy becomes a prop, exactly as it does on web.
   *
   * `spread` reads an array as a list of siblings and a run list is an array,
   * so without this React Native is handed a bare object as a child. The two
   * catalogues have to make this decision the same way — the tree walk that
   * calls them is one file.
   */
  Text: (props?: Omit<TextProps, "children" | "runs">, children?: Children | RichText) =>
    isRuns(children)
      ? createElement(Text, { ...(props as TextProps), runs: children })
      : createElement(Text, props as TextProps, ...spread(children as Children)),
  Image: (props?: ImageProps) => createElement(Image, props as ImageProps),
  Input: (props?: InputProps) => createElement(Input, props as InputProps),
};
