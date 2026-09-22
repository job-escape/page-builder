/**
 * An overlay is a frame rendered on top of the screen, which stays mounted
 * underneath. Position is what makes it a modal, a sheet or a side panel —
 * presentations of one mechanism, not separate components. `drawer` is the one
 * with behaviour of its own (it slides, and a swipe throws it away), and the one
 * a host can draw with its own component — see `configureDrawer`.
 *
 * The semantics the runtime supplies so a designer never thinks about them:
 * `role="dialog"`, `aria-modal`, focus moved in and restored to the opener on
 * close, and scroll locked behind. Escape and the back gesture are handled by
 * `<Funnel>`, because they belong to the stack rather than to any one overlay.
 */
import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

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

/**
 * What a host's drawer is handed — see `configureDrawer`.
 *
 * The frame is `children`, and it is the whole sheet: the designer drew its
 * surface, its corners and its handle, so a host drawer supplies behaviour —
 * the backdrop, sliding in, a swipe or a tap to close — and paints nothing of
 * its own around the frame.
 */
export type DrawerHostProps = {
  /** The visitor threw the drawer away. Close it; the runtime pops the stack. */
  onDismiss: () => void;
  /** Whether a swipe down or a tap on the backdrop may close it. */
  dismissible: boolean;
  /** Whether the backdrop dims the screen beneath. */
  dim: boolean;
  children: ReactNode;
};

let hostDrawer: ComponentType<DrawerHostProps> | undefined;

/**
 * Draw `position: "drawer"` overlays with the host's own drawer.
 *
 * A host with a design system has a drawer people already know — the app's
 * sheets slide, bounce and dismiss a particular way — and a popup should feel
 * like the rest of the app rather than like this package. Unset (and in every
 * host that never calls this) the built-in sheet draws it. Global, like
 * `configureTracking`: one host, one drawer.
 */
export function configureDrawer(drawer: ComponentType<DrawerHostProps> | undefined): void {
  hostDrawer = drawer;
}

export function Overlay({
  presentation,
  onDismiss,
  children,
}: {
  presentation: Presentation;
  onDismiss: () => void;
  children: ReactNode;
}) {
  if (presentation.position === "drawer") {
    const dismissible = presentation.closeOnOutside !== false;
    const dim = presentation.dim !== false;
    const Host = hostDrawer;
    return Host ? (
      <Host onDismiss={onDismiss} dismissible={dismissible} dim={dim}>
        {children}
      </Host>
    ) : (
      <DrawerSheet onDismiss={onDismiss} dismissible={dismissible} dim={dim}>
        {children}
      </DrawerSheet>
    );
  }
  return (
    <PanelOverlay presentation={presentation} onDismiss={onDismiss}>
      {children}
    </PanelOverlay>
  );
}

/** How far down, as a share of its height, a released drawer has to be to close. */
const CLOSE_AT = 0.25;
/** How long the slide in and out takes. */
const SLIDE_MS = 240;

/**
 * The built-in drawer — what `position: "drawer"` draws where no host drawer
 * was configured: the console's preview, the funnel app.
 *
 * Docked to the bottom edge at most 480 wide, slid up on arrival, and thrown
 * away by dragging it down past a quarter of its height or tapping the
 * backdrop. A drag that starts on a control is the control's: buttons, links
 * and fields are pressed, not dragged, and a sheet scrolled into its content
 * scrolls rather than closes.
 */
function DrawerSheet({ onDismiss, dismissible, dim, children }: DrawerHostProps) {
  const panel = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ y: number; id: number } | null>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    // One frame at the resting position below the edge, then the slide.
    const frame = requestAnimationFrame(() => setShown(true));
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, []);

  const close = () => {
    if (leaving) return;
    setLeaving(true);
    setDrag(null);
    window.setTimeout(onDismiss, SLIDE_MS);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dismissible || leaving) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, textarea, select, [role='button'], [role='link']")) return;
    if ((panel.current?.scrollTop ?? 0) > 0) return;
    start.current = { y: event.clientY, id: event.pointerId };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!start.current || start.current.id !== event.pointerId) return;
    const dy = Math.max(0, event.clientY - start.current.y);
    if (dy > 4 && !panel.current?.hasPointerCapture(event.pointerId)) {
      panel.current?.setPointerCapture(event.pointerId);
    }
    setDrag(dy);
  };
  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!start.current || start.current.id !== event.pointerId) return;
    start.current = null;
    const height = panel.current?.offsetHeight ?? 1;
    if ((drag ?? 0) > height * CLOSE_AT) close();
    else setDrag(null);
  };

  const offset = leaving || !shown ? "100%" : `${drag ?? 0}px`;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        background: dim ? "rgba(15,23,42,0.45)" : "transparent",
        opacity: leaving || !shown ? 0 : 1,
        transition: `opacity ${SLIDE_MS}ms ease`,
      }}
      onMouseDown={(event) => {
        if (dismissible && event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        style={{
          outline: "none",
          width: "100%",
          maxWidth: 480,
          maxHeight: "100%",
          overflowY: "auto",
          touchAction: dismissible ? "pan-x" : undefined,
          transform: `translateY(${offset})`,
          transition: drag === null ? `transform ${SLIDE_MS}ms cubic-bezier(0.32, 0.72, 0, 1)` : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function PanelOverlay({
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
