/**
 * The chrome a screen sits in — everything about the surface, nothing about the
 * design drawn on it.
 *
 * Not a brick. No tree can name it, it is not in the registry, and a designer
 * never places one. It is what the runtime wraps around whichever screen the
 * navigator says is current, and it is the single place where "how does this
 * platform work" is allowed to live.
 *
 * The native runtime has its own, doing considerably more — safe-area insets, a
 * keyboard-avoiding view, a scroll container. This one does almost nothing,
 * because a browser already does almost all of it: the document scrolls, there
 * is no system chrome to clear, and a keyboard does not reflow the page.
 *
 * That asymmetry is the point. Both read the *same* `ScreenPresentation` off the
 * artifact and each honours what it can — rather than the artifact describing
 * one platform and the other translating.
 *
 * ## The entrance
 *
 * A screen with a `transition` plays it when it mounts — and it mounts on every
 * navigation, because `<Funnel>` keys the host by the screen. An entrance only:
 * the screen being left is gone at once, so nothing is ever drawn twice and no
 * tap lands on a screen that is on its way out. A screen with none renders the
 * exact markup it always did.
 */
import type { CSSProperties, ReactNode } from "react";

import type { ScreenPresentation } from "../compiler/manifest";
import type { ScreenTransition } from "../compiler/source";

/**
 * What a screen gets when the manifest predates per-screen presentation.
 *
 * Matches `presentationOf`'s defaults exactly. It exists for older artifacts
 * only — a current manifest carries every field resolved, precisely so a
 * renderer never has to reach for this.
 */
export const DEFAULT_PRESENTATION: ScreenPresentation = {
  scroll: true,
  bleed: false,
  statusBar: "auto",
  transition: "none",
  keyboard: false,
};

/**
 * The entrances, as keyframes. Written into the page by the host that uses them
 * rather than into a stylesheet a host would have to remember to import — and
 * switched off for anyone whose system asks for less motion.
 */
const KEYFRAMES = `
@keyframes pb-screen-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes pb-screen-slide-forward { from { opacity: 0; transform: translateX(24px) } to { opacity: 1; transform: none } }
@keyframes pb-screen-slide-back { from { opacity: 0; transform: translateX(-24px) } to { opacity: 1; transform: none } }
@keyframes pb-screen-push-forward { from { transform: translateX(100%) } to { transform: none } }
@keyframes pb-screen-push-back { from { transform: translateX(-100%) } to { transform: none } }
@media (prefers-reduced-motion: reduce) { [data-funnel-entrance] { animation: none !important } }
`;

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/** The animation for an entrance, or nothing for `none` and for older artifacts. */
function entranceOf(
  transition: ScreenTransition | undefined,
  direction: "forward" | "back",
): string | undefined {
  if (transition === "fade") return `pb-screen-fade 240ms ${EASE} both`;
  if (transition === "slide") return `pb-screen-slide-${direction} 280ms ${EASE} both`;
  if (transition === "push") return `pb-screen-push-${direction} 320ms ${EASE} both`;
  return undefined;
}

export function ScreenHost({
  presentation,
  direction = "forward",
  children,
}: {
  presentation: ScreenPresentation;
  /** Which way the visitor went to get here — a slide and a push reverse on back. */
  direction?: "forward" | "back";
  children: ReactNode;
}) {
  const animation = entranceOf(presentation.transition, direction);

  const host: CSSProperties = {
    minHeight: "100%",
    /**
     * A fixed screen — a paywall with a pinned button — is one that must not
     * scroll even when its content would overflow. Everything else is left
     * to the document, which is what makes a browser screen scroll without
     * anyone asking it to.
     */
    ...(presentation.scroll ? {} : { height: "100dvh", overflow: "hidden" }),
    // A screen pushed in from the edge starts outside the host; clipped, so
    // the page never grows a sideways scrollbar for the length of the push.
    ...(animation ? { overflowX: "clip" } : {}),
  };

  return (
    <div data-funnel-screen="" style={host}>
      {animation ? (
        <>
          <style>{KEYFRAMES}</style>
          <div
            data-funnel-entrance=""
            style={{
              minHeight: "100%",
              height: presentation.scroll ? undefined : "100%",
              animation,
            }}
          >
            {children}
          </div>
        </>
      ) : (
        children
      )}
    </div>
  );
}

/**
 * `bleed`, `statusBar` and `keyboard` are read here and deliberately ignored.
 *
 * A browser has no system chrome to run under, no status bar to tint, and its
 * keyboard does not displace the viewport. Honouring them would mean inventing
 * behaviour the platform does not have — and a screen that looks different on
 * web because it declared something only a phone has is the drift this whole
 * arrangement exists to prevent.
 */
