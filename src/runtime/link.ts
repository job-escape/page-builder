/**
 * The Open link step — sending a visitor to an address, with the funnel's own
 * values and the host's session written into it.
 *
 * The design says *where* and *how far away it should feel*; the host says how
 * that is done where it runs. So the step carries an address template and an
 * `as` — `tab` or `sheet` — and nothing about a platform:
 *
 *     https://portfolio.jobescape.me/builder?access_token={accessToken}&goal={goal}
 *
 * - **`{name}`** reads a variable the funnel holds — an answer the visitor gave.
 * - **`{accessToken}` / `{refreshToken}`** read the host's signed-in session.
 *   Nothing in a design declares them and nothing sets them: they are the
 *   funnel's `window`, answered by whatever is running it (the editor's
 *   `system-variables` lists them). A funnel is a public file and can hold no
 *   token, so they only ever arrive from the host, at the moment of the tap —
 *   read then rather than at mount, because a session rotates.
 *
 * A placeholder nothing fills is left as written, as copy leaves one: a visible
 * `{accessToken}` in an address is a bug somebody reports; an empty one is a
 * link that fails as if the session were simply invalid.
 *
 * **Opening is the host's.** On the web the default is a new tab — `sheet` too:
 * a browser has no in-app browser to present, and an iframe in a panel is
 * refused by most addresses worth opening. The app's host answers `sheet` with
 * a web view it presents over the funnel. A host that wants either done its own
 * way passes `open` to `configureLinks`. A phone has no `window.open`, so the
 * native entry registers the platform's own opener as the default beneath that
 * (`configureDefaultOpener`): without it a host that configured nothing had a
 * button that did nothing.
 *
 * Kept on `globalThis` for the reason `track` is: every entry bundles its own
 * copy of this module, and a host configures through one while `<Funnel>` runs
 * through another.
 */

/** The signed-in session, as the host holds it. */
export type LinkSession = {
  accessToken?: string | null;
  refreshToken?: string | null;
};

export type LinkOptions = {
  /**
   * Opens an address. Without it the web opens a new tab.
   *
   * `closed`, when the step has something to do afterwards: call it once, when
   * the visitor is back from the address — the sheet dismissed, the browser
   * left. A host that cannot tell leaves it uncalled, and the step's `onClose`
   * simply never runs.
   */
  open?: (url: string, as: "tab" | "sheet", closed?: () => void) => void;
  /** The session, read at the moment of the tap. Without it the tokens stay unfilled. */
  session?: () => LinkSession | null | undefined;
};

const SHARED = Symbol.for("@job-escape/page-builder/links");

type Shared = { options: LinkOptions; fallback?: LinkOptions["open"] };

const shared = (): Shared => {
  const holder = globalThis as unknown as Record<symbol, Shared | undefined>;
  holder[SHARED] ??= { options: {} };
  return holder[SHARED];
};

/** Configure once, at mount — merged over what was configured before. */
export function configureLinks(next: LinkOptions): void {
  const state = shared();
  state.options = { ...state.options, ...next };
}

/**
 * The platform's opener, used when the host passed no `open` of its own.
 *
 * A separate slot rather than `configureLinks({ open })`, so it can never
 * replace what a host configured, whichever of the two runs first.
 */
export function configureDefaultOpener(open: NonNullable<LinkOptions["open"]>): void {
  shared().fallback = open;
}

/** The names the host's session answers, and nothing else does. */
const SESSION_NAMES = new Set(["accessToken", "refreshToken"]);

/** `{name}` — the grammar copy placeholders use (`rich-text`), plus a leading `$`. */
const PLACEHOLDER = /\{(\$?\w+(?:\.\w+)*)\}/g;

/**
 * The address with its placeholders filled — the session first, then the
 * funnel's variables. Each value is URL-encoded, because it is being put into
 * an address and a value with a `&` in it would otherwise end its parameter.
 */
export function linkAddress(template: string, read: (name: string) => unknown): string {
  const session = shared().options.session?.() ?? null;
  return template.replace(PLACEHOLDER, (whole, raw: string) => {
    const name = raw.startsWith("$") ? raw.slice(1) : raw;
    const value = SESSION_NAMES.has(name)
      ? session?.[name as keyof LinkSession]
      : read(name);
    if (value === undefined || value === null || value === "") return whole;
    return encodeURIComponent(String(value));
  });
}

