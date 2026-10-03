/**
 * A screen's pinned frames, held still on a phone — see `runtime/pin`.
 *
 * React Native has no sticky position, and a scrolling screen is one
 * `ScrollView` around everything the screen draws, so nothing inside it can
 * stay put. The pins are lifted out instead: `Pins` hands them to the screen
 * host through `PinOutlet`, and the host draws them in a layer over the scroll
 * view (`PinLayer`), inside the safe area and the keyboard-avoiding view the
 * screen already has — so a bar at the bottom clears the home indicator and
 * rises with the keyboard.
 *
 * A screen drawn without a host to lift them into — an overlay — has them
 * drawn over its content in place.
 */
import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";

import type { DrawnPin, ReserveReport } from "../pin";
import { FlowContext, HeightContext } from "./flow-context";

type Outlet = { hold: (drawn: ReactNode | null) => void };

/** Where a screen's pins go to be drawn outside its scroll view. */
export const PinOutlet = createContext<Outlet | null>(null);

/**
 * The screen host's half: the outlet to provide, and what has been put in it.
 *
 * The pins arrive as elements the screen drew — its taps and its values in
 * them — and are rendered here, outside the scroll view. Holding a new
 * element re-renders the host but not the screen inside it: the screen is
 * the same element the host was handed, so React leaves it be.
 */
export function usePinOutlet(): { outlet: Outlet; held: ReactNode } {
  const [held, setHeld] = useState<ReactNode>(null);
  const outlet = useMemo<Outlet>(() => ({ hold: (drawn) => setHeld(() => drawn) }), []);
  return { outlet, held };
}

/** Across the screen: between both sides, at one of them, or centred. */
function acrossOf(pin: DrawnPin["pin"]): ViewStyle {
  if (pin.left !== undefined || pin.right !== undefined) return { left: pin.left, right: pin.right };
  return { left: 0, right: 0, alignItems: "center" };
}

function PinBox({
  drawn,
  onHeight,
}: {
  drawn: DrawnPin;
  onHeight: (id: string, height: number) => void;
}): ReactNode {
  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", [drawn.edge]: drawn.inset, ...acrossOf(drawn.pin) }}
      onLayout={
        drawn.reserves ? (event) => onHeight(drawn.id, event.nativeEvent.layout.height) : undefined
      }
    >
      {/* Laid out as a column's child, and measured against nothing: no frame
          holds it, and its height is its own. */}
      <FlowContext.Provider value="column">
        <HeightContext.Provider value={false}>{drawn.element as ReactNode}</HeightContext.Provider>
      </FlowContext.Provider>
    </View>
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
  const outlet = useContext(PinOutlet);
  // Heights by id across renders; the pins through a ref — see the web `Pins`.
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

  const drawn = pins.map((pin) => <PinBox key={pin.id} drawn={pin} onHeight={onHeight} />);

  // Every render, so the host draws what the screen last drew; gone with it.
  useLayoutEffect(() => {
    outlet?.hold(<Fragment>{drawn}</Fragment>);
  });
  useLayoutEffect(() => () => outlet?.hold(null), [outlet]);

  if (outlet) return <>{children}</>;
  return (
    <View style={{ flexGrow: 1 }}>
      {children}
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        {drawn}
      </View>
    </View>
  );
}

/** The host's layer over the scroll view, inside the insets it pads its content by. */
export function PinLayer({ held, insets }: { held: ReactNode; insets: ViewStyle }): ReactNode {
  if (held === null) return null;
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, insets]}>
      {held}
    </View>
  );
}
