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
import {
  createContext,
  createElement,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useContext,
  useState,
} from "react";

import { useFollowLink, type FollowLink } from "../link-context";
import { isRuns, runsOf, type RichText, type TextRun } from "../rich-text";

export type FrameLayout = "none" | "row" | "column";

/**
 * The roles a brick may announce itself as.
 *
 * `link` is here for a run that navigates — a span is not an anchor, so without
 * it a screen reader announces the words and nothing about them being a way
 * somewhere else. The rest are `Frame`'s own, unchanged.
 */
export type BrickRole = "button" | "radio" | "checkbox" | "group" | "radiogroup" | "dialog" | "link";
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

/**
 * The pointer states a brick can be drawn differently in.
 *
 * Two, and the pair is closed on purpose: a state layer is only worth having
 * if something can *detect* it, and the pointer is the only thing here that
 * detects anything. Everything else a designer calls a state — selected,
 * disabled, at the cap — is a question about the funnel's own variables, and
 * those already arrive as `bindings`, evaluated per render against the store.
 * Adding them here would be a second answer to a question that has one.
 */
export type BrickState = { hover: boolean; press: boolean };

/**
 * A sparse layer per state — only the fields it changes.
 *
 * The same shape the editor stores and the same shape CSS has used since it
 * had `:hover`: a base, and a handful of keys that win while the state holds.
 * Never a second copy of the whole look, which is the variant matrix this
 * exists to avoid.
 */
export type BrickStates<Look> = { hover?: Look; press?: Look };

const NO_STATE: BrickState = { hover: false, press: false };

/**
 * What the pointer is doing to the nearest brick that tracks it.
 *
 * A context rather than a prop, because the pointer is over *one* element and
 * the styling it drives is usually on another: hovering an option darkens its
 * background and lightens the label, and the label is a `Text` three levels
 * down that no pointer will ever be over. The frame that takes the pointer
 * publishes what it sees; every brick inside reads it and applies its own
 * layer. That is how a descendant selector behaves in CSS, expressed as the
 * one mechanism React has for the same reach.
 */
const PointerState = createContext<BrickState>(NO_STATE);

/**
 * Track the pointer, if this brick is the one it lands on.
 *
 * `tracked` decides whether handlers are attached at all: a brick that neither
 * takes clicks nor has a layer of its own has nothing to do with the pointer,
 * and attaching four listeners to every div in a funnel is a cost with no
 * effect. What it *inherits* still applies either way — that comes from the
 * context, not from listening.
 */
function usePointerState(tracked: boolean): {
  at: BrickState;
  handlers: Record<string, (() => void) | undefined>;
} {
  const inherited = useContext(PointerState);
  const [own, setOwn] = useState<BrickState>(NO_STATE);

  const at: BrickState = {
    hover: own.hover || inherited.hover,
    press: own.press || inherited.press,
  };

  if (!tracked) return { at: inherited, handlers: {} };

  return {
    at,
    handlers: {
      onPointerEnter: () => setOwn((state) => ({ ...state, hover: true })),
      // Leaving clears the press too. A pointer that goes down on a button and
      // comes up somewhere else fires no `pointerup` here, and a brick left
      // drawn as pressed for the rest of the session is the bug that makes.
      onPointerLeave: () => setOwn(NO_STATE),
      onPointerDown: () => setOwn((state) => ({ ...state, press: true })),
      onPointerUp: () => setOwn((state) => ({ ...state, press: false })),
      onPointerCancel: () => setOwn(NO_STATE),
    },
  };
}

/**
 * The look, with whichever layers are in force applied over it.
 *
 * Hover first, then press — Webflow's rule, and the one a designer expects: a
 * pressed button is a hovered button with the press changes on top, so a state
 * that only darkens the border does not silently drop the hover background.
 */
function withState<Look extends object>(
  look: Look,
  states: BrickStates<Look> | undefined,
  at: BrickState,
): Look {
  if (!states) return look;
  return {
    ...look,
    ...(at.hover ? states.hover : null),
    ...(at.press ? states.press : null),
  };
}

/**
 * The half of a frame a state layer is allowed to change.
 *
 * Appearance, never behaviour. A hover layer may repaint a button; it may not
 * give it a different `onClick`, a different role, or take its `disabled`
 * away — a brick that did something else while the pointer was on it would be
 * a brick nobody could reason about, and none of it is a thing a designer can
 * draw.
 */
export type FrameLook = {
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
  style?: CSSProperties;
};

