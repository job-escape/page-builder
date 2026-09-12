/**
 * An overlay is a frame rendered on top of the screen, which stays mounted
 * underneath. Position is what makes it a modal, a drawer or a side panel —
 * three presentations of one mechanism, not three components.
 *
 * The semantics the runtime supplies so a designer never thinks about them:
 * `role="dialog"`, `aria-modal`, focus moved in and restored to the opener on
 * close, and scroll locked behind. Escape and the back gesture are handled by
 * `<Funnel>`, because they belong to the stack rather than to any one overlay.
 */
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

import type { Presentation } from "../navigation";

const PLACEMENT: Record<string, CSSProperties> = {
  center: { alignItems: "center", justifyContent: "center" },
  bottom: { alignItems: "flex-end", justifyContent: "center" },
  top: { alignItems: "flex-start", justifyContent: "center" },
  side: { alignItems: "stretch", justifyContent: "flex-end" },
  /**
   * The frame takes the viewport, and places its own content.
   *
   * Nothing to align: under `fill` the frame *is* the surface, so a sheet is
   * something the frame's own layout says — `justify: "end"` on it — rather
   * than something this map decides. Only the cross axis is set, because
   * `justify-content: stretch` is not a thing flexbox does: it computes to
   * `flex-start`, and a value that does nothing under a comment saying it
   * matters is worse than no value. The main axis is covered by the panel's own
   * height below.
   */
  fill: { alignItems: "stretch" },
};

export function Overlay({
  presentation,
  onDismiss,
  children,
}: {
  presentation: Presentation;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement | null>(null);
  const position = presentation.position ?? "center";

  useEffect(() => {
    // Focus moves in so a keyboard user is not left behind on the screen below,
    // and returns to whatever opened it so their place is not lost.
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus();

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        background: presentation.dim === false ? "transparent" : "rgba(15,23,42,0.45)",
        zIndex: 1000,
        ...PLACEMENT[position],
      }}
      // Only a click that starts and ends on the backdrop dismisses. A drag that
      // began inside the panel and released outside must not close it.
      onMouseDown={(event) => {
        if (presentation.closeOnOutside === false) return;
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        style={{
          outline: "none",
          maxHeight: "100%",
          overflowY: "auto",
          width: position === "side" ? undefined : "100%",
          /**
           * A definite height, for `fill` only.
           *
           * The four placements leave this auto on purpose — a panel is as tall
           * as its content, and that is what lets the flex layer centre or dock
           * it. But a percentage height inside resolves against *this* box, so a
           * frame asking to fill got `height: 100%` of a parent that was only as
           * tall as the frame itself, and collapsed. A dialog drawn at the size
           * of the page then hugged its own body, and `justify: "end"` on it had
           * no room left to push anything to the bottom.
           */
          ...(position === "fill" ? { height: "100%" } : {}),
          borderRadius:
            position === "bottom"
              ? "16px 16px 0 0"
              : position === "center"
                ? 16
                : 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}
