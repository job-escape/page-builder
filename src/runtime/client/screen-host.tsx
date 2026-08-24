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
 */
import type { ReactNode } from "react";

import type { ScreenPresentation } from "../compiler/manifest";

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
  keyboard: false,
};

export function ScreenHost({
  presentation,
  children,
}: {
  presentation: ScreenPresentation;
  children: ReactNode;
}) {
  return (
    <div
      data-funnel-screen=""
      style={{
        minHeight: "100%",
        /**
         * A fixed screen — a paywall with a pinned button — is one that must not
         * scroll even when its content would overflow. Everything else is left
         * to the document, which is what makes a browser screen scroll without
         * anyone asking it to.
         */
        ...(presentation.scroll ? {} : { height: "100dvh", overflow: "hidden" }),
      }}
    >
      {children}
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
