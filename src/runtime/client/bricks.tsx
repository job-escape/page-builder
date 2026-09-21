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
import type { FrameMotion, FrameTransition } from "../motion";
import { isRuns, runsOf, type RichText, type TextRun } from "../rich-text";
import { motionCss, transitionCss, useWebMotion } from "./motion-css";

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

/*
  The runtime's words, and the CSS spellings of the same values beside them.
  A design written with `justify: "space-between"` — which is what a model
  reaching for flexbox writes — was drawn as though it said nothing, here and
  in the native brick and on the canvas. The native brick reads the same
  aliases, so the two renderers still agree.
*/
// Every runtime word, and room for the aliases beside them.
const ALIGN: Record<Align, string> & Record<string, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
  "flex-start": "flex-start",
  "flex-end": "flex-end",
};

const JUSTIFY: Record<Justify, string> & Record<string, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
  "space-between": "space-between",
  "flex-start": "flex-start",
  "flex-end": "flex-end",
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
/**
 * Where a brick sits inside a parent that places its children itself.
 *
 * A frame with no auto layout positions what is in it by hand — a label at the
 * top of an artboard, a button two thirds of the way down — and that is what
 * the canvas draws. The published funnel drew something else: the runtime had
 * no vocabulary for a position at all, so the parent laid its children out as
 * ordinary block flow and every one of them stacked against the top left
 * corner. Nothing failed anywhere; the numbers simply never crossed.
 *
 * They are points from the parent's content box — its padding box, since the
 * canvas measures a child from inside its parent's padding, which is what
 * `box-sizing: border-box` and an absolutely positioned child agree on.
 *
 * Only meaningful under a parent that says `places`. A child carrying one
 * without such a parent would anchor to whatever ancestor happened to be
 * positioned, which is a worse answer than the flow it replaced — so the two
 * props are emitted together, by the one thing that can see both.
 */
export type Placement = {
  x?: number;
  y?: number;
};

