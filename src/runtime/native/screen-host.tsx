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
import type { ReactNode } from "react";
import { KeyboardAvoidingView, ScrollView, StatusBar, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { ScreenPresentation } from "../compiler/manifest";
import { resolveHost, type HostConfig } from "./host-config";

export const DEFAULT_PRESENTATION: ScreenPresentation = {
  scroll: true,
  bleed: false,
  statusBar: "auto",
  keyboard: false,
};

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
  children,
}: {
  presentation: ScreenPresentation;
  host?: Partial<HostConfig>;
  /** The screen's own background, for deriving the status bar. */
  background?: string;
  children: ReactNode;
}) {
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
    // the content is inset.
    <View style={{ flex: 1 }}>
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
    </View>
  );
}
