/**
 * What the visitor's window says about itself, as values React subscribes to.
 */
import { useSyncExternalStore } from "react";

import { DESKTOP_MEDIA_QUERY, type Device } from "../../device";

/**
 * Whether a media query matches, following the window as it changes. `null` on
 * a server render and anywhere `matchMedia` is missing — no answer, which each
 * caller turns into its own honest default rather than a guess made here.
 */
export function useMediaMatch(query: string): boolean | null {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => {
      if (typeof window === "undefined" || !window.matchMedia) return null;
      return window.matchMedia(query).matches;
    },
    () => null,
  );
}

/**
 * Which device this window is. The server's guess where there is no window,
 * which is also what hydration compares against — so a correct guess hydrates
 * with nothing to change, and a wrong one is corrected before paint.
 */
export function useWindowDevice(hint: Device | undefined): Device {
  const desktop = useMediaMatch(DESKTOP_MEDIA_QUERY);
  if (desktop === null) return hint ?? "mobile";
  return desktop ? "desktop" : "mobile";
}

/**
 * Whether this visitor's system is set to dark. `null` on a server render and
 * anywhere `matchMedia` is missing, which is the honest answer rather than a
 * guess at light.
 */
export function useSystemMode(): "dark" | "light" | null {
  const dark = useMediaMatch("(prefers-color-scheme: dark)");
  if (dark === null) return null;
  return dark ? "dark" : "light";
}
