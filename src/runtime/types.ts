/**
 * Variable declarations for the compiled-funnel runtime.
 *
 * A funnel's manifest declares its variables; compiled modules reference them by
 * name only. The declaration is what turns a name into behaviour: `select` on a
 * `string` assigns, `select` on a `list<string>` toggles and caps. That is the
 * entire single-select / multi-select difference, and keeping it here rather
 * than in compiled code is what makes switching a question between the two a
 * one-field edit instead of a recompile.
 *
 * See `docs/funnel-as-code.md` §9.6 and §9.6a in the editor repository.
 *
 * Not yet exported from the package entry points — this is the first piece of a
 * new runtime surface, and the public contract should be published once, whole,
 * rather than accreting.
 */

export type VariableType =
  | "string"
  | "number"
  | "boolean"
  | "list<string>"
  /**
   * What a request answered — a plan, or the catalogue of them.
   *
   * Data, not answers: filled by a `submit`'s `into` or a `set` from a value,
   * read by path (`{ var: "plan", path: "price_amount" }`), repeated over by a
   * frame. Never kept in the cookie — a catalogue does not fit in one and a
   * price restored from last week is the wrong price — so a screen that needs
   * one loads it when it opens.
   */
  | "object"
  | "list<object>";

/** An object a request returned — a plan, a user. */
export type DataObject = { readonly [key: string]: unknown };

/** Every value a variable may hold. `null` means unanswered. */
export type VariableValue = string | number | boolean | string[] | DataObject | DataObject[] | null;

export type VariableDecl = {
  name: string;
  type: VariableType;
  /**
   * Fewest selections before the answer counts as complete — `list<string>`
   * only. Drives "Continue stays disabled until they pick one"; it does not
   * prevent going below it, because removing a selection must always work.
   */
  min?: number;
  /** Most selections allowed — `list<string>` only. Adding past it is ignored. */
  max?: number;
  /** Used when the funnel starts. Absent means the type's own empty value. */
  default?: VariableValue;
  /**
   * Personal data. The runtime declines to persist or report it — an email in
   * the answers map would otherwise reach client storage and analytics events
   * by default. Marked at declaration because retrofitting it across published
   * funnels is far harder than declaring it now.
   */
  sensitive?: boolean;
  /**
   * The screen this belongs to, for a value that is the *screen's* state rather
   * than an answer — which variant a button is showing, whether an error is up.
   *
   * Forgotten when the visitor leaves that screen, so coming back finds it as
   * designed rather than frozen mid-submit; never kept in the cookie, because a
   * "Loading" restored on the next visit would be a spinner for nothing; and
   * never reported, because it is not something the visitor said.
   */
  screen?: string;
  /**
   * How long a funnel variable is kept on the visitor's device.
   *
   * Absent is what every variable did before this existed: saved across a
   * refresh and a return visit, and discarded when the funnel is republished —
   * the answers blob is keyed by version (see `persistence`), because a value
   * saved under a shape that has since changed must not be restored into it.
   *
   * `"always"` survives a republish too: a deadline an offer was given, a
   * discount already earned, a popup already seen. It is still checked against
   * the declaration when it is read back, so a variable that changed type
   * starts at its default rather than restoring nonsense.
   *
   * Ignored for a `screen` variable, a `sensitive` one and a request's answer,
   * none of which is ever saved. Web only, like the rest of `persistence`.
   */
  keep?: "always";
};

/** Declarations by name, as the runtime holds them after reading the manifest. */
export type VariableTable = Record<string, VariableDecl>;

export const isListType = (decl: VariableDecl): boolean => decl.type === "list<string>";

/** A variable that holds what a request returned rather than what a visitor said. */
export const isDataType = (decl: VariableDecl): boolean =>
  decl.type === "object" || decl.type === "list<object>";
