/**
 * A text's typeface, fetched when a text first names it.
 *
 * A design names a family — `Poppins` — and nothing more; the funnel host knows
 * nothing of fonts and should not have to. So the first text to name a family
 * adds its stylesheet to the page (Google Fonts, the four weights a design can
 * pick), once per family, and the words are drawn in the fallback until it
 * arrives (`display=swap`). Inter and the system faces are the host's own and
 * are never fetched.
 */
import { useEffect } from "react";

const requested = new Set<string>();

/** Families a host already has: its own text face and the generic ones. */
const OWN = new Set(["", "inter", "system-ui", "sans-serif", "serif", "monospace", "inherit"]);

const FALLBACK = "system-ui, -apple-system, sans-serif";

/** The first family a stack names, unquoted. */
const firstOf = (family: string): string =>
  (family.split(",")[0] ?? "").trim().replace(/^["']|["']$/g, "");

/** The stylesheet that serves a family's 400–700. */
export const fontSheet = (family: string): string =>
  `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@400;500;600;700&display=swap`;

/** The CSS `font-family` for a named face — the face, then the fallbacks. */
export function fontStack(family: string | undefined): string | undefined {
  const name = family ? firstOf(family) : "";
  return name ? `"${name}", ${FALLBACK}` : undefined;
}

/** Fetches the family's stylesheet the first time a text names it. */
export function useWebFont(family: string | undefined): void {
  const name = family ? firstOf(family) : "";
  useEffect(() => {
    if (OWN.has(name.toLowerCase()) || requested.has(name)) return;
    requested.add(name);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = fontSheet(name);
    link.setAttribute("data-funnel-font", name);
    document.head.appendChild(link);
  }, [name]);
}
