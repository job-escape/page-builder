/**
 * How a text brick reaches navigation — the one thing a run's link needs and a
 * brick does not have.
 *
 * `Frame` never had this problem: a frame's `onClick` is written *by the
 * compiler* out of the interactions a designer attached, so by the time the
 * brick sees it, it is already a closure over the funnel's own services. A
 * run's link is not compiled into a handler — it is data inside the copy, read
 * at render — so the brick that draws the words is the thing that has to
 * perform the navigation, and it is handed no services at all.
 *
 * **Its own context, rather than reading the funnel's.** `FunnelContext` lives
 * in `client/funnel.tsx`, which imports `ui` from `client/bricks.tsx` — so a
 * brick reaching for it would close a module cycle, and there is a second copy
 * of the same context in `native/funnel.tsx` that a shared brick could not pick
 * between anyway. This carries one function, needs neither platform, and both
 * `Funnel`s provide it beside their own.
 *
 * **Absent is not an error.** A brick rendered outside a funnel — a test, a
 * storybook, the console's own frame preview — still has copy to draw, and
 * refusing to draw it would make emphasis unviewable everywhere except a
 * running funnel. Without a provider a link is drawn as a link and does
 * nothing, which is the honest behaviour for a screen that is not there.
 */
import { createContext, useContext } from "react";

import type { TextLink } from "./rich-text";

/** What a provider supplies: follow this link, from wherever the words are. */
export type FollowLink = (link: TextLink) => void;

const LinkContext = createContext<FollowLink | null>(null);

/** Provided by both `Funnel`s, beside their own services context. */
export const TextLinkProvider = LinkContext.Provider;

/** Null outside a funnel — see the note above; callers must tolerate it. */
export function useFollowLink(): FollowLink | null {
  return useContext(LinkContext);
}