export type FrameProps = FrameLook & {
  onClick?: () => void;
  disabled?: boolean;
  /** Set by the compiler from the declared semantics — drives role and keyboard. */
  role?: BrickRole;
  ariaLabel?: string;
  ariaChecked?: boolean;
  /** `false` takes this brick out of the tab order — see `interactionProps`. */
  tabStop?: boolean;
  testId?: string;
  /**
   * How it is drawn while the pointer is on it — sparse, over the base above.
   *
   * Absent for nearly every frame, which is what makes it free: no layer, no
   * listeners, no state, and the frame renders exactly the markup it did
   * before this existed.
   */
  states?: BrickStates<FrameLook>;
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
  tabStop,
  testId,
}: {
  onClick?: () => void;
  disabled?: boolean;
  role?: BrickRole;
  ariaLabel?: string;
  ariaChecked?: boolean;
  tabStop?: boolean;
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
    /**
     * One tab stop for a whole group — the roving tabindex, decided upstream.
     *
     * A radio group is *one* stop in the page's tab order: Tab reaches the
     * chosen option and the arrows move within it. Eight options that are each
     * their own stop is the thing the pattern exists to prevent, and it is
     * eight presses to get past a question.
     *
     * Which one is the stop is a question about the funnel's answers — the
     * checked one, or the first if none is — so the compiler works it out with
     * the same conditions it uses for everything else and sends the result.
     * Absent means "an ordinary stop", which is every brick that is not in a
     * group and every artifact published before this existed.
     */
    tabIndex: interactive ? (tabStop === false ? -1 : 0) : undefined,
    "aria-label": ariaLabel,
    "aria-checked": ariaChecked,
    "aria-disabled": disabled || undefined,
    "data-testid": testId,
  };
}

/**
 * Arrows move within a group; Tab moves past it.
 *
 * The other half of the roving tabindex, and the half that cannot be decided
 * by the compiler: "the next option" is a question about what is on screen
 * right now, after every `when` has been evaluated, so only the DOM can answer
 * it. Reading the rendered children is the whole of it — no registry, no
 * refs threaded through the walk, nothing for a renderer on another platform
 * to reimplement differently.
 *
 * Moving *checks* as well as focusing, for `radiogroup` only. That is the
 * WAI-ARIA pattern: in a radio group the selection follows the focus, because
 * one of them is always chosen; in a checkbox group it does not, because the
 * visitor is picking a set and arrowing past a box must not tick it.
 */
function groupKeys(role: BrickRole | undefined) {
  if (role !== "radiogroup" && role !== "group") return {};

  const step = role === "radiogroup" ? 1 : 0;

  return {
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      const forward = event.key === "ArrowDown" || event.key === "ArrowRight";
      const back = event.key === "ArrowUp" || event.key === "ArrowLeft";
      if (!forward && !back) return;

      const options = [
        ...event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"], [role="checkbox"]'),
      ].filter((option) => option.getAttribute("aria-disabled") !== "true");
      if (options.length === 0) return;

      const from = options.findIndex((option) => option.contains(document.activeElement));
      // Nothing focused yet means the group itself has the focus, and the first
      // arrow should land on the first option rather than the second.
      const to =
        from === -1
          ? forward
            ? 0
            : options.length - 1
          : (from + (forward ? 1 : -1) + options.length) % options.length;

      event.preventDefault();
      options[to]?.focus();
      if (step) options[to]?.click();
    },
  };
}

const pad = (value: FrameProps["padding"]): string | number | undefined => {
  if (value === undefined) return undefined;
  if (typeof value === "number") return value;
  return value.map((entry) => `${entry}px`).join(" ");
};

export function Frame(props: FrameProps) {
  const { onClick, disabled, role, ariaLabel, ariaChecked, tabStop, testId, states, children } =
    props;
  const interactive = Boolean(onClick) && !disabled;

  /**
   * Listen only where the pointer decides something.
   *
   * A frame that takes clicks is where a press begins whether or not it draws
   * one, and a frame with a layer of its own needs to know. Everything else
   * inherits from whichever ancestor did listen, and pays nothing.
   */
  const { at, handlers } = usePointerState(interactive || Boolean(states));
  const {
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
    style,
  } = withState(props as FrameLook, states, at);

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

  /**
   * Both keyboard handlers, and the group's runs first.
   *
   * Spreading one after the other loses one of them — `interactionProps`
   * writes `onKeyDown: undefined` for a frame that takes no clicks, which is
   * exactly what a group is, so the arrows were being overwritten by the
   * absence of a click handler. Composed instead, group first: it claims the
   * arrows and leaves Enter and Space to the activation handler behind it.
   */
  const interaction = interactionProps({
    onClick,
    disabled,
    role,
    ariaLabel,
    ariaChecked,
    tabStop,
    testId,
  });
  const group = groupKeys(role);
  const onKeyDown =
    group.onKeyDown && interaction.onKeyDown
      ? (event: KeyboardEvent<HTMLElement>) => {
          group.onKeyDown?.(event);
          if (!event.defaultPrevented) interaction.onKeyDown?.(event);
        }
      : (group.onKeyDown ?? interaction.onKeyDown);

  const drawn = (
    <div style={css} {...handlers} {...interaction} onKeyDown={onKeyDown}>
      {children}
    </div>
  );

  // Only the frames that listen publish. A funnel with no state layers anywhere
  // mounts not one provider, and the tree is the tree it always was.
  if (!interactive && !states) return drawn;
  return <PointerState.Provider value={at}>{drawn}</PointerState.Provider>;
}

