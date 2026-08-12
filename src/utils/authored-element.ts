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
 */
export function findAuthoredElement(id: string): HTMLElement | null {
  if (!id || typeof document === "undefined") return null;

  const byId = document.getElementById(id);
  if (byId) return byId;

  try {
    // JSON.stringify quotes and escapes the value, which is what a CSS
    // attribute selector needs. `CSS.escape` is for identifiers, not values,
    // and would be wrong here.
    return document.querySelector<HTMLElement>(`[data-id=${JSON.stringify(id)}]`);
  } catch {
    // An id that cannot be expressed as a selector is a missing element, not a
    // reason to abandon the rest of the interaction: every action queued after
    // this one in the same rule would stop running.
    return null;
  }
}
