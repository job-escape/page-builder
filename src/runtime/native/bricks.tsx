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
import { createContext, createElement, useContext, useState, type ReactNode } from "react";
import {
  Animated,
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
import { useDeclaredDirection, useRightToLeft } from "./direction";
import { useNativeMotion } from "./motion";

/**
 * A designer's left, as this device would draw it.
 *
 * `left` and `right` are what a designer picks, and what every artifact
 * already published carries. What they mean is "the side the line starts on",
 * which in an RTL layout is the other one — so the sides swap here rather than
 * anywhere upstream, and the authored vocabulary never has to change.
 */
function mirrorAlign(
  align: "left" | "center" | "right",
  rightToLeft: boolean,
): "left" | "center" | "right" {
  if (align === "center" || !rightToLeft) return align;
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
  type Flow,
  type NativeStyle,
} from "../style/emit-native";
import type { TokenLookup } from "../style/tokens";
import type { FrameProps, ImageProps, InputProps, Placement, TextProps } from "../client/bricks";

/**
 * Which way the frame a brick sits in lays its children out.
 *
 * What a `fill` is measured along — see `nativeSize`. Every `Frame` provides
 * its own for its children; a brick with no frame above it (a screen's root)
 * reads undefined and keeps the old answer.
 */
const FlowContext = createContext<Flow | undefined>(undefined);

/**
 * Whether the height this brick is measured against is a definite one.
 *
 * A frame states a definite height by being given a number, or by filling a
 * parent that has one. A frame that hugs its content does not, and neither
 * does a scrolling screen, whose height is whatever its content comes to.
 *
 * It travels as context because CSS resolves the same question by walking up
 * the tree, and this is that walk: `nativeSize` needs the answer for `fill`,
 * and the answer belongs to the parent rather than to the brick asking.
 *
 * `true` by default, for the screen that does not scroll: there the surface is
 * the viewport and a height measured against it is as definite as a number.
 */
export const HeightContext = createContext<boolean>(true);

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

/*
  The runtime's words and the CSS spellings beside them — the web brick reads
  the same, so a design stored with `space-between` spreads in both.
*/
const ALONG: Record<string, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
  "flex-start": "flex-start",
  "flex-end": "flex-end",
};
const BETWEEN: Record<string, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
  "space-between": "space-between",
  "flex-start": "flex-start",
  "flex-end": "flex-end",
};

/**
 * Where a brick sits, for a parent that places its children itself.
 *
 * The web half needs its parent told to be a positioning context; this one does
 * not, because every React Native view already is one — `position: "relative"`
 * is the default there, so `places` has nothing to add and is correctly
 * ignored. See `Placement` in the client bricks for what the two points mean.
 */
function placedNative(placement: Placement): NativeStyle {
  if (placement.x === undefined && placement.y === undefined) return {};
  return { position: "absolute", left: placement.x ?? 0, top: placement.y ?? 0 };
}

