import { useEffect, useRef } from "react";

/**
 * Each screen arrived on, for the host to save. Not the one opened on — the
 * host already knows it, and saying it would be a write on every page load.
 * Compared with the last one reported, so a re-render, or an effect run twice
 * in development, is not a second arrival.
 */
export function useScreenReport(
  screen: string,
  onScreen: ((screen: string) => void) | undefined,
): void {
  const reported = useRef<string | null>(null);
  const onScreenRef = useRef(onScreen);
  onScreenRef.current = onScreen;
  useEffect(() => {
    if (reported.current === null) {
      reported.current = screen;
      return;
    }
    if (reported.current === screen) return;
    reported.current = screen;
    onScreenRef.current?.(screen);
  }, [screen]);
}
