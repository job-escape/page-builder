/**
 * Copy that carries its own emphasis — bold, italic, underline, and a link.
 *
 * A funnel's words used to be a `string`, and a string has nowhere to say that
 * *these fourteen characters* are a link to the privacy screen. So copy becomes
 * a list of **runs**: spans of text in order, each carrying the marks that apply
 * to it. The words and their emphasis travel together, per locale, which is what
 * makes a translation able to move the link to where its own grammar puts it.
 *
 * **A bare string is one unmarked run, and always will be.** Every artifact
 * already published carries strings, and an artifact outlives the application
 * that authored it — this repository's guide says so in as many words. So this
 * is not a migration with an end: `runsOf` is the only way anything should read
 * copy, and it answers the same way whichever shape it is handed. Nothing that
 * has never been formatted changes size, shape or behaviour.
 *
 * **Runs are data, not markup.** The alternative was `<b>` in the string, which
 * would need a parser in the web brick, a parser in the native brick, a parser
 * in the canvas engine and one in every tool that writes copy — four statements
 * of one grammar, which is the divergence this codebase keeps writing comments
 * about. It also has a state runs cannot reach: the editor's copy is a CRDT that
 * merges character by character and has no idea `<b>` and `</b>` belong
 * together, so two individually-valid edits can land as `<b>bold</em>`.
 *
 * **A link names a screen, never a URL.** A funnel's privacy notice is a screen
 * in the same funnel, shown the way every other navigation shows one, so a link
 * is the `show` action's own shape rather than a second vocabulary beside it —
 * see `TextLink`. An artifact that cannot be made to point at an arbitrary
 * address is also an artifact that cannot be made to *exfiltrate* to one.
 */

/**
 * Where a link goes: a screen in this funnel, presented as `show` presents one.
 *
 * Deliberately the same fields as the `show` action — target, and the four that
 * describe an overlay — so a link and a button that go to the same place are the
 * same instruction written twice rather than two instructions that agree today.
 * `runtime/interpret` reads both through `showPresentation`.
 */
export type TextLink = {
  /** The screen id. Unknown ids are reported, not navigated to. */
  target: string;
  as?: "replace" | "overlay";
  position?: "center" | "bottom" | "top" | "side";
  dim?: boolean;
  closeOnOutside?: boolean;
};

/**
 * One span of copy and the marks on it.
 *
 * The marks are optional and independent: a run can be bold *and* a link, which
 * is what a designer means by emphasising the words they also made clickable.
 * Absent is off — never `false` — so a run that has never been formatted is
 * `{ text }` and nothing else, and the artifact does not grow a field per
 * unformatted sentence.
 */
export type TextRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  link?: TextLink;
};

/**
 * Copy, as stored and as `t` answers it.
 *
 * The union is the contract, and the string arm is not deprecated: it is what
 * every published artifact carries and what any host that has never formatted
 * anything will keep sending.
 */
export type RichText = string | readonly TextRun[];

/** The marks, without the words — what `sameMarks` compares and a toolbar sets. */
export type TextMarks = Omit<TextRun, "text">;

/**
 * Whether a value is a run list rather than a string or a React child.
 *
 * Structural, and checked on the *first member* rather than on every one: this
 * is asked once per text node per render, and a run list is built by this
 * module's own writers. A ragged array is a bug in the writer, not a shape to
 * defend against on the hot path.
 */
export function isRuns(value: unknown): value is readonly TextRun[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  const first: unknown = value[0];
  return typeof first === "object" && first !== null && typeof (first as TextRun).text === "string";
}

/**
 * Copy as runs, whatever shape it arrived in — the one reader.
 *
 * An empty string and a missing key both answer `[]` rather than a run holding
 * nothing: a renderer asks "what do I draw" and the honest answer to both is
 * "nothing", and a `<span>` around no characters is a box in a layout that
 * should have had none.
 */