function layoutOf(props: FrameProps, flow?: Flow): NativeStyle {
  const style: NativeStyle = {};
  if (props.layout && props.layout !== "none") style.flexDirection = props.layout;
  if (props.gap !== undefined) style.gap = props.gap;

  if (props.align && ALONG[props.align]) style.alignItems = ALONG[props.align];
  if (props.justify && BETWEEN[props.justify]) style.justifyContent = BETWEEN[props.justify];
  /*
    A filling width only grows when its parent flows sideways — and with the
    flow known, `nativeSize` already says so. Growing it regardless is what
    made a width-fill frame in a column take a third of the screen's height.
  */
  if (props.grow || (flow === undefined && flexForSize(props.width).grow)) style.flexGrow = 1;
  return { ...style, ...placedNative(props) };
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

/** A pressable that can wear animated values — see `useNativeMotion`. */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Frame({ children, onClick, disabled, scroll, states, ...props }: FrameProps) {
  // The frame this one sits in — what its own `fill` is measured along.
  const flow = useContext(FlowContext);
  // And whether that frame's height is a definite one — what `fill` means here.
  const definite = useContext(HeightContext);
  const box = nativeBox(boxFromProps(props as Record<string, unknown>), lookup, flow, definite);
  const style = { ...box.style, ...layoutOf(props as FrameProps, flow) };
  const { view, content } = splitForScroll(style, scroll);
  /** The way this frame lays out its own children, handed down to them. */
  const own: Flow = props.layout === "column" || props.layout === "row" ? props.layout : "none";
  /**
   * And whether *this* frame is a definite height for what it holds.
   *
   * A number is one. A `fill` is one only if what it fills has one. A hug is
   * not — its height is whatever its content comes to, so a child filling it
   * would be measuring against itself. A scrolling frame is not either, for
   * the same reason a scrolling screen is not.
   */
  const ownDefinite = scroll
    ? false
    : typeof props.height === "number" || (props.height === "fill" && definite);

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
          ...nativeBox(boxFromProps(merged), lookup, flow).style,
          ...layoutOf(merged as FrameProps, flow),
        };
      })()
    : null;

  /*
    Motion, when the design gave the frame any: a transition gliding a bound
    width, a preset playing on its own. Hooks called on every render; the
    `Animated` views below are used only when there is something to animate.
  */
  const motion = useNativeMotion({
    style: view,
    transition: (props as FrameProps).transition,
    motion: (props as FrameProps).motion,
    motionKey: (props as FrameProps).motionKey,
  });
  const [pressing, setPressing] = useState(false);

  const inner = (
    <>
      {box.gradient ? <GradientLayer gradient={box.gradient} /> : null}
      <FlowContext.Provider value={own}>
        <HeightContext.Provider value={ownDefinite}>{children}</HeightContext.Provider>
      </FlowContext.Provider>
      {box.overlayStroke ? <StrokeLayer stroke={box.overlayStroke} /> : null}
    </>
  );

  if (motion.animated) {
    const moving = [view, motion.style] as unknown as ViewStyle;
    if (scroll) {
      return (
        <Animated.ScrollView
          style={moving}
          contentContainerStyle={content as ViewStyle}
          testID={props.testId}
        >
          {onClick ? <Pressable onPress={onClick}>{inner}</Pressable> : inner}
        </Animated.ScrollView>
      );
    }
    if (onClick) {
      const transform = [
        ...((motion.style.transform as unknown[]) ?? ((view as ViewStyle).transform as unknown[]) ?? []),
        ...(pressing ? PRESSED.transform : []),
      ];
      return (
        <AnimatedPressable
          style={[view, pressing ? pressedStyle : null, motion.style, { transform }] as never}
          onPress={onClick}
          onPressIn={() => setPressing(true)}
          onPressOut={() => setPressing(false)}
          disabled={disabled}
          {...a11y({ ...props, disabled })}
          testID={props.testId}
        >
          {inner}
        </AnimatedPressable>
      );
    }
    return (
      <Animated.View style={moving} testID={props.testId}>
        {inner}
      </Animated.View>
    );
  }

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
  // Which way the funnel reads — see `direction`.
  const rightToLeft = useRightToLeft();
  const declared = useDeclaredDirection();
  // The frame this line sits in — what its `fill` is measured along.
  const flow = useContext(FlowContext);
  // And whether that frame's height is definite — see `HeightContext`.
  const definite = useContext(HeightContext);
  // A tappable line of copy shrinks under a finger like a frame does.
  const [pressed, setPressed] = useState(false);
  const fontSize = size ?? 16;
  /**
   * The box the words sit in — a fill, a padding, a radius.
   *
   * Read through the same `boxFromProps`/`nativeBox` pair `Frame` uses, from
   * the props left over after the typographic ones: a highlighted paragraph is
   * a text frame wearing a tint, and dropping those left it plain copy here
   * while the canvas drew it as authored. Width and height are not among them
   * — they are destructured out above and resolved on their own below.
   */
  const box = nativeBox(boxFromProps(props as Record<string, unknown>), lookup, flow, definite);
  const style: TextStyle = {
    ...(box.style as TextStyle),
    ...(placedNative(props) as TextStyle),
    fontSize,
    /**
     * The box the words are aligned in — see `TextProps.width`.
     *
     * Resolved through the same `nativeSize` the `Frame` brick uses, with the
     * same parent flow, so a text frame set to fill spans its column rather
     * than growing down it — and the two renderers agree about what the
     * designer picked.
     */
    ...(nativeSize(width, "width", flow) as TextStyle),
    ...(nativeSize(height, "height", flow, definite) as TextStyle),
    ...(grow || (flow === undefined && flexForSize(width).grow) ? { flexGrow: 1 } : {}),
    ...(weight === undefined ? {} : { fontWeight: String(weight) as TextStyle["fontWeight"] }),
    ...(color ? { color: nativeColor(color, lookup) } : {}),
    /**
     * The same logical alignment the web brick does, spelled the way React
     * Native can express it.
     *
     * There is no `start` here — RN's `textAlign` is physical, and its `auto`
     * follows the *text's own* script rather than the layout's, so a Latin
     * brand name inside an Arabic screen would align the wrong way. So the
     * sides are swapped explicitly against the funnel's direction — its
     * language's, from `Funnel`'s `dir`, or `I18nManager` for a host that has
     * not passed one (see `direction`).
     */
    ...(align ? { textAlign: mirrorAlign(align, rightToLeft) } : {}),
    /**
     * And the paragraph's own direction, when the funnel declared one.
     *
     * What `dir` on the document does for a web paragraph: a line with no
     * letter to say which way it reads — a lone `‹` back chevron — takes the
     * layout's, so iOS draws it as `›`, its mirrored pair, the way a browser
     * does. Left out when nobody declared a direction, so such a host's text
     * is untouched. iOS reads it; Android ignores the key.
     */
    ...(declared ? { writingDirection: declared } : {}),
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
  const motion = useNativeMotion({
    style: style as Record<string, unknown>,
    transition: (props as { transition?: unknown }).transition,
    motion: (props as { motion?: unknown }).motion,
    motionKey: undefined,
  });
  const TextView = (motion.animated ? Animated.Text : RNText) as typeof RNText;

  return (
    <TextView
      style={
        (motion.animated
          ? [style, motion.style, onClick && pressed ? PRESSED : null]
          : onClick && pressed
            ? [style, PRESSED]
            : style) as TextStyle
      }
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
    </TextView>
  );
}

