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
 * with a native `ui`. The one thing it reaches for beyond that is React itself
 * — `Appeared` below — which both platforms already are; no DOM, no native
 * element, nothing a renderer has to answer differently.
 *
 * **Schema 1.3 is tree-only.** Repeats, text params, value bindings and slots
 * are drawn here and not by the JavaScript emitter, which no host reads.
 */
import { createElement, useEffect, useRef, type ReactNode } from "react";

import type { CompiledTree, ScreenTree, TreeNode } from "../compiler/tree";
import { isCaseBinding, isValueBinding, type SourceAction } from "../compiler/source";
import { isScopeName, type Scope } from "../data";
import { evaluate, run, valueOf } from "../interpret";
import type { CopyParams } from "../rich-text";
import type { ScreenModule, ScreenProps } from "./funnel";

/**
 * The store, with the renderer's scope answered first.
 *
 * `$item` and `$index` while a repeat draws an entry; `$event` and `$payment`
 * while a slot's trigger runs. Everything else goes to the store unchanged, so
 * a card's tap can still `set` a funnel variable — to the item it is drawing.
 */
function scoped(state: ScreenProps["state"], scope: Scope): ScreenProps["state"] {
  const answer = (name: string) => (scope as Record<string, unknown>)[name] ?? null;
  return {
    ...state,
    get: (name: string) => (isScopeName(name) ? (answer(name) as never) : state.get(name)),
    isSet: (name: string) => {
      if (!isScopeName(name)) return state.isSet(name);
      const held = answer(name);
      return held !== null && held !== "";
    },
    isEmpty: (name: string) => {
      if (!isScopeName(name)) return state.isEmpty(name);
      const held = answer(name);
      return held === null || held === "";
    },
  };
}

/** The screen's services, looking through a scope when there is one. */
function within(props: ScreenProps, scope: Scope | undefined): ScreenProps {
  return scope ? { ...props, state: scoped(props.state, scope) } : props;
}

/**
 * Static props with the bound ones applied over them.
 *
 * The emitter writes a ternary per bound key into the props object; this
 * computes the same thing at render, off the same condition. The one that
 * matters is `fill` on a selected option — it is why a tap changes the look
 * without anything re-fetching.
 */