/**
 * Only the schemes an address a visitor is sent to can have. `javascript:` and
 * `data:` are code, not places, and a step that ran one would be a way to run
 * script from a design file.
 */
const SAFE = /^(https?:|mailto:|tel:|[a-z][a-z0-9+.-]*:\/\/)/i;

/** Logs a link that could not be opened. Stable names: alerting selects on them. */
const refused = (name: string, url: string, cause?: unknown) => {
  console.error(name, { url, ...(cause === undefined ? {} : { cause }) });
};

/**
 * Leave the funnel for an address — in this tab, not a new one.
 *
 * What a host does with a buyer once they have paid (`runtime/payment-session`):
 * the funnel is finished with, so there is nothing to keep open behind the
 * address, and a new tab opened this long after the tap is one a browser
 * refuses. Where there is no page to navigate — a phone — the host's opener
 * takes it.
 *
 * Only http(s), and the address is never logged: it may carry a session.
 */
export function leaveFor(url: string): void {
  if (!/^https?:\/\//i.test(url)) {
    console.error("pb.link.refused", { reason: "not_http" });
    return;
  }
  const { location } = globalThis as { location?: { assign?: (to: string) => void } };
  if (typeof location?.assign === "function") {
    location.assign(url);
    return;
  }
  const open = shared().options.open ?? shared().fallback;
  if (open) open(url, "tab");
  else console.error("pb.link.no_opener", {});
}

/** How often a tab this page opened is asked whether it has been closed. */
const TAB_POLL_MS = 500;

/** `closed`, callable once however many ways a host reports it. */
function once(closed: (() => void) | undefined): (() => void) | undefined {
  if (!closed) return undefined;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    closed();
  };
}

/**
 * Open the address a step names. Never waits and never interrupts: the visitor
 * is sent somewhere and the funnel stays where it was, so what follows the step
 * still runs. `onClosed` is called once when they come back from it — see
 * `LinkOptions.open`.
 */
export function openLink(
  template: string,
  as: "tab" | "sheet" | undefined,
  read: (name: string) => unknown,
  onClosed?: () => void,
): void {
  const url = linkAddress(template, read).trim();
  if (!url) return;
  if (!SAFE.test(url)) {
    refused("pb.link.refused", url);
    return;
  }
  const how = as === "sheet" ? "sheet" : "tab";
  const open = shared().options.open ?? shared().fallback;
  const closed = once(onClosed);
  try {
    if (open) {
      if (closed) open(url, how, closed);
      else open(url, how);
      return;
    }
    const opener = (globalThis as { open?: Window["open"] }).open;
    if (typeof opener !== "function") {
      refused("pb.link.no_opener", url);
      return;
    }
    /*
      A new tab, from the tap itself. A browser refuses a tab opened after the
      gesture has passed — a link behind a request that was waited on — and
      answers null; the address is then opened here rather than not at all,
      because a button that does nothing is the one outcome worse than leaving.

      No `noopener` in the features: with it, `open` answers null even when
      the tab opened, which would read as refused and navigate this page too.
      The new page is cut loose from this one by hand instead.
    */
    const opened = opener.call(globalThis, url, "_blank");
    if (opened) {
      try {
        opened.opener = null;
      } catch {
        // A cross-origin window may refuse the write; it is already cut loose then.
      }
      /*
        Back from the tab: `closed` is readable across origins, and it is the
        only thing a page may ask of a window it opened on another site.
      */
      if (closed) {
        const watch = setInterval(() => {
          let gone = true;
          try {
            gone = opened.closed;
          } catch {
            // A window that refuses even this is past asking — treat it as gone.
          }
          if (!gone) return;
          clearInterval(watch);
          closed();
        }, TAB_POLL_MS);
      }
    } else {
      const location = (globalThis as { location?: Location }).location;
      if (location) location.assign(url);
    }
  } catch (cause) {
    refused("pb.link.failed", url, cause);
  }
}
