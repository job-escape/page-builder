/**
 * The chrome a screen sits in, on a phone.
 *
 * The web host does almost nothing because a browser already does almost all of
 * it. This one does the work: insets, keyboard, and a scroll container that only
 * exists because nothing on a phone scrolls unless something says so.
 *
 * None of it is authored. A designer never sets an inset or picks a keyboard
 * behaviour — they say "this screen is fixed" or "this content bleeds", and the
 * two halves of that decision arrive from different places: intent from the
 * artifact's `ScreenPresentation`, mechanics from the app's `HostConfig`.
 *
 * The background always bleeds. Insets are applied as *content padding* rather
 * than by shrinking the surface, because a `SafeAreaView` would stop the screen's
 * own background at the notch and leave a white band above every coloured header
 * — which no designer asked for and none can see in the canvas.
 */
import { useEffect, useRef, type ReactNode } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  ScrollView,
  StatusBar,
  View,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { ScreenPresentation } from "../compiler/manifest";
import type { ScreenTransition } from "../compiler/source";
import { resolveHost, type HostConfig } from "./host-config";

export const DEFAULT_PRESENTATION: ScreenPresentation = {
  scroll: true,
  bleed: false,
  statusBar: "auto",
  transition: "none",
  keyboard: false,
};

/**
 * A screen's entrance, as a style on the view it arrives in — the web host's
 * keyframes, spelled with `Animated` on the native driver. `none`, and any
 * artifact older than transitions, is a plain view that never moves.
 *
 * Played once, when the host mounts: `<Funnel>` keys it by the screen, so it
 * mounts on every navigation.
 */
function useEntrance(
  transition: ScreenTransition | undefined,
  direction: "forward" | "back",
): Animated.WithAnimatedValue<ViewStyle> | null {
  const moving = transition === "fade" || transition === "slide" || transition === "push";
  const progress = useRef(new Animated.Value(moving ? 0 : 1)).current;
  const { width } = useWindowDimensions();

  useEffect(() => {
    if (!moving) return;
    Animated.timing(progress, {
      toValue: 1,
      duration: transition === "push" ? 320 : 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    // Once per mount — a new screen is a new host.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!moving) return null;
  const sign = direction === "back" ? -1 : 1;
  if (transition === "fade") return { opacity: progress };
  const distance = transition === "push" ? width : 24;
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [sign * distance, 0] });
  return transition === "push"
    ? { transform: [{ translateX }] }
    : { opacity: progress, transform: [{ translateX }] };
}

/**
 * Light text on a dark screen, dark on a light one.
 *
 * Derived rather than asked for: the answer is a fact about the screen's own
 * background, and a designer who has to remember it will forget on the one
 * screen nobody looks at twice. `auto` is the default for that reason; the
 * override exists for the case where the top of the screen is not the colour the
 * rest of it is.
 */
export function statusBarStyle(
  presentation: ScreenPresentation,
  background: string | undefined,
): "light-content" | "dark-content" {
  if (presentation.statusBar === "light") return "light-content";
  if (presentation.statusBar === "dark") return "dark-content";
  if (!background) return "dark-content";

  const hex = background.replace("#", "").slice(0, 6);
  if (hex.length < 6) return "dark-content";
  const [r, g, b] = [0, 2, 4].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  if ([r, g, b].some((channel) => !Number.isFinite(channel))) return "dark-content";

  // Rec. 601 luma. Good enough for "is this dark", and cheap enough to run per
  // screen without anyone noticing.
  const luma = (r * 299 + g * 587 + b * 114) / 1000;
  return luma < 140 ? "light-content" : "dark-content";
}

export function ScreenHost({
  presentation,
  host,
  background,
  direction = "forward",
  children,
}: {
  presentation: ScreenPresentation;
  host?: Partial<HostConfig>;
  /** The screen's own background, for deriving the status bar. */
  background?: string;
  /** Which way the visitor went to get here — a slide and a push reverse on back. */
  direction?: "forward" | "back";
  children: ReactNode;
}) {
  const entrance = useEntrance(presentation.transition, direction);
  const config = resolveHost(host);
  const insets = useSafeAreaInsets();
  const edges = config.insetEdges;

  // A bleeding screen puts its content under the chrome deliberately — a splash,
  // a full-height image. Everything else clears it.
  const padding: ViewStyle = presentation.bleed
    ? {}
    : {
        paddingTop: edges.top ? insets.top : 0,
        paddingBottom: edges.bottom ? insets.bottom : 0,
        paddingLeft: edges.left ? insets.left : 0,
        paddingRight: edges.right ? insets.right : 0,
      };

  const surface = (
    <View style={[{ flex: 1 }, padding]} testID="funnel-screen-fixed">
      {children}
    </View>
  );

  const scrolling = (
    <ScrollView
      style={{ flex: 1 }}
      // Short content still fills the viewport, so a screen with a button at the
      // bottom keeps it there; tall content scrolls. This is what makes a phone
      // behave the way a browser's document already does.
      contentContainerStyle={{ flexGrow: 1, ...padding }}
      keyboardShouldPersistTaps={config.keyboardTaps}
      testID="funnel-screen-scroll"
    >
      {children}
    </ScrollView>
  );

  return (
    // Full bleed by construction: the background paints to every edge, and only
    // the content is inset. Animated only when the screen has an entrance.
    <Animated.View style={entrance ? [{ flex: 1 }, entrance] : { flex: 1 }}>
      <StatusBar barStyle={statusBarStyle(presentation, background)} />
      {presentation.keyboard ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={config.keyboardBehaviour}>
          {presentation.scroll ? scrolling : surface}
        </KeyboardAvoidingView>
      ) : (
        // No field on this screen, so nothing has to move out of a keyboard's
        // way — and an avoiding view that never avoids anything is a layout pass
        // per frame for nothing.
        presentation.scroll ? scrolling : surface
      )}
    </Animated.View>
  );
}
