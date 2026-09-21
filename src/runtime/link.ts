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
 * way passes `open` to `configureLinks`.
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
  /** Opens an address. Without it the web opens a new tab. */
  open?: (url: string, as: "tab" | "sheet") => void;
  /** The session, read at the moment of the tap. Without it the tokens stay unfilled. */
  session?: () => LinkSession | null | undefined;
};

const SHARED = Symbol.for("@job-escape/page-builder/links");

const shared = (): { options: LinkOptions } => {
  const holder = globalThis as unknown as Record<symbol, { options: LinkOptions } | undefined>;
  holder[SHARED] ??= { options: {} };
  return holder[SHARED];
};

/** Configure once, at mount — merged over what was configured before. */
export function configureLinks(next: LinkOptions): void {
  const state = shared();
  state.options = { ...state.options, ...next };
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
 * Open the address a step names. Never waits and never interrupts: the visitor
 * is sent somewhere and the funnel stays where it was, so what follows the step
 * still runs.
 */
export function openLink(
  template: string,
  as: "tab" | "sheet" | undefined,
  read: (name: string) => unknown,
): void {
  const url = linkAddress(template, read).trim();
  if (!url) return;
  if (!SAFE.test(url)) {
    refused("pb.link.refused", url);
    return;
  }
  const how = as === "sheet" ? "sheet" : "tab";
  const { open } = shared().options;
  try {
    if (open) {
      open(url, how);
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
    } else {
      const location = (globalThis as { location?: Location }).location;
      if (location) location.assign(url);
    }
  } catch (cause) {
    refused("pb.link.failed", url, cause);
  }
}
