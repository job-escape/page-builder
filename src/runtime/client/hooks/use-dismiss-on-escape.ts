/**
 * Escape closes the top overlay rather than leaving the funnel — the same
 * `navigator.close()` the hardware back button reaches on a phone.
 */
import { useDismissOnBack } from "../../funnel-core";

function onEscape(dismiss: () => void): () => void {
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") dismiss();
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}

export function useDismissOnEscape(navigator: { close: () => boolean }): void {
  useDismissOnBack(onEscape, navigator);
}
