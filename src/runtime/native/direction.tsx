/**
 * Which way this funnel's layout reads — its language's, not the phone's.
 *
 * The web gets this for free: the host writes `dir` on the document and every
 * logical property below resolves against it. A phone has one app-wide answer,
 * `I18nManager.isRTL`, which follows the *app's* language and only changes on a
 * restart — so an Arabic funnel previewed in an English app drew an English
 * layout, and an app in Arabic would force every English funnel into a mirror.
 *
 * So the funnel carries its own. `Funnel` takes the `dir` `loadLocale` resolved,
 * sets Yoga's `direction` on its root (rows, `paddingStart`, `flex-start` all
 * follow it, as they follow `dir` on the web) and provides it here for the few
 * things Yoga's direction does not reach: text alignment, which React Native
 * keeps physical, and the sideways entrance of a screen.
 *
 * Absent — a host that has not been taught to pass `dir` — this falls back to
 * `I18nManager`, which is exactly what every brick read before, so such a host
 * draws what it always drew.
 */
import { createContext, useContext } from "react";
import { I18nManager } from "react-native";

import type { TextDirection } from "../locale";

export const DirectionContext = createContext<TextDirection | null>(null);

/** Whether the layout this is drawn in reads right to left. */
export function useRightToLeft(): boolean {
  const dir = useContext(DirectionContext);
  return dir === null ? I18nManager.isRTL : dir === "rtl";
}

/** The direction a funnel set explicitly, or null when it follows the app. */
export function useDeclaredDirection(): TextDirection | null {
  return useContext(DirectionContext);
}
