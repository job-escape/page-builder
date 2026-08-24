/**
 * The half of a compiled funnel that is the same whatever the screens are made of.
 *
 * Entry, variables, reachability, overlay defaults and the per-screen read set:
 * everything a runtime needs before it has fetched a single screen. Extracted
 * from `emit.ts` when a second emitter arrived, because two emitters building
 * their own manifests is two manifests that eventually disagree — and the
 * disagreement would show up as a funnel that prefetches the wrong screen or
 * seeds the wrong variables, which is nobody's first guess.
 *
 * Sorted throughout. The same source has to produce identical bytes regardless
 * of the order rows came back from the database, or the artifact stops being
 * content-hashable and a rollback stops meaning anything.
 */
import type { VariableDecl } from "../types";
import type {
  SourceAction,
  SourceCondition,
  SourceFunnel,
  SourceScreen,
  SourceScreenPresentation,
} from "./source";

/**
 * How a screen behaves as a surface, fully resolved.
 *
 * Every field is present — a renderer reads it without knowing what a default
 * is. Two renderers each applying their own idea of "absent means true" is two
 * renderers that agree until one of them is edited.
 */
export type ScreenPresentation = Required<Omit<SourceScreenPresentation, "statusBar">> & {
  statusBar: NonNullable<SourceScreenPresentation["statusBar"]>;
  /**
   * The screen has a field someone types into, so the surface has to get out of
   * the way of a keyboard.
   *
   * **Derived, never authored.** The compiler can see an `input` frame; a
   * designer should not have to remember that one exists on this screen, and a
   * renderer should not have to walk the tree before it can lay out the host.
   */
  keyboard: boolean;
};

export type ScreenIndex = {
  id: string;
  next: string[];
  overlays: string[];
  presentation: ScreenPresentation;
  /**
   * Every variable this screen reads.
   *
   * Derived here because the compiler can see it and a renderer cannot without
   * re-walking the screen on every state change. A renderer that subscribes to
   * this instead of to the whole answer map does not re-render forty nodes on
   * every keystroke — survivable in a desktop browser, not on a phone.
   */
  reads: string[];
};

export type FunnelManifest = {
  version: string;
  entry: string;
  variables: VariableDecl[];
  overlayDefaults: Record<string, NonNullable<SourceScreen["overlay"]>>;
  /** Carried through so a published artifact is self-contained. */
  locales: Record<string, Record<string, string>>;
  screens: ScreenIndex[];
};

/** Every screen this one can reach, so the runtime can prefetch (§9.9). */
function reachable(screen: SourceScreen): { next: string[]; overlays: string[] } {
  const next = new Set<string>();
  const overlays = new Set<string>();

  const walk = (actions: SourceAction[]): void => {
    actions.forEach((action) => {
      if (action.type === "show") {
        (action.as === "overlay" ? overlays : next).add(action.target);
      }
      if (action.type === "conditional") {
        action.branches.forEach((branch) => walk(branch.do));
      }
    });
  };

  screen.frames.forEach((frame) =>
    frame.interactions?.forEach((interaction) => walk(interaction.do)),
  );

  return { next: [...next].sort(), overlays: [...overlays].sort() };
}

function variablesInCondition(condition: SourceCondition, into: Set<string>): void {
  switch (condition.op) {
    case "not":
      variablesInCondition(condition.of, into);
      return;
    case "and":
    case "or":
      condition.of.forEach((inner) => variablesInCondition(inner, into));
      return;
    default:
      into.add(condition.variable);
  }
}

function variablesInActions(actions: SourceAction[], into: Set<string>): void {
  actions.forEach((action) => {
    if (action.type === "conditional") {
      action.branches.forEach((branch) => {
        if (branch.when) variablesInCondition(branch.when, into);
        variablesInActions(branch.do, into);
      });
    }
    if (action.type === "submit") {
      // A payload built from answers is a read of every one of them.
      Object.values(action.fields ?? {}).forEach((variable) => into.add(variable));
      variablesInActions(action.onSuccess ?? [], into);
      variablesInActions(action.onError ?? [], into);
    }
  });
}

export function readsOf(screen: SourceScreen): string[] {
  const reads = new Set<string>();

  screen.frames.forEach((frame) => {
    Object.values(frame.bindings ?? {}).forEach((binding) =>
      variablesInCondition(binding.when, reads),
    );
    // An input shows what the funnel holds, so it reads as well as writes.
    if (frame.kind === "input" && frame.variable) reads.add(frame.variable);
    frame.interactions?.forEach((interaction) => variablesInActions(interaction.do, reads));
  });

  return [...reads].sort();
}

export function presentationOf(screen: SourceScreen): ScreenPresentation {
  const authored = screen.presentation ?? {};

  return {
    // Scrolling is the default because the alternative — content a visitor
    // cannot reach, with nothing on screen to suggest there is more — is the
    // worse failure of the two.
    scroll: authored.scroll ?? true,
    bleed: authored.bleed ?? false,
    statusBar: authored.statusBar ?? "auto",
    keyboard: screen.frames.some((frame) => frame.kind === "input"),
  };
}

export function sortedScreens(funnel: SourceFunnel): SourceScreen[] {
  return [...funnel.screens].sort((a, b) => a.id.localeCompare(b.id));
}

export function buildManifest(funnel: SourceFunnel): FunnelManifest {
  const screens = sortedScreens(funnel);
  const overlayDefaults: FunnelManifest["overlayDefaults"] = {};

  screens.forEach((screen) => {
    if (screen.overlay) overlayDefaults[screen.id] = screen.overlay;
  });

  return {
    version: funnel.version,
    entry: funnel.entry,
    variables: [...funnel.variables].sort((a, b) => a.name.localeCompare(b.name)),
    overlayDefaults,
    locales: funnel.locales ?? {},
    screens: screens.map((screen) => ({
      id: screen.id,
      ...reachable(screen),
      reads: readsOf(screen),
      presentation: presentationOf(screen),
    })),
  };
}
