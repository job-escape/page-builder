/**
 * An overlay on a phone: a frame on top of a screen that stays mounted beneath.
 *
 * Position is what makes it a sheet, a dialog or a side panel — three
 * presentations of one mechanism, exactly as on web. The web version manages
 * focus and locks body scroll; `Modal` does the equivalent here for free, which
 * is why this file is shorter rather than because it does less.
 *
 * Dismissal is not handled here. Escape on web and the hardware button on native
 * both reach `navigator.close()` through `<Funnel>`, because closing belongs to
 * the overlay *stack* rather than to any one overlay — and getting that wrong is
 * how "back closes the sheet" turns into "back leaves the funnel".
 */
import { useState, type ReactNode } from "react";
import { Modal, Pressable, View, useWindowDimensions, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Presentation } from "../navigation";
import { BleedContext, NO_BLEED } from "./bleed";
import { useDeclaredDirection } from "./direction";

const PLACEMENT: Record<string, ViewStyle> = {
  center: { justifyContent: "center", alignItems: "center" },
  bottom: { justifyContent: "flex-end" },
  top: { justifyContent: "flex-start" },
  side: { justifyContent: "center", alignItems: "flex-end" },
  /**
   * The frame takes the whole modal and places its own content — the native
   * half of the web's `fill`. Nothing to set here: the container is already
   * `flex: 1`, and the panel below claims it.
   */
  fill: {},
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
  const insets = useSafeAreaInsets();
  const declared = useDeclaredDirection();
  const position = presentation.position ?? "center";
  const dim = presentation.dim ?? true;
  const closeOnOutside = presentation.closeOnOutside ?? true;
  const { height: windowHeight } = useWindowDimensions();
  /**
   * Whether this centred dialog is as tall as the phone — measured, because
   * only its drawn height says so. Such a dialog is a surface, not a card: it
   * is drawn edge to edge, status bar to bottom, and its content is kept clear
   * of both through `BleedContext` rather than by the dialog stopping short.
   */
  const [fullSurface, setFullSurface] = useState(false);
  const safeHeight = windowHeight - insets.top - insets.bottom;

  return (
    <Modal
      transparent
      visible
      // Android's own back press reaches the same place the hardware handler in
      // `Funnel` does, so a sheet closes once rather than twice.
      onRequestClose={onDismiss}
      animationType={position === "center" ? "fade" : "slide"}
      accessibilityViewIsModal
    >
      <View
        style={[
          { flex: 1 },
          // A `Modal` is a new native root and inherits no layout direction, so
          // the funnel's is set again here — see `direction`.
          declared ? { direction: declared } : null,
          PLACEMENT[position],
          /**
           * A centred dialog stays inside the safe area.
           *
           * The backdrop still covers the whole screen — this pads the space
           * the dialog is centred in, not the dim behind it. A small dialog is
           * centred as before, a few points lower at most; one as tall as the
           * phone is measured here and then drawn edge to edge instead — see
           * `fullSurface` — with its content clear of the notch.
           */
          position === "center" && !fullSurface
            ? { paddingTop: insets.top, paddingBottom: insets.bottom }
            : null,
          dim ? { backgroundColor: "#00000080" } : null,
        ]}
      >
        {closeOnOutside ? (
          // A backdrop that takes the tap, behind the panel rather than around
          // it — wrapping the panel would swallow taps meant for its contents.
          <Pressable
            style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
            onPress={onDismiss}
            accessibilityLabel="Close"
          />
        ) : null}
        <View
          accessibilityRole="none"
          style={{
            // A sheet is inset from the home indicator; a centred dialog is not
            // near it, and padding it would float it oddly high.
            ...(position === "bottom" ? { paddingBottom: insets.bottom } : {}),
            ...(position === "top" ? { paddingTop: insets.top } : {}),
            /**
             * `fill` claims the modal, as it claims the viewport on web.
             *
             * No safe-area padding with it: a frame that asked for the whole
             * surface means the whole surface, and insetting it would leave the
             * band above the home indicator painted by whatever is underneath.
             * A frame that wants to clear the chrome says so with its own
             * padding, which is the same answer `bleed` gives a screen.
             */
            ...(position === "fill" ? { flex: 1 } : {}),
            // Never taller than the space it is centred in.
            ...(position === "center" ? { maxHeight: "100%" } : {}),
            // A dialog that fills that space fills the phone instead.
            ...(position === "center" && fullSurface ? { flex: 1, alignSelf: "stretch" } : {}),
          }}
          onLayout={
            position === "center" && !fullSurface
              ? (event) => {
                  // Stopped by the safe area, so it wanted at least the whole phone.
                  if (event.nativeEvent.layout.height >= safeHeight - 1) setFullSurface(true);
                }
              : undefined
          }
        >
          <BleedContext.Provider
            value={fullSurface ? { top: insets.top, bottom: insets.bottom } : NO_BLEED}
          >
            {children}
          </BleedContext.Provider>
        </View>
      </View>
    </Modal>
  );
}