/** A placement as the two properties that make it — nothing, when there is none. */
export function placedCss(placement: Placement, flow?: ParentFlow | null): CSSProperties | undefined {
  if (placement.x === undefined && placement.y === undefined) return undefined;
  /*
    A parent that lays its children out is the one that decides where they go.

    Two points mean "my parent placed me here", and they mean nothing inside a
    row or a column, where the parent's layout decides the order and the
    spacing. Honouring them there takes the brick out of the flow and drops it
    at the nearest positioned ancestor's corner — which is what a component
    instance did after publish: an expanded button carried the coordinates its
    variant had on the component's own canvas, so two buttons in a footer row
    were absolutely positioned at the top of the page, over the heading, and the
    row collapsed to nothing behind them.

    The coordinates are not wrong to *carry*. The same frame is placed inside
    its definition and in flow inside a row, and a copy of it cannot know which
    of the two it landed in. Which of them applies is exactly what the parent
    knows, so the parent is what answers.
  */
  if (flow === "row" || flow === "column") return undefined;
  return { position: "absolute", left: placement.x ?? 0, top: placement.y ?? 0 };
}

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
  /** This brick's own pointer, without what it inherits — what press-scale reads. */
  own: BrickState;
  handlers: Record<string, (() => void) | undefined>;
} {
  const inherited = useContext(PointerState);
  const [own, setOwn] = useState<BrickState>(NO_STATE);

  const at: BrickState = {
    hover: own.hover || inherited.hover,
    press: own.press || inherited.press,
  };

  if (!tracked) return { at: inherited, own: NO_STATE, handlers: {} };

  return {
    at,
    own,
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
export type FrameLook = Placement & {
  layout?: FrameLayout;
  /**
   * This frame places its children itself, from their own `x` / `y`.
   *
   * Written beside `layout: "none"` rather than inferred from it, so a frame
   * that has always laid its children out as block flow goes on doing exactly
   * that: the positioning context appears only where something was actually
   * drawn into one. See `Placement`.
   */
  places?: boolean;
  gap?: number;
  padding?: number | [number, number] | [number, number, number, number];
  /** A number of pixels, `fill`, `hug`, or a percent of the parent — `"42%"`. */
  width?: number | "fill" | "hug" | `${number}%`;
  height?: number | "fill" | "hug" | `${number}%`;
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
  /** How a changed width, height, opacity or fill glides — see `FrameTransition`. */
  transition?: FrameTransition;
  /** A motion it plays on its own — see `FrameMotion`. */
  motion?: FrameMotion;
  /** "The same frame" across screens, for a transition to carry — see `carriedLooks`. */
  motionKey?: string;
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

const size = (value: FrameProps["width"] | TextProps["width"]): string | number | undefined => {
  if (value === undefined) return undefined;
  if (value === "fill") return "100%";
  if (value === "hug") return "auto";
  return value;
};

/**
 * How the frame above this one lays its children out — `null` for a screen's
 * root, which has no frame above it at all.
 *
 * The web half of native's `FlowContext`, and it answers the same two questions
 * that one does:
 *
 * - **Am I the root?** `null`. A `fill` height means something different at the
 *   top of a screen than anywhere else: inside a frame it is a share of a parent
 *   that has a height, and at the top it is a claim on the viewport, which no
 *   ancestor here has a height for.
 * - **Does my parent place me?** Only a parent with no auto-layout does. Two
 *   points on a brick mean nothing inside a row or a column — see `placedCss`.
 */
type ParentFlow = "none" | "row" | "column";
const Parent = createContext<ParentFlow | null>(null);

/**
 * Whether an ancestor is already a real `<button>`.
 *
 * HTML says a button may not contain one, and a designer's tree says nothing
 * about that — a card that takes a tap with a "Learn more" inside it that takes
 * its own is an ordinary thing to draw. So the outermost clickable frame
 * becomes the button and anything clickable inside it stays a div with
 * `role="button"`, which is what every frame was until now: no worse than
 * before, and never invalid.
 */
const InsideButton = createContext(false);

/**
 * What every page is at least — the viewport, whatever it says about its height.
 *
 * **A property of a page, not something a page declares.** It was read off
 * `height: "fill"` at first, which made filling the viewport a thing a designer
 * had to remember to ask for, and left every screen that had not asked drawn as
 * tall as whatever happened to be on it — background stopping at the content's
 * edge, a short screen floating above white. A page occupies the page. There is
 * no second sensible answer to choose between, so there is nothing to declare.
 *
 * `100dvh` needs no ancestor, which matters because no ancestor has a height to
 * give: not the runtime's host, which asks for its own minimum, and not `html`
 * or `body`, which no host here sizes. A percentage would resolve to `auto` and
 * do nothing, which is exactly what `height: 100%` was doing before this.
 *
 * `min-height` keeps the growth: the viewport when the content is shorter,
 * taller when it is not, and the document scrolls the difference — what a
 * browser does unasked, and what `flexGrow: 1, flexBasis: "auto"` already means
 * on the native root.
 *
 * `dvh` rather than `vh` so a phone browser's collapsing chrome moves it instead
 * of hiding content behind it.
 *
 * The root only. A nested `fill` is a share of a parent that has a height and
 * still says `100%`.
 */
const PAGE_MIN_HEIGHT: CSSProperties = { minHeight: "100dvh" };

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

/**
 * The press every tappable brick answers with: a slight shrink while the
 * pointer is down on it, and back as it lifts.
 *
 * Its own press only — a button inside a pressed card does not shrink twice —
 * and composed with whatever transform the design already set rather than
 * replacing it. A brick nothing can tap is left exactly as it was drawn.
 */
function pressScale(
  interactive: boolean,
  pressed: boolean,
  style: CSSProperties | undefined,
): CSSProperties {
  if (!interactive) return {};
  const authored = style?.transform;
  return {
    transform: pressed ? [authored, "scale(0.97)"].filter(Boolean).join(" ") : authored,
    transition: [style?.transition, "transform 120ms ease-out"].filter(Boolean).join(", "),
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
  const { at, own, handlers } = usePointerState(interactive || Boolean(states));
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
    places,
    style,
  } = withState(props as FrameLook, states, at);

  const glide = transitionCss(props.transition);
  const shown = useWebMotion({
    motion: props.motion,
    transition: props.transition,
    motionKey: props.motionKey,
    look: { width, height, opacity },
  });
  const moving = motionCss(props.motion);
  const withGlide: CSSProperties | undefined =
    glide || style?.transition
      ? { ...style, transition: [glide, style?.transition].filter(Boolean).join(", ") }
      : style;

  const parentFlow = useContext(Parent);
  const root = parentFlow === null;
  const rootFill = root && (shown.height as FrameProps["height"]) === "fill";
  /**
   * A `fill` along the parent's flow grows into the parent's room, as well as
   * claiming all of it.
   *
   * `100%` alone is only half the answer, and the half CSS refuses whenever the
   * parent's `height` is `auto`: a percentage resolves against the *declared*
   * height of the containing block, and a `min-height` is not one. Every page
   * is `min-height: 100dvh` with `height: auto` (`PAGE_MIN_HEIGHT`), so on any
   * window taller than the content the page stretched to the viewport and
   * nothing inside it followed — a screen's own background stopping in mid-air
   * with the document's white below it, which is the very thing that minimum
   * was added to end. It only showed on a screen whose fill is on a child
   * rather than on the screen, because there the stretched box paints nothing.
   *
   * `flexGrow` is answered by flex layout instead of by percentage resolution,
   * and flex distributes the parent's *used* size — so this reaches the room a
   * minimum made and the `100%` cannot. The two together are "at least my
   * content, and all of the leftover": where the parent is definite the basis
   * is already the whole of it and there is no leftover to grow into, so
   * nothing about a screen that states a height changes.
   *
   * Along the flow only. `flexGrow` is a claim on the main axis, and a frame
   * set to fill the *width* inside a column is asking about the cross one —
   * growing it there is what made a width-fill frame take a third of the
   * screen's height, which is the same mistake `nativeSize` records having
   * made. The cross axis keeps `100%`, which is definite there because the
   * parent's cross size is.
   */
  const fillsFlow =
    (parentFlow === "column" && (shown.height as FrameProps["height"]) === "fill") ||
    (parentFlow === "row" && (shown.width as FrameProps["width"]) === "fill");
  /** What this frame hands its own children — the same word native hands down. */
  const ownFlow: ParentFlow = layout === "column" || layout === "row" ? layout : "none";
  /*
    The minimum goes first so a page that states a height still keeps it, and
    the two settle the way CSS settles them — the larger wins. A page saying
    `fill` states nothing, so its `height` is dropped rather than written as the
    `100%` that would resolve to `auto` anyway: a reader finding both would have
    to work out which of them does nothing before trusting either.
  */

  const css: CSSProperties = {
    display: layout === "none" ? "block" : "flex",
    flexDirection: layout === "row" ? "row" : layout === "column" ? "column" : undefined,
    gap,
    padding: pad(padding),
    width: size(shown.width as FrameProps["width"]),
    ...(root ? PAGE_MIN_HEIGHT : {}),
    height: rootFill ? undefined : size(shown.height as FrameProps["height"]),
    alignItems: align ? ALIGN[align] : undefined,
    justifyContent: justify ? JUSTIFY[justify] : undefined,
    background: fill,
    border,
    borderRadius: radius,
    opacity: shown.opacity as number | undefined,
    boxShadow: shadow,
    flexGrow: grow || fillsFlow ? 1 : undefined,
    overflowY: scroll ? "auto" : undefined,
    boxSizing: "border-box",
    // What its children are placed against, and where it is placed itself —
    // in that order, because a frame that does both is absolute, not relative.
    position: places ? "relative" : undefined,
    ...placedCss(props, parentFlow),
    cursor: interactive ? "pointer" : undefined,
    // A frame that takes clicks must also take keys; see the handler below.
    userSelect: interactive ? "none" : undefined,
    ...moving,
    ...withGlide,
    ...pressScale(interactive, own.press, withGlide),
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

  /**
   * A button a designer drew is a `<button>`, not a div that says it is one.
   *
   * `role="button"` buys the announcement and nothing else. A real element is
   * what the rest of the platform is built on: Enter and Space without a
   * handler of our own, the focus ring the visitor's browser and OS agreed on,
   * the form semantics, `:disabled`, and — the one that brought this up —
   * every tool that goes looking for a button, from a test to an extension to
   * an analytics script, finding it.
   *
   * Wherever the design says it is one — `role: "button"` — whether or not
   * this funnel wired a click to it. That condition was here at first and it
   * excluded the very case that asked for this: a dialog's "Maybe later" and
   * "Add to portfolio" carry the role from their component and no click of
   * their own, because what they do is decided by the host showing the dialog,
   * and a host looking for the dialog's buttons found two divs. A button with
   * nothing wired is still a button; it is also what an unwired `<button>` is
   * on any page. A disabled one gets the real `disabled`, which is what takes
   * it out of the tab order and the click, exactly as the div's absent
   * `tabindex` did. A `dialog` or `radio` role keeps its div: those are not
   * buttons, and the ARIA name is the whole of what they claim.
   *
   * **Never inside another.** HTML forbids it and a designer's tree says
   * nothing about that, so the outermost clickable frame takes the element and
   * anything clickable within it stays exactly what it was. See `InsideButton`.
   */
  // Read unconditionally: `&&` would skip the hook on the renders where this
  // frame is not clickable, and a hook that is sometimes called is the one
  // rule React has no recovery from.
  const insideButton = useContext(InsideButton);
  const asButton = role === "button" && !insideButton;

  /*
    A button's user-agent styles are not nothing, and this brick's whole
    premise is that what a designer drew is what ships. Four of them can show
    through where the design says nothing: the grey face, the bevelled border,
    the padding, and the browser's own font instead of the page's. They are
    written here rather than folded into `css` so that a frame that stays a div
    keeps byte for byte the styles it has always had.
  */
  const buttonReset: CSSProperties = asButton
    ? {
        appearance: "none",
        background: fill ?? "transparent",
        border: border ?? "none",
        padding: pad(padding) ?? 0,
        margin: 0,
        font: "inherit",
        color: "inherit",
        textAlign: "inherit",
      }
    : {};

  const body = (
    /* This frame's own flow, handed down — the same thing native's
       `FlowContext` carries, and what tells a child whether it is placed by
       this frame or laid out by it. It also means no descendant reads itself
       as the screen's root. */
    <Parent.Provider value={ownFlow}>{children}</Parent.Provider>
  );

  const drawn = createElement(
    asButton ? "button" : "div",
    {
      // `type`, always: a button inside a form submits it otherwise, and a
      // checkout screen is a form.
      type: asButton ? "button" : undefined,
      disabled: asButton && disabled ? true : undefined,
      // The reset last: `css` names `background`, `border` and `padding` even
      // when the design leaves them empty, and an `undefined` spread over the
      // reset would hand the element straight back to the browser's grey. The
      // reset already carries the design's value wherever there is one.
      style: asButton ? { ...css, ...buttonReset } : css,
      "data-pb-motion": moving.animation ? "" : undefined,
      ...handlers,
      ...interaction,
      // The element does this itself, and doing it twice fires the click twice
      // — Enter on a real button is a click already. A group's arrow keys are
      // not a button's and still belong here.
      onKeyDown: asButton ? group.onKeyDown : onKeyDown,
      // Implicit on the element, and a role repeating the tag is noise a
      // screen reader reads out of two places.
      role: asButton ? undefined : interaction.role,
    },
    asButton ? <InsideButton.Provider value>{body}</InsideButton.Provider> : body,
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
  /**
   * The box the words sit in — a highlighted paragraph is a text frame with a
   * fill, a padding and a radius, and a designer draws one by giving those to
   * the words rather than by wrapping them in a frame nobody can see.
   *
   * They reached here already: the compiler emits them and the artifact carries
   * them. Both renderers dropped them on the floor, so a sentence a designer
   * had tinted pale blue shipped as plain copy on the phone *and* in the
   * browser, while the canvas drew it as authored.
   */
  fill?: string;
  padding?: number | [number, number] | [number, number, number, number];
  radius?: number | string;
  style?: CSSProperties;
};

export type TextProps = Placement & {
  /** A motion the words play on their own — an entrance, a pulse. See `FrameMotion`. */
  motion?: FrameMotion;
  /** How a changed colour or opacity glides. See `FrameTransition`. */
  transition?: FrameTransition;
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
  /** The box the words sit in — `Frame`'s props, verbatim. See `TextLook`. */
  fill?: string;
  padding?: number | [number, number] | [number, number, number, number];
  radius?: number | string;
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
   * clickable, which is also when it shrinks under a press.
   */
  const tappable = Boolean(onClick) && !disabled;
  const { at, own, handlers } = usePointerState(tappable);
  const {
    size: fontSize,
    weight,
    color,
    align,
    lineHeight,
    width,
    height,
    grow,
    fill,
    padding,
    radius,
    style,
  } = withState(props as TextLook, states, at);
  const interactive = Boolean(onClick) && !disabled;
  // A hook, so it is called on every render of this component and not only when
  // there are runs to draw — React's rule, and the reason this is not inside the
  // branch below.
  const follow = useFollowLink();
  const spans = runs ? runsOf(runs) : null;
  useWebMotion({ motion: props.motion, transition: undefined, motionKey: undefined, look: {} });
  const textMotion = motionCss(props.motion);
  const textGlide = transitionCss(props.transition);
  const textStyle: CSSProperties | undefined =
    textGlide || style?.transition
      ? { ...style, transition: [textGlide, style?.transition].filter(Boolean).join(", ") }
      : style;

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
        ...placedCss(props),
        lineHeight: lineHeight ? `${lineHeight}px` : undefined,
        width: size(width),
        /**
         * A hugging width is the words' own width, so it never wraps.
         *
         * `auto` alone is a flex item that shrinks: "Maybe later" in a 120px
         * button with 16px of padding a side is a pixel or two wider than the
         * 88px left in a browser, so it broke onto two lines, 48px of text in a
         * 40px button — and a parent that scrolls then scrolled by the overflow
         * when somebody dragged across the words. The canvas draws it on one
         * line, as Figma's auto width does, and so does native, where a Yoga
         * item does not shrink. `pre` rather than `nowrap` so the line breaks a
         * designer typed stay line breaks, as they are on both of those.
         */
        whiteSpace: width === "hug" ? "pre" : undefined,
        height: size(height),
        flexGrow: grow ? 1 : undefined,
        // The words' own box — spelled exactly as `Frame` spells it.
        background: fill,
        padding: pad(padding),
        borderRadius: radius,
        boxSizing: "border-box",
        display: "block",
        cursor: interactive ? "pointer" : undefined,
        userSelect: interactive ? "none" : undefined,
        ...textMotion,
        ...textStyle,
        ...pressScale(interactive, own.press, textStyle),
      }}
      data-pb-motion={textMotion.animation ? "" : undefined}
      {...handlers}
      {...interactionProps({ onClick, disabled, role, ariaLabel, ariaChecked, tabStop, testId })}
    >
      {spans ? spans.map((run, at) => runElement(run, at, follow)) : children}
    </span>
  );
}

export type InputProps = Placement & {
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
  ...placement
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
        ...placedCss(placement),
        ...style,
      }}
    />
  );
}

export type ImageProps = Placement & {
  src: string;
  alt?: string;
  width?: number | "fill";
  height?: number;
  radius?: number;
  fit?: "cover" | "contain";
  style?: CSSProperties;
};

export function Image({
  src,
  alt = "",
  width,
  height,
  radius,
  fit = "cover",
  style,
  ...placement
}: ImageProps) {
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
        ...placedCss(placement),
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
  /**
   * A host component the design leaves room for — see the `slot` node.
   * Created here rather than called, so the component keeps its own hooks.
   */
  Slot: (component: unknown, props: Record<string, unknown>) => ReactNode;
} = {
  Slot: (component, props) =>
    createElement(component as (props: Record<string, unknown>) => ReactNode, props),
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
