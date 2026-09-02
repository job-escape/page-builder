/**
 * Finds the element an authored action names.
 *
 * Actions such as `scroll_to` carry an id the constructor assigned to a block.
 * That id reaches the DOM as **`data-id`**, not `id`: the parser hands a
 * component's authored attributes to its registry, and `ContainerRegistry`
 * spreads them onto the div unchanged. Only a few components — the
 * component-ref wrapper here, and some consumer registries — copy it into `id`
 * as well.
 *
 * So `document.getElementById` alone resolves almost nothing an author can
 * name, and the action it belongs to fails closed: no scroll, no error, on
 * every published page. Both are checked here, `id` first, because a component
 * that sets `id` is naming itself deliberately.
 *
 * The lookup is scoped before it is global. BuilderClient keeps neighbour
 * pages mounted (display:none) for preloading, and duplicated pages carry the
 * source page's ids verbatim — so a document-wide search can resolve to a
 * hidden element on another page and the action silently does nothing.
 * The active surfaces are marked in the DOM: `data-bevr-active-dialog` on an
 * open dialog/drawer (it portals outside the page wrapper, and it is the
 * topmost surface, so it is searched first) and `data-bevr-active-page` on
 * the current page. The document-wide search stays as the fallback for
 * content rendered without those markers.
 */
const ACTIVE_SCOPE_SELECTORS = [
  '[data-bevr-active-dialog="true"]',
  '[data-bevr-active-page="true"]',
];

export function findAuthoredElement(id: string): HTMLElement | null {
  if (!id || typeof document === "undefined") return null;

  try {
    // JSON.stringify quotes and escapes the value, which is what a CSS
    // attribute selector needs. `CSS.escape` is for identifiers, not values,
    // and would be wrong here.
    const quoted = JSON.stringify(id);

    for (const scopeSelector of ACTIVE_SCOPE_SELECTORS) {
      const scope = document.querySelector(scopeSelector);
      if (!scope) continue;
      const element =
        scope.querySelector<HTMLElement>(`[id=${quoted}]`) ??
        scope.querySelector<HTMLElement>(`[data-id=${quoted}]`);
      if (element) return element;
    }

    const byId = document.getElementById(id);
    if (byId) return byId;

    return document.querySelector<HTMLElement>(`[data-id=${quoted}]`);
  } catch {
    // An id that cannot be expressed as a selector is a missing element, not a
    // reason to abandon the rest of the interaction: every action queued after
    // this one in the same rule would stop running. getElementById never
    // throws, so it still gets a say before giving up.
    return document.getElementById(id);
  }
}
