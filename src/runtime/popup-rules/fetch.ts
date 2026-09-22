import type { PopupRule, PopupRulesResponse } from "./types";

/**
 * The rules console serves for a project — `GET {console}/api/public/popup-rules`.
 *
 * Public and CORS-open, so a visitor's browser and an app ask it the same way.
 * Answers null rather than throwing: rules that could not be had are no popups,
 * never an error in front of a visitor. The failure is logged under a stable
 * name, for alerting.
 */
export async function fetchPopupRules({
  consoleUrl,
  project = "jobescape",
  channel = "prod",
  signal,
}: {
  /** Console's origin, e.g. `https://console.nvs.team`. Nothing is fetched without one. */
  consoleUrl: string | null | undefined;
  project?: string;
  channel?: "prod" | "stage";
  signal?: AbortSignal;
}): Promise<PopupRule[] | null> {
  const base = consoleUrl?.replace(/\/$/, "");
  if (!base) return null;
  const query = new URLSearchParams({ project, channel });
  try {
    const response = await fetch(`${base}/api/public/popup-rules?${query}`, { signal });
    if (!response.ok) {
      console.warn("popup_rules_fetch_failed", { status: response.status });
      return null;
    }
    return ((await response.json()) as PopupRulesResponse).rules ?? [];
  } catch (cause) {
    if ((cause as Error)?.name !== "AbortError") {
      console.warn("popup_rules_fetch_failed", { message: (cause as Error)?.message });
    }
    return null;
  }
}