export function runsOf(value: RichText | null | undefined): readonly TextRun[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "string") return value === "" ? [] : [{ text: value }];
  return value;
}

/**
 * The words alone.
 *
 * What anything that cannot show emphasis needs: an `aria-label`, an analytics
 * payload, a plain-text export — and the canvas engine, which lays glyphs out
 * against one continuous string and finds each run again by byte offset.
 */
export function plainOf(value: RichText | null | undefined): string {
  if (typeof value === "string") return value;
  return runsOf(value)
    .map((run) => run.text)
    .join("");
}

/**
 * What a placeholder looks like: `{name}`.
 *
 * Braces and a bare identifier — the shape every templating vocabulary in this
 * codebase already uses, and narrow enough that ordinary copy does not trip it.
 * `{` on its own, `{ name }` with spaces, and `{not-an-identifier}` are all
 * left exactly as they are.
 */
const PLACEHOLDER = /\{(\w+)\}/g;

/** The values a placeholder can be filled with. */
export type CopyParams = Readonly<Record<string, string | number>>;

function fillText(
  text: string,
  params: CopyParams,
  onMissing: ((name: string) => void) | undefined,
): string {
  return text.replace(PLACEHOLDER, (whole, name: string) => {
    const value = params[name];
    if (value === undefined) {
      onMissing?.(name);
      // Left as it was written. A visible `{name}` is a bug somebody reports;
      // a silent empty space is a sentence that reads as if a word is simply
      // missing, which nobody reports and nobody can find afterwards.
      return whole;
    }
    return String(value);
  });
}

/**
 * Copy with its placeholders filled in.
 *
 * **Only ever called when a caller passed parameters**, which is what keeps
 * every artifact already published byte-identical: copy that has never been
 * interpolated is never scanned, so a headline that genuinely contains
 * `{braces}` cannot be mangled by this existing.
 *
 * Runs are filled one at a time and keep their marks. A placeholder split
 * across two runs — half of `{name}` bold and half not — is not substituted,
 * because there is no single run holding it; that is a designer having
 * formatted the inside of a placeholder, and guessing at it would be worse
 * than leaving it visible.
 */
export function interpolate(
  value: RichText,
  params: CopyParams,
  onMissing?: (name: string) => void,
): RichText {
  if (typeof value === "string") return fillText(value, params, onMissing);
  return value.map((run) => ({ ...run, text: fillText(run.text, params, onMissing) }));
}

/** Whether two runs would be indistinguishable if their words were joined. */
function sameMarks(a: TextRun, b: TextRun): boolean {
  if (!!a.bold !== !!b.bold) return false;
  if (!!a.italic !== !!b.italic) return false;
  if (!!a.underline !== !!b.underline) return false;
  const one = a.link;
  const two = b.link;
  if (!one || !two) return one === two;
  return (
    one.target === two.target &&
    one.as === two.as &&
    one.position === two.position &&
    one.dim === two.dim &&
    one.closeOnOutside === two.closeOnOutside
  );
}

/**
 * The same copy, with empty runs dropped and neighbours that read alike joined.
 *
 * Formatting fragments: bold a word, unbold it, and the sentence is three runs
 * that draw exactly as one did. Left alone the fragments accumulate — every
 * toolbar press splits a run and nothing ever merges them — and the artifact
 * grows a span per edit for a paragraph nobody can tell apart from plain text.
 *
 * Called where copy is *written*, never where it is read: a reader that
 * normalised would be doing work per render to fix something the writer should
 * not have stored, and `runsOf` has to stay cheap enough to sit in a brick.
 */
export function normalizeRuns(runs: readonly TextRun[]): TextRun[] {
  const out: TextRun[] = [];
  runs.forEach((run) => {
    if (run.text === "") return;
    const last = out[out.length - 1];
    if (last && sameMarks(last, run)) {
      last.text += run.text;
      return;
    }
    out.push({ ...run });
  });
  return out;
}
