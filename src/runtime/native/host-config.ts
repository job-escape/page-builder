/**
 * The platform mechanics — app-level, never per design.
 *
 * The line these sit on the far side of: a value belongs here when it answers
 * "how does this platform work", and in the artifact's `ScreenPresentation` when
 * it answers "how should this screen behave". "Does a paywall scroll" is a
 * question about the design and travels with it. "Which `KeyboardAvoidingView`
 * behavior" is a question about React Native, and putting it in the artifact
 * would mean republishing every funnel to change it.
 *
 * Named and gathered rather than written inline, so each one can be read with
 * its reason attached and overridden without forking the runtime.
 */
import { Platform } from "react-native";

export type HostConfig = {
  /**
   * iOS lifts the screen, Android resizes it. React Native's own documented
   * split — there is no single value that is correct on both.
   */
  keyboardBehaviour: "padding" | "height" | "position";
  /**
   * Whether a tap that dismisses the keyboard also reaches the control under it.
   *
   * `handled` is what stops the first tap after typing being swallowed — the
   * bug where a visitor fills in their email, taps Continue, and nothing
   * happens until they tap again.
   */
  keyboardTaps: "always" | "never" | "handled";
  /**
   * Which device insets become content padding, for screens that clear the
   * system chrome. The values themselves come from the OS; this only says which
   * edges participate.
   */
  insetEdges: { top: boolean; bottom: boolean; left: boolean; right: boolean };
};

export const DEFAULT_HOST: HostConfig = {
  keyboardBehaviour: Platform.OS === "ios" ? "padding" : "height",
  keyboardTaps: "handled",
  insetEdges: { top: true, bottom: true, left: true, right: true },
};

export function resolveHost(overrides?: Partial<HostConfig>): HostConfig {
  return {
    ...DEFAULT_HOST,
    ...overrides,
    insetEdges: { ...DEFAULT_HOST.insetEdges, ...overrides?.insetEdges },
  };
}