function propsOf(
  node: TreeNode,
  props: ScreenProps,
  /** What the group above this node says a selection does — see `renderNode`. */
  select?: SourceAction[],
): Record<string, unknown> {
  const resolved: Record<string, unknown> = { ...node.props };

  Object.entries(node.bindings ?? {}).forEach(([key, binding]) => {
    if (isValueBinding(binding)) {
      // The prop is a value — a card's image from `$item`. Nothing read keeps
      // the static prop rather than blanking it.
      const value = valueOf(binding.value, props.state);
      if (value !== null && value !== undefined) resolved[key] = value;
      return;
    }
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

  /**
   * The tap, and the selection it reports.
   *
   * A group states once what answering its question does (`onSelect`); the
   * option that was tapped writes the answer and then carries that out. The
   * two are composed here rather than left to the platform, because the web
   * used to get it from a click bubbling up to the group and React Native has
   * no bubbling at all — the same artifact navigated in a browser and did
   * nothing on a phone.
   *
   * **A node declaring `onSelect` does not take its own `on` as a tap.** Both
   * hold the same actions; `on` is there so a 1.3 reader still finds them by
   * bubbling, and ignoring it here is what stops them running twice.
   *
   * The group's actions run only if the option's own did not end the chain —
   * `run` resolves `false` when a `wait` found its screen gone, and everything
   * after it is meant to be left undone.
   */
  const own = node.onSelect?.length ? undefined : node.on;
  const reports = node.onSelect?.length ? undefined : select;

  if (own?.length) {
    const actions = own;
    const after = reports;
    const context = { state: props.state, nav: props.nav, req: props.req };
    // Fire-and-forget on purpose: React does not await a handler, and the
    // actions write through the store, which is what re-renders.
    resolved.onClick = (): void => {
      void (async () => {
        const carried = await run(actions, context);
        if (carried && after?.length) await run(after, context);
      })();
    };
  }

  return resolved;
}

/**
 * A text node's params, as the copy lookup takes them.
 *
 * `undefined` when the node has none, so copy that was never interpolated is
 * never scanned (`runtime/rich-text`). A value that reads as nothing becomes an
 * empty string rather than leaving `{price}` on a card whose plan has no price.
 */
function paramsOf(
  node: Extract<TreeNode, { kind: "text" }>,
  props: ScreenProps,
): CopyParams | undefined {
  if (!node.params) return undefined;
  const params: Record<string, string | number> = {};
  Object.entries(node.params).forEach(([name, value]) => {
    const read = valueOf(value, props.state);
    params[name] = typeof read === "number" ? read : read === null || read === undefined ? "" : String(read);
  });
  return params;
}

type SlotFactory = (component: unknown, props: Record<string, unknown>) => ReactNode;

/** Everything a step needs to run — the same three `propsOf` hands a tap. */
type Doing = Parameters<typeof run>[1];

/**
 * A node's `load` steps, carried out when it appears.
 *
 * A component rather than a call inside the walk, because "when it appears" is
 * a mount and only React can say when one happened. It draws nothing of its own
 * — its children are the node — so a renderer sees the same tree it always did
 * with one more component in it.
 *
 * Once per appearance, not once per render: the steps write through the store,
 * which re-renders, and a re-run on every render would be a loader that
 * restarts its own animation forever. A node behind a `when` is not rendered
 * until the condition holds (see `renderNode`), so this mounts exactly when it
 * becomes visible — and again if it goes away and comes back, which is what a
 * card returning to a screen means by appearing.
 */
function Appeared({
  actions,
  doing,
  children,
}: {
  actions: SourceAction[];
  doing: Doing;
  children: ReactNode;
}): ReactNode {
  // Through a ref: the store is a new object on every render, and holding it in
  // the dependencies would run the steps again each time they changed it.
  const latest = useRef(doing);
  latest.current = doing;
  useEffect(() => {
    // Fire-and-forget, as a tap is: React does not await a handler.
    void run(actions, latest.current);
  }, [actions]);
  return children;
}

/**
 * One node — drawn, and told when it appeared.
 *
 * Presence is decided here rather than inside the drawing, so a node that is
 * not rendered mounts nothing: no `load` runs for a frame nobody can see, and
 * the moment its condition turns true is the moment its steps run.
 */
function renderNode(
  node: TreeNode,
  screen: ScreenProps,
  scope?: Scope,
  select?: SourceAction[],
): ReactNode {
  const props = within(screen, scope);
  if (node.when && !evaluate(node.when, props.state)) return null;

  const drawn = drawNode(node, screen, scope, select);
  if (!node.onLoad?.length) return drawn;
  return createElement(Appeared, {
    actions: node.onLoad,
    doing: { state: props.state, nav: props.nav, req: props.req },
    children: drawn,
  });
}

function drawNode(
  node: TreeNode,
  screen: ScreenProps,
  scope?: Scope,
  /**
   * What the nearest group above says a selection does.
   *
   * Handed down as data rather than as a closure so it runs in the scope of
   * the option that was tapped: inside a repeat, the group's steps read the
   * entry the visitor chose (`$item`), not the one the group was drawn with.
   */
  select?: SourceAction[],
): ReactNode {
  const props = within(screen, scope);
  /** Nearest group wins: a group inside a group answers its own question. */
  const below = node.onSelect?.length ? node.onSelect : select;

  /*
    Presence is `renderNode`'s, answered before this is called: `null` rather
    than an invisible frame, and before the children are walked — a node that is
    not drawn does not draw what is inside it, and a frame rendered at
    `opacity: 0` would still take its space and still take taps. The emitter
    reaches the same answer with a ternary around the same expression.
  */
  const resolved = propsOf(node, props, select);

  if (node.kind === "text") {
    const params = paramsOf(node, props);
    return props.ui.Text(resolved, params ? props.t(node.textKey, params) : props.t(node.textKey));
  }

  if (node.kind === "image") {
    // A bound source — a card's picture from `$item` — wins; the drawn one is
    // what shows while the value is not there yet.
    //
    // The design's own picture is `props.src` in a published tree (`node.src` in
    // an older one). Resolved props carry it too, so a source only counts as
    // bound when it differs from that — otherwise every picture read as data
    // and none was ever swapped for its translation.
    const authored = (node.props as { src?: unknown } | undefined)?.src;
    const own = typeof authored === "string" && authored ? authored : node.src;
    const bound =
      typeof resolved.src === "string" && resolved.src && resolved.src !== own ? resolved.src : null;
    // The drawn picture in the active language — its translated variant when
    // the locale carries one (see `localizedImage`). A bound value is data, not
    // a design asset, and is drawn as it came.
    const drawn = props.t.image && own ? props.t.image(own) : own;
    return props.ui.Image({ ...resolved, src: bound ?? drawn } as never);
  }

  if (node.kind === "input") {
    const { variable } = node;
    const context = { state: props.state, nav: props.nav, req: props.req };
    const { onChange, onLeave } = node;
    return props.ui.Input({
      ...resolved,
      // Bound both ways to the declared variable: what the visitor sees is what
      // the funnel holds, so navigating away and back keeps it.
      value: String(props.state.get(variable) ?? ""),
      // The answer is written first, so a check the field runs on change reads
      // what was just typed rather than the keystroke before it.
      onValue: (next: string) => {
        props.state.set(variable, next);
        if (onChange?.length) void run(onChange, context);
      },
      ...(onLeave?.length ? { onLeave: (): void => void run(onLeave, context) } : {}),
    } as never);
  }

  if (node.kind === "slot") {
    /**
     * A component the host draws, reporting back into the design.
     *
     * The design owns what happens: each report the component makes —
     * `purchase_click`, `success`, `decline` — runs the design's steps of that
     * name, with what it reported readable as `$event` (and `$payment`, which is
     * its name on a checkout). A host that provides no such component, or a
     * renderer with no `Slot`, draws nothing rather than failing the screen.
     */
    const Component = (props.c as Record<string, unknown> | undefined)?.[node.name];
    const Slot = (props.ui as { Slot?: SlotFactory }).Slot;
    if (!Component || !Slot) return null;
    const triggers = node.triggers ?? {};
    return Slot(Component, {
      ...resolved,
      trigger: (name: string, values?: Record<string, unknown>): Promise<boolean> => {
        const actions = triggers[name];
        if (!actions?.length) return Promise.resolve(true);
        const reported = within(screen, { ...scope, $event: values ?? {}, $payment: values ?? {} });
        return run(actions, { state: reported.state, nav: reported.nav, req: reported.req });
      },
    });
  }

  /**
   * A repeated frame: the container once, its children once per entry.
   *
   * The list is read now, so a request that fills it re-renders the screen
   * with the entries in it. Anything that is not a list draws an empty
   * container — the loading state of a catalogue that has not arrived.
   */
  if (node.repeat) {
    const list = valueOf(node.repeat.list, props.state);
    const entries = Array.isArray(list) ? list : [];
    return props.ui.Frame(
      resolved,
      entries.flatMap((item, index) =>
        node.children.map((child) =>
          renderNode(child, screen, { ...scope, $item: item, $index: index }, below),
        ),
      ),
    );
  }

  return props.ui.Frame(
    resolved,
    node.children.map((child) => renderNode(child, screen, scope, below)),
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
