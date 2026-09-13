/**
 * Which device a funnel is being drawn for — `$device`, as a condition reads it.
 *
 * A design is drawn once for a phone and may carry desktop overrides: a heading
 * that is 24px rather than 18px, a row that is a column. Publish writes those as
 * `bindings` and `when` on `$device`, and this module is the other half — the
 * one place that decides what `$device` is.
 *
 * **Two values, on purpose.** `mobile` is the design as drawn; `desktop` is the
 * layer over it. A funnel is never served to a tablet (the app is phone-only),
 * so there is no third answer to keep in step with anything.
 *
 * **The runtime owns it, not the artifact.** It is not a declared variable: a
 * declared one is persisted, and a device restored from a cookie is the device
 * somebody *used to* be on. See `createFunnelStore`.
 *
 * No React and no DOM, so a server can call `deviceFromRequest` and native can
 * import the type.
 */

export type Device = "mobile" | "desktop";

/** The name conditions read. Reserved: never a declared variable. */
export const DEVICE_VARIABLE = "$device";

/**
 * Where desktop begins, in CSS pixels of window width.
 *
 * The constructor's own breakpoint — the legacy builder's `desktop-style`
 * applies from `min-width: 1024px` — so a funnel moved to the canvas does not
 * change which visitors see its desktop layout.
 */
export const DESKTOP_MIN_WIDTH = 1024;

/** The media query a browser answers the same question with. */
export const DESKTOP_MEDIA_QUERY = `(min-width: ${DESKTOP_MIN_WIDTH}px)`;

export function deviceForWidth(width: number): Device {
  return width >= DESKTOP_MIN_WIDTH ? "desktop" : "mobile";
}

export function isDevice(value: unknown): value is Device {
  return value === "mobile" || value === "desktop";
}

/**
 * A server's best guess, before any window exists to measure.
 *
 * Only a guess, and used only for the first paint: the browser measures its
 * window and corrects it before anything is interactive. So it is tuned to be
 * right for the common case and cheap, not to be right for every agent string —
 * a wrong guess costs one reflow, never a wrong funnel.
 *
 * `Sec-CH-UA-Mobile` first, because it is the browser saying so (`?1` / `?0`);
 * a user agent naming a phone second; desktop for any other agent, since a
 * browser that names no phone is overwhelmingly a desktop one. No agent at all
 * is `mobile` — the design as drawn is the safe thing to show something that
 * will not say what it is.
 */
export function deviceFromRequest(headers: {
  userAgent?: string | null;
  chUaMobile?: string | null;
}): Device {
  const hint = headers.chUaMobile?.trim();
  if (hint === "?1") return "mobile";
  if (hint === "?0") return "desktop";
  const agent = headers.userAgent ?? "";
  if (!agent) return "mobile";
  return /Mobi|Android|iPhone|iPod|Windows Phone|webOS|BlackBerry|Opera Mini|IEMobile/i.test(agent)
    ? "mobile"
    : "desktop";
}
