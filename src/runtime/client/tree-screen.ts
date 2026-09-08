/**
 * A screen tree, as a screen module — so `<Funnel>` cannot tell them apart.
 *
 * `screenFromTree` returns exactly the `ScreenModule` shape a compiled module
 * has: a function of `{ ui, c, t, state, nav, req }`. So the tree path needs no
 * change to `<Funnel>`, no second mounting component, and no branch anywhere in
 * the runtime — an app can hand `<Funnel>` a mix of both and it will render
 * them side by side.
 *
 * That is also the strongest test available: the same source compiled two ways
 * produces two screen modules, and the tests render both and assert the same
 * markup and the same click behaviour.
 *
 * **The walk itself is platform-free.** It only ever calls `props.ui.*`, and the
 * catalogue arrives as an argument — so React Native reuses this file verbatim
 * with a native `ui`. React appears here as a type and nowhere else.
 */
import type { ReactNode } from "react";

import type { CompiledTree, ScreenTree, TreeNode } from "../compiler/tree";
import { isCaseBinding } from "../compiler/source";
import { evaluate, run } from "../interpret";
import type { ScreenModule, ScreenProps } from "./funnel";

/**
 * Static props with the bound ones applied over them.
 *
 * The emitter writes a ternary per bound key into the props object; this
 * computes the same thing at render, off the same condition. The one that
 * matters is `fill` on a selected option — it is why a tap changes the look
 * without anything re-fetching.
 */
function propsOf(node: TreeNode, props: ScreenProps): Record<string, unknown> {
  const resolved: Record<string, unknown> = { ...node.props };

  Object.entries(node.bindings ?? {}).forEach(([key, binding]) => {
    if (!isCaseBinding(binding)) {
      resolved[key] = evaluate(binding.when, props.state) ? binding.whenTrue : binding.whenFalse;
      return;
    }
    // First match wins, in the order the editor wrote them — the same rule the
    // emitted ternary chain follows, because it is the same list read the same
    // way. `find` rather than a filter-and-last: a later case is not more
    // specific, it is only later.
    const hit = binding.cases.find((entry) => evaluate(entry.when, props.state));
    resolved[key] = hit ? hit.value : binding.default;
  });

  if (node.on?.length) {
    const actions = node.on;
    // Fire-and-forget on purpose: React does not await a handler, and the
    // actions write through the store, which is what re-renders.
    resolved.onClick = (): void => {
      void run(actions, { state: props.state, nav: props.nav, req: props.req });
    };
  }

  return resolved;
}

function renderNode(node: TreeNode, props: ScreenProps): ReactNode {
  /**
   * Presence, before anything else.
   *
   * `null` rather than an invisible frame, and returned before the children are
   * walked: a node that is not drawn does not draw what is inside it, and a
   * frame rendered at `opacity: 0` would still take its space and still take
   * taps. The emitter reaches the same answer with a ternary around the same
   * expression.
   */
  if (node.when && !evaluate(node.when, props.state)) return null;

  const resolved = propsOf(node, props);

  if (node.kind === "text") {
    return props.ui.Text(resolved, props.t(node.textKey));
  }

  if (node.kind === "image") {
    return props.ui.Image({ ...resolved, src: node.src } as never);
  }

  if (node.kind === "input") {
    const { variable } = node;
    return props.ui.Input({
      ...resolved,
      // Bound both ways to the declared variable: what the visitor sees is what
      // the funnel holds, so navigating away and back keeps it.
      value: String(props.state.get(variable) ?? ""),
      onValue: (next: string) => props.state.set(variable, next),
    } as never);
  }

  return props.ui.Frame(
    resolved,
    node.children.map((child) => renderNode(child, props)),
  );
}

export function screenFromTree(tree: ScreenTree): ScreenModule {
  return (props: ScreenProps) => tree.roots.map((root) => renderNode(root, props));
}

/** Every screen of a compiled tree, keyed the way `<Funnel>` wants them. */
export function screensFromTree(compiled: CompiledTree): Record<string, ScreenModule> {
  return Object.fromEntries(
    Object.entries(compiled.screens).map(([id, tree]) => [id, screenFromTree(tree)]),
  );
}
