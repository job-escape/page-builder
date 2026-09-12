/**
 * Where the visitor is: one screen, plus a stack of overlays on top of it.
 *
 * `show` is one verb. Navigating and opening an overlay both render a frame —
 * the only difference is what happens to what is already on screen, replaced or
 * kept mounted underneath. That is a parameter, not a second function, so a
 * designer turning a bottom sheet into a full screen changes a dropdown rather
 * than rewiring the interaction.
 *
 * Two behaviours here are the ones that get funnels wrong in the wild:
 *
 * - **Back closes the top overlay before it navigates.** On mobile, back while a
 *   sheet is open must dismiss the sheet, not leave the funnel. Getting this
 *   wrong costs sessions and reads as the site being broken.
 * - **Navigating cancels work owned by the screen being left.** A loader ramping
 *   a variable on an abandoned screen would otherwise keep writing to state
 *   nobody is looking at, and could navigate again when it finished.
 */

export type Presentation = {
  as?: "replace" | "overlay";
  /**
   * Where the frame sits over the screen — and `fill` is the one that is not a
   * placement at all.
   *
   * The four placements put a *panel* somewhere: the frame is as big as its
   * content and the runtime decides where that content lands. `fill` hands the
   * whole viewport to the frame instead, so where things sit inside it is the
   * frame's own layout — its padding, its align and justify — rather than
   * anything chosen here. That is what a designer means by drawing a dialog at
   * the size of the page and putting the body where they want it: a sheet is
   * then `justify: "end"` on the frame, not `position: "bottom"` on the step.
   */
  position?: "center" | "bottom" | "top" | "side" | "fill";
  dim?: boolean;
  closeOnOutside?: boolean;
};

export type OverlayFrame = { id: string; presentation: Presentation };

export type NavigationState = {
  /** The screen underneath. Always present. */
  screen: string;
  /** Innermost last. Empty when nothing is open. */
  overlays: OverlayFrame[];
  /**
   * Which way the visitor last moved between screens — on, or back. A screen's
   * entrance plays the other way on back, so a visitor can feel where they went.
   */
  direction: "forward" | "back";
};

export type NavigatorOptions = {
  entry: string;
  /** Per-frame presentation defaults, overridable at each call site. */
  defaults?: Record<string, Presentation>;
  /** Cancels anything the screen being left owns — timers, ramps, requests. */
  onLeaveScreen?: (screen: string) => void;
  /** A target that is not in the manifest. Reported, never thrown. */
  onUnknown?: (target: string) => void;
  /** Known frame ids. Absent skips the check — preview may render one frame. */
  known?: ReadonlySet<string>;
};

export type Navigator = ReturnType<typeof createNavigator>;

export function createNavigator(options: NavigatorOptions) {
  const { entry, defaults = {}, onLeaveScreen, onUnknown, known } = options;

  let screen = entry;
  let overlays: OverlayFrame[] = [];
  let direction: NavigationState["direction"] = "forward";
  /** Screens visited, innermost last. Overlays are not history entries. */
  let history: string[] = [];

  /**
   * Cached, and rebuilt only when something actually moved.
   *
   * `useSyncExternalStore` compares snapshots by reference and re-reads on every
   * render. Returning a fresh object each call therefore looks like a change on
   * every render and loops until React gives up with "maximum update depth
   * exceeded". The store keeps the same discipline for the same reason.
   */
  let snapshot: NavigationState = { screen, overlays, direction };

  const listeners = new Set<() => void>();
  const notify = () => {
    snapshot = { screen, overlays, direction };
    listeners.forEach((listener) => listener());
  };

  const exists = (target: string): boolean => {
    if (known && !known.has(target)) {
      onUnknown?.(target);
      return false;
    }
    return true;
  };

  function show(target: string, presentation: Presentation = {}): void {
    if (!exists(target)) return;

    const merged = { ...(defaults[target] ?? {}), ...presentation };

    if (merged.as === "overlay") {
      // Re-opening the overlay already on top is a no-op rather than a stack of
      // duplicates — a double-tap on the opener should not need two dismissals.
      if (overlays[overlays.length - 1]?.id === target) return;
      overlays = [...overlays, { id: target, presentation: merged }];
      notify();
      return;
    }

    if (target === screen && overlays.length === 0) return;

    // Anything the outgoing screen started stops now, before it can write to
    // state that belongs to a screen nobody is on.
    onLeaveScreen?.(screen);
    history = [...history, screen];
    screen = target;
    direction = "forward";
    // Navigating dismisses whatever was open above the screen being left.
    overlays = [];
    notify();
  }

  /** Pop the top overlay. Named for the stack, because "the dialog" is ambiguous once one opens another. */
  function close(): boolean {
    if (overlays.length === 0) return false;
    overlays = overlays.slice(0, -1);
    notify();
    return true;
  }

  /**
   * The back gesture, wherever it comes from — hardware button, Escape, a
   * designer's back control. Overlays first, then history.
   */
  function back(): boolean {
    if (close()) return true;
    if (history.length === 0) return false;

    onLeaveScreen?.(screen);
    screen = history[history.length - 1];
    history = history.slice(0, -1);
    direction = "back";
    notify();
    return true;
  }

  const state = (): NavigationState => snapshot;
  const canGoBack = (): boolean => overlays.length > 0 || history.length > 0;

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function reset(): void {
    onLeaveScreen?.(screen);
    screen = entry;
    overlays = [];
    history = [];
    direction = "forward";
    notify();
  }

  return { show, close, back, state, canGoBack, subscribe, reset };
}