// ─── Image ────────────────────────────────────────────────────────────────────

export function Image({ src, alt, width, height, radius, fit, ...placement }: ImageProps) {
  /*
    The parent's flow, because a remote image has no size of its own: a width
    set to fill that grew down a column instead of across it left the picture
    zero wide — the hero of a quiz, missing, with an empty band where it was.
  */
  const flow = useContext(FlowContext);
  // And whether that frame's height is definite — see `HeightContext`.
  const definite = useContext(HeightContext);
  const style: ImageStyle = {
    ...(placedNative(placement) as ImageStyle),
    ...(nativeSize(width, "width", flow) as ImageStyle),
    /*
      Resolved rather than passed through. `fill` and `hug` are the contract's
      words, and React Native does not know either as a style value — so an icon
      authored `height: fill` inside a 24-square frame got no height at all, and
      every row of a quiz showed a gap where its picture belonged. A browser
      ignores the same invalid value and draws the picture from its width, which
      is why this was wrong only on a phone.
    */
    ...(nativeSize(height, "height", flow, definite) as ImageStyle),
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
  // The frame this field sits in — what its `fill` is measured along.
  const flow = useContext(FlowContext);
  // And whether that frame's height is definite — see `HeightContext`.
  const definite = useContext(HeightContext);
  const box = nativeBox(boxFromProps(rest as Record<string, unknown>), lookup, flow, definite);

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
          ...(placedNative(rest as Placement) as TextStyle),
          ...(size === undefined ? {} : { fontSize: size }),
          ...(color ? { color: nativeColor(color, lookup) } : {}),
          // Normalised first: the brick contract still accepts CSS shorthand
          // (`16`, `[16, 8]`), and three shapes for one concept is three chances
          // for two renderers to expand it differently.
          ...(paddingFrom(padding) ? nativePadding(paddingFrom(padding)!) : {}),
          ...(nativeSize(width, "width", flow) as TextStyle),
          // Resolved for the same reason the picture's is — see `Image`.
          ...(nativeSize(height, "height", flow, definite) as TextStyle),
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
  /** A host component the design leaves room for — see `ui.Slot` on web. */
  Slot: (component: unknown, props: Record<string, unknown>) =>
    createElement(component as (props: Record<string, unknown>) => ReactNode, props),
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
