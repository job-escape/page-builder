/**
 * A screen's pinned frames, held still in a browser — see `runtime/pin`.
 *
 * The document is what scrolls, so the pins sit in two layers of no height
 * around the screen's content: one before it, sticky to the top of the
 * viewport, and one after it, sticky to the bottom. Each pin is placed inside
 * its layer at its insets. A sticky layer stays inside the screen it belongs
 * to — its column, not the browser window — so on a wide window `left: 50` is
 * from the funnel's edge, and a screen that does not scroll (its host is the
 * viewport) holds them the same way.
 *
 * Neither layer takes room, so a pin floats over the content. The room a bar
 * needs is kept by the walk (`withRoom`) from the heights measured here.
 */
import {
  createElement,
  Fragment,
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";

import type { DrawnPin, PinEdge, ReserveReport } from "../pin";
import { Parent } from "./parent-flow";

/** Over the content, and over anything the content stacks. */
const PINNED_LAYER = 30;

/** Across the screen: between both sides, at one of them, or centred. */
function acrossOf(pin: DrawnPin["pin"]): CSSProperties {
  if (pin.left !== undefined && pin.right !== undefined && pin.maxWidth !== undefined) {
    // Stretched up to a width, then centred in what is left: with both sides
    // set and a cap, the browser shares the leftover between the auto margins.
    return { left: pin.left, right: pin.right, maxWidth: pin.maxWidth, marginLeft: "auto", marginRight: "auto" };
  }
  if (pin.left !== undefined || pin.right !== undefined) return { left: pin.left, right: pin.right };
  // Centred: the box spans the screen to centre what it holds, and lets a tap
  // beside the frame through to whatever is under it.
  return { left: 0, right: 0, display: "flex", justifyContent: "center", pointerEvents: "none" };
}

function PinBox({
  drawn,
  onHeight,
}: {
  drawn: DrawnPin;
  onHeight: (id: string, height: number) => void;
}): ReactNode {
  const box = useRef<HTMLDivElement>(null);
  const { id, reserves } = drawn;
  useEffect(() => {
    const element = box.current;
    if (!element || !reserves) return undefined;
    const report = () => onHeight(id, element.getBoundingClientRect().height);
    report();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => observer.disconnect();
  }, [id, reserves, onHeight]);

  const centred = drawn.pin.left === undefined && drawn.pin.right === undefined;
  return (
    <div
      ref={box}
      data-funnel-pin={id}
      style={{ position: "absolute", [drawn.edge]: drawn.inset, ...acrossOf(drawn.pin) }}
    >
      {/* Laid out as a column's child: no frame holds it, and a frame with none
          above it would take itself for the screen's root. */}
      <Parent.Provider value="column">
        {centred ? (
          <div style={{ pointerEvents: "auto" }}>{drawn.element as ReactNode}</div>
        ) : (
          (drawn.element as ReactNode)
        )}
      </Parent.Provider>
    </div>
  );
}

export function Pins({
  pins,
  onReserve,
  children,
}: {
  pins: DrawnPin[];
  onReserve: ReserveReport;
  children?: ReactNode;
}): ReactNode {
  /*
    The tallest reserving pin on an edge, plus its inset, is that edge's room.
    Heights by id across renders; the pins themselves through a ref, so the
    observers are not torn down and rebuilt on every render of the screen.
  */
  const heights = useRef(new Map<string, number>());
  const latest = useRef(pins);
  latest.current = pins;
  const onHeight = useCallback(
    (id: string, height: number) => {
      heights.current.set(id, height);
      const pin = latest.current.find((each) => each.id === id);
      if (!pin) return;
      const room = latest.current
        .filter((each) => each.reserves && each.edge === pin.edge)
        .reduce((most, each) => Math.max(most, (heights.current.get(each.id) ?? 0) + each.inset), 0);
      onReserve(pin.edge, room);
    },
    [onReserve],
  );

  const layer = (edge: PinEdge) => {
    const here = pins.filter((drawn) => drawn.edge === edge);
    if (here.length === 0) return null;
    return (
      <div
        data-funnel-pins={edge}
        style={{ position: "sticky", [edge]: 0, height: 0, zIndex: PINNED_LAYER }}
      >
        {here.map((drawn) => (
          <PinBox key={drawn.id} drawn={drawn} onHeight={onHeight} />
        ))}
      </div>
    );
  };

  return createElement(Fragment, null, layer("top"), children, layer("bottom"));
}