/**
 * The half of a text a state layer may change — the same split `FrameLook`
 * draws, for the same reason. A label turning white inside a button somebody
 * is hovering is the case this exists for, and it is a colour, not a
 * behaviour.
 */
export type TextLook = {
  size?: number;
  weight?: number;
  color?: string;
  align?: "left" | "center" | "right";
  lineHeight?: number;
  width?: number | "fill" | "hug";
  height?: number | "fill" | "hug";
  grow?: boolean;
  style?: CSSProperties;
};

export type TextProps = {
  size?: number;
  weight?: number;
  color?: string;
  align?: "left" | "center" | "right";
  lineHeight?: number;
  /**
   * How wide the words' box is — the half of `align` that decides anything.
   *
   * `align` positions inline content *inside a box*, so it only says something
   * once the box is wider than the words. Text was the one brick with no way to
   * be given that width: `Frame`, `Image` and `Input` all read `width`, and the
   * canvas offers text the same Fixed / Hug / Fill it offers everything else —
   * so a title set to fill its header row and centre arrived here carrying
   * `width: "fill"`, was destructured away, and rendered as a shrink-to-fit
   * flex item hugging its glyphs. Centred on the canvas, hard against the back
   * button in the funnel, and nothing failed anywhere to say so.
   *
   * Spelled and resolved exactly as `FrameProps.width` is — `fill` is `100%`,
   * `hug` is `auto`, a number is points — because a designer picks one control
   * for both and two meanings behind it is the divergence this closes.
   */
  width?: number | "fill" | "hug";
  height?: number | "fill" | "hug";
  /** Takes the spare room on the parent's main axis. `Frame`'s prop, verbatim. */
  grow?: boolean;
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
  role?: BrickRole;
  ariaLabel?: string;
  ariaChecked?: boolean;
  tabStop?: boolean;
  testId?: string;
  style?: CSSProperties;
  /** How the words are drawn while the pointer is on them, or on their frame. */
  states?: BrickStates<TextLook>;
  /**
   * The copy, when it carries emphasis of its own.
   *
   * Set by the `ui.Text` factory when `t(key)` answers with runs, so a compiled
   * module keeps writing `ui.Text(props, t(key))` and neither the emitter nor
   * an artifact already published had to learn a new call. Plain copy never
   * sets it and takes the `children` path below, unchanged.
   */
  runs?: readonly TextRun[];
  children?: ReactNode;
};

/**
 * One run, as the element that says the most about it.
 *
 * **The element is chosen for meaning; the marks are always drawn as style.** A
 * run can be bold *and* italic *and* a link, and there is no single tag for
 * that — nesting three would put three boxes around fourteen characters for a
 * screen reader to walk. So the most significant mark picks the tag, which is
 * what an assistive technology announces, and every mark is spelled in CSS,
 * which is what a visitor sees. Neither half is approximate.
 *
 * **An anchor with no `href`**, because a link here goes to a *screen* and a
 * screen has no address — see `TextLink`. That is also why it needs the same
 * keyboard handling `Frame` needs: without `href` an `<a>` is not focusable and
 * not activatable, so `interactionProps` supplies the role, the tab stop and
 * Enter/Space exactly as it does for a clickable div.
 */
function runElement(run: TextRun, at: number, follow: FollowLink | null): ReactNode {
  const marks: CSSProperties = {
    fontWeight: run.bold ? 700 : undefined,
    fontStyle: run.italic ? "italic" : undefined,
    textDecoration: run.underline ? "underline" : undefined,
  };

  // Only when there is somewhere to go. Outside a funnel `follow` is null, and
  // announcing a link that cannot be followed is worse than drawing the words:
  // it is a promise the page cannot keep. The emphasis still renders.
  const link = run.link && follow ? run.link : null;
  if (!link) {
    const tag = run.bold ? "strong" : run.italic ? "em" : "span";
    return createElement(tag, { key: at, style: marks }, run.text);
  }

  return createElement(
    "a",
    {
      key: at,
      style: { ...marks, cursor: "pointer" },
      ...interactionProps({ onClick: () => follow?.(link), role: "link" }),
    },
    run.text,
  );
}

