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
import type { ReactNode } from "react";
import { Modal, Pressable, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Presentation } from "../navigation";

const PLACEMENT: Record<string, ViewStyle> = {
  center: { justifyContent: "center", alignItems: "center" },
  bottom: { justifyContent: "flex-end" },
  top: { justifyContent: "flex-start" },
  side: { justifyContent: "center", alignItems: "flex-end" },
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
  const position = presentation.position ?? "center";
  const dim = presentation.dim ?? true;
  const closeOnOutside = presentation.closeOnOutside ?? true;

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
      <View style={[{ flex: 1 }, PLACEMENT[position], dim ? { backgroundColor: "#00000080" } : null]}>
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
          }}
        >
          {children}
        </View>
      </View>
    </Modal>
  );
}
