/**
 * **Scroll into view** on a phone — the native half of `runtime/scroll-anchor`.
 *
 * A frame the compiler marked (`props.anchor`) registers its view here; the
 * screen host registers its scroll view and how tall it is. Scrolling to a
 * frame is then a measurement of where it sits inside the scroll view's
 * content, and a `scrollTo` there — aligned as the step asked.
 *
 * Configured as the runtime's scroller when this module loads, which is when
 * the native screen host does — a browser never loads it.
 */
import type { LayoutChangeEvent, ScrollView } from "react-native";

import { configureScroll, type ScrollAlign } from "../scroll-anchor";

type Measurable = {
  measureLayout?: (
    relativeTo: unknown,
    onSuccess: (x: number, y: number, width: number, height: number) => void,
    onFail?: () => void,
  ) => void;
};

const anchors = new Map<string, Measurable>();
const refs = new Map<string, (view: unknown) => void>();

/** The ref a marked frame's outermost view takes. Undefined for every other frame. */
export function anchorRef(id: string | undefined): ((view: unknown) => void) | undefined {
  if (!id) return undefined;
  let ref = refs.get(id);
  if (!ref) {
    ref = (view) => {
      if (view) anchors.set(id, view as Measurable);
      else anchors.delete(id);
    };
    refs.set(id, ref);
  }
  return ref;
}

type Scroller = { view: ScrollView | null; height: number };

/** Scroll views on screen, the newest last — the one a step scrolls. */
const scrollers: Scroller[] = [];

/** For `ScreenHost`: the ref and the layout handler its scroll view takes. */
export function scrollerFor(): {
  ref: (view: ScrollView | null) => void;
  onLayout: (event: LayoutChangeEvent) => void;
} {
  const held: Scroller = { view: null, height: 0 };
  return {
    ref: (view) => {
      held.view = view;
      const at = scrollers.indexOf(held);
      if (view && at < 0) scrollers.push(held);
      if (!view && at >= 0) scrollers.splice(at, 1);
    },
    onLayout: (event) => {
      held.height = event.nativeEvent.layout.height;
    },
  };
}

function scrollTo(target: string, align: ScrollAlign): void {
  const node = anchors.get(target);
  const held = scrollers[scrollers.length - 1];
  const view = held?.view as (ScrollView & { getInnerViewRef?: () => unknown }) | null | undefined;
  if (!node?.measureLayout || !view) return;
  const content = view.getInnerViewRef?.() ?? view;
  node.measureLayout(
    content,
    (_x, y, _width, height) => {
      let offset = y;
      if (align === "center") offset = y - (held!.height - height) / 2;
      if (align === "end") offset = y - held!.height + height;
      view.scrollTo({ y: Math.max(0, offset), animated: true });
    },
    () => undefined,
  );
}

configureScroll(scrollTo);