export function Text(props: TextProps) {
  const { onClick, disabled, role, ariaLabel, ariaChecked, tabStop, testId, states, runs, children } =
    props;

  /**
   * Text listens only for its own sake.
   *
   * Words inside a hovered option are the common case and they are covered by
   * the frame's context — this only attaches listeners when the copy itself is
   * clickable, or carries a layer nothing above it would publish.
   */
  const { at } = usePointerState(false);
  const {
    size: fontSize,
    weight,
    color,
    align,
    lineHeight,
    width,
    height,
    grow,
    style,
  } = withState(props as TextLook, states, at);
  const interactive = Boolean(onClick) && !disabled;
  // A hook, so it is called on every render of this component and not only when
  // there are runs to draw — React's rule, and the reason this is not inside the
  // branch below.
  const follow = useFollowLink();
  const spans = runs ? runsOf(runs) : null;

  return (
    <span
      style={{
        fontSize,
        fontWeight: weight,
        color,
        /**
         * Logical, not physical — `start` and `end` rather than `left` and
         * `right`.
         *
         * A designer aligning a heading left means "the side the line starts
         * on", which in Arabic is the right. CSS resolves `start` against the
         * `dir` the host sets from the locale, so this is the whole of RTL
         * text alignment on the web and it costs no plumbing: nothing has to
         * be told which language it is in.
         *
         * The authored vocabulary stays `left | center | right`, because that
         * is what a designer picks and what every artifact already published
         * carries. This is the translation, at the one place it is drawn.
         */
        textAlign: align === "left" ? "start" : align === "right" ? "end" : align,
        lineHeight: lineHeight ? `${lineHeight}px` : undefined,
        width: size(width),
        height: size(height),
        flexGrow: grow ? 1 : undefined,
        display: "block",
        cursor: interactive ? "pointer" : undefined,
        userSelect: interactive ? "none" : undefined,
        ...style,
      }}
      {...interactionProps({ onClick, disabled, role, ariaLabel, ariaChecked, tabStop, testId })}
    >
      {spans ? spans.map((run, at) => runElement(run, at, follow)) : children}
    </span>
  );
}

export type InputProps = {
  /** The declared variable this field reads from and writes to. */
  value?: string;
  onValue?: (next: string) => void;
  /** The visitor moved on from the field — when a form checks what was typed. */
  onLeave?: () => void;
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
  onLeave,
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
      onBlur={onLeave}
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
 * `Text` alone takes copy where the others take children.
 *
 * It is the one brick whose child *is* the funnel's words — `t(key)` — and
 * those may now answer with runs. Widening only this factory keeps a run list
 * out of `Frame`, where an array means "these siblings" and a run would render
 * as `[object Object]`.
 */
type TextFactory = (
  props?: Omit<TextProps, "children" | "runs">,
  children?: Children | RichText,
) => ReactNode;

/**
 * Children are spread rather than passed as one array, so React sees positional
 * children and does not demand keys. Generated code emits a plain array of
 * siblings; making it key-free is the runtime's job, not the compiler's.
 */
const spread = (children: Children): ReactNode[] =>
  Array.isArray(children) ? children : [children];

export const ui: {
  Frame: Factory<Omit<FrameProps, "children">>;
  Text: TextFactory;
  Image: Factory<ImageProps>;
  Input: Factory<InputProps>;
} = {
  Frame: (props, children) =>
    createElement(Frame, props as FrameProps, ...spread(children)),
  /**
   * Rich copy becomes a prop; everything else stays positional children.
   *
   * `spread` treats an array as a list of siblings, and a run list *is* an
   * array — so without this the runtime would hand React a bare `{ text: … }`
   * object as a child and throw. Deciding it here rather than in the emitter is
   * what keeps `ui.Text(props, t(key))` the only call there has ever been, so
   * an artifact compiled before any of this existed still runs.
   */
  Text: (props, children) =>
    isRuns(children)
      ? createElement(Text, { ...(props as TextProps), runs: children })
      : createElement(Text, props as TextProps, ...spread(children)),
  Image: (props) => createElement(Image, props as ImageProps),
  Input: (props) => createElement(Input, props as InputProps),
};

export type Ui = typeof ui;
