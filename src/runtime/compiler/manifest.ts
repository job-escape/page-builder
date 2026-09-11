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
import type { RichText } from "../rich-text";
import type { ResolvedTokens } from "../style/tokens";
import type { VariableDecl } from "../types";
import {
  isCaseBinding,
  type SourceAction,
  type SourceCondition,
  type SourceValue,
  type SourceFunnel,
  type SourceScreen,
  type SourceScreenPresentation,
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
  /**
   * What runs when this screen opens: its own frame's `load` steps, in order.
   *
   * Here rather than in the screen module or its tree, because opening is a
   * moment in the funnel and not something drawn — so one place, `funnel-core`,
   * runs it for both artifacts on every platform, where two emitters each
   * wiring an effect would be two answers to "when". Absent when the screen
   * does nothing on opening, so a funnel without any publishes the same bytes.
   */
  enter?: SourceAction[];
};

export type FunnelManifest = {
  version: string;
  entry: string;
  variables: VariableDecl[];
  overlayDefaults: Record<string, NonNullable<SourceScreen["overlay"]>>;
  /**
   * The words, by locale then key. Carried through so a published artifact is
   * self-contained.
   *
   * `RichText`, not `string`. Copy has carried emphasis since runs shipped, the
   * editor projects run lists into this map, and `ui.Text` renders them — this
   * type was the last place still saying otherwise, which made a formatted
   * headline in a published manifest a lie the compiler agreed with. A bare
   * string is one unmarked run and always will be, so nothing that has never
   * been formatted changes shape. See `runtime/rich-text`.
   */
  locales: Record<string, Record<string, RichText>>;
  /**
   * Where each locale's words live, when they do not live inline.
   *
   * Content-addressed, one file per locale, so a visitor fetches the language
   * they are reading rather than all twelve — and changing one Spanish word
   * re-uploads one small file while every other locale keeps its CDN copy.
   *
   * **The default locale is never here.** It stays in `locales` above, because
   * it is what a missing key falls back to and a fallback that could fail to
   * arrive is not one.
   *
   * Absent on every artifact published before bundles existed, which is why
   * `loadLocale` reads both shapes. See `runtime/locale`.
   */
  localeBundles?: Record<string, string>;
  /**
   * What a renderer needs to know about a locale beyond its words — today,
   * which way its script runs.
   *
   * Optional, and `runtime/locale` knows the base languages that run
   * right-to-left on its own, so an artifact published without this still
   * lays out Arabic correctly. This is how a publish overrides that.
   */
  localeMeta?: Record<string, { dir?: "ltr" | "rtl" }>;
  /**
   * The locale this funnel was authored in — what every other locale falls
   * back to. Absent means `en`, which is what every artifact so far assumed.
   */
  defaultLocale?: string;
  /**
   * Every fact about the visitor this funnel branches on, sorted.
   *
   * **The host's shopping list.** These are not variables and the store cannot
   * produce them: they are what was true of somebody before they arrived, and
   * only the page serving the funnel can answer them — from the URL's campaign
   * tags, a geo header, the platform it is running on. The host reads this,
   * resolves what it can, and hands the answers to `createFunnelStore`.
   *
   * At the **funnel** level rather than per screen, unlike `reads`. A condition
   * can hide a frame on the entry screen, so every fact has to be resolved
   * before the first paint — there is no per-screen moment to do it in — and
   * the host resolves them once from a request it already has.
   *
   * Empty for a funnel that asks nothing, which is every funnel published
   * before conditions existed. A host that finds it absent should read it as
   * empty rather than as unknown: this field arriving is what tells a host it
   * has anything to look up at all.
   */
  visitorFacts: string[];
  screens: ScreenIndex[];
  /**
   * The design's palette, every alias already followed, by mode then path.
   *
   * **Added by publish, not by this compiler** — the server owns alias
   * resolution and is the only place that can, since the editor asks it the
   * same question through `compile/`. Optional because a project without a
   * palette publishes without one, and a funnel that had none before this
   * existed must produce the same bytes.
   */
  tokens?: ResolvedTokens;
  /** Which of those modes to paint when nothing else says. Added by publish. */
  defaultMode?: string;
  /** The same design in other brands. Added by publish; see `runtime/variant`. */
  themes?: Record<string, ResolvedTokens>;
  defaultVariant?: string;
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

/**
 * A screen's opening steps — see `ScreenIndex.enter`.
 *
 * Read off its top-level frames, which is the screen itself: the frame a
 * designer selects to say what happens when it opens. A `load` on something
 * nested would be a frame appearing, which is a different question.
 */
function enterOf(screen: SourceScreen): { enter?: SourceAction[] } {
  const enter = screen.frames
    .filter((frame) => frame.parent === null)
    .sort((a, b) => (a.pos ?? "").localeCompare(b.pos ?? ""))
    .flatMap(
      (frame) =>
        frame.interactions
          ?.filter((interaction) => interaction.on?.event === "load")
          .flatMap((interaction) => interaction.do) ?? [],
    );
  return enter.length ? { enter } : {};
}

/** The variables and visitor facts a function's value reads. */
function namesInValue(value: SourceValue, variables: Set<string>, facts: Set<string>): void {
  if ("var" in value) {
    if (value.var) variables.add(value.var);
    return;
  }
  if ("visitor" in value) {
    if (value.visitor) facts.add(value.visitor);
    return;
  }
  if ("fn" in value) value.args.forEach((arg) => namesInValue(arg, variables, facts));
}

/** Every value a function or comparison leaf reads. */
function valuesOf(condition: SourceCondition): SourceValue[] {
  if (condition.op === "fn") return condition.args;
  if (condition.op === "cmp") return [condition.left, condition.right];
  return [];
}

function variablesInCondition(condition: SourceCondition, into: Set<string>): void {
  switch (condition.op) {
    // Not a variable. A visitor fact is read off the host rather than out of
    // the store, so declaring it as one would put a name in `reads` that the
    // store has no declaration for — which is exactly what `onUnknown` reports
    // as a compiler bug. It is collected by `visitorFactsInCondition` instead.
    case "visitor":
      return;
    case "fn":
    case "cmp":
      valuesOf(condition).forEach((value) => namesInValue(value, into, new Set()));
      return;
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

/**
 * Every visitor property a condition names.
 *
 * Its own walk rather than a second `into` on the one above, because the two
 * answer different questions for different readers: `reads` tells the *store*
 * which variables a screen touches, and this tells the **host** which facts it
 * has to look up before the screen can be rendered.
 *
 * Emitted at compile time because nothing recovers it afterwards. A compiled
 * module's conditions live inside closures and cannot be read without running
 * them (§9.8a) — so a host that had to discover which facts a funnel wanted
 * would have to resolve *all* of them, which for a geo lookup is a request per
 * page view for a funnel that may not ask.
 */
function visitorFactsInCondition(condition: SourceCondition, into: Set<string>): void {
  switch (condition.op) {
    case "visitor":
      if (condition.property) into.add(condition.property);
      return;
    case "fn":
    case "cmp":
      valuesOf(condition).forEach((value) => namesInValue(value, new Set(), into));
      return;
    case "not":
      visitorFactsInCondition(condition.of, into);
      return;
    case "and":
    case "or":
      condition.of.forEach((inner) => visitorFactsInCondition(inner, into));
      return;
    default:
      return;
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
    Object.values(frame.bindings ?? {}).forEach((binding) => {
      if (isCaseBinding(binding)) {
        binding.cases.forEach((entry) => variablesInCondition(entry.when, reads));
        return;
      }
      variablesInCondition(binding.when, reads);
    });
    // Presence reads too. A screen whose only mention of `$platform` is the
    // frame it hides still has to declare it, or the variable is undefined at
    // render and the frame appears everywhere.
    if (frame.when) variablesInCondition(frame.when, reads);
    // An input shows what the funnel holds, so it reads as well as writes.
    if (frame.kind === "input" && frame.variable) reads.add(frame.variable);
    frame.interactions?.forEach((interaction) => variablesInActions(interaction.do, reads));
  });

  return [...reads].sort();
}

/**
 * Every visitor fact a funnel reads — the union across its screens.
 *
 * Walks the same three places `readsOf` does: a frame's presence condition, the
 * conditions behind a bound prop, and the branches inside an interaction. A
 * fact named in any of them is a fact the host has to be able to answer, and
 * missing one means a frame that quietly never appears.
 */
export function visitorFactsOf(funnel: SourceFunnel): string[] {
  const facts = new Set<string>();

  funnel.screens.forEach((screen) => {
    screen.frames.forEach((frame) => {
      if (frame.when) visitorFactsInCondition(frame.when, facts);

      Object.values(frame.bindings ?? {}).forEach((binding) => {
        if (isCaseBinding(binding)) {
          binding.cases.forEach((entry) => visitorFactsInCondition(entry.when, facts));
          return;
        }
        visitorFactsInCondition(binding.when, facts);
      });

      frame.interactions?.forEach((interaction) => {
        const walk = (actions: SourceAction[]): void => {
          actions.forEach((action) => {
            if (action.type !== "conditional") return;
            action.branches.forEach((branch) => {
              if (branch.when) visitorFactsInCondition(branch.when, facts);
              walk(branch.do);
            });
          });
        };
        walk(interaction.do);
      });
    });
  });

  return [...facts].sort();
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
    // None unless a designer picked one: a funnel published before transitions
    // existed must not start moving because its renderer learned how.
    transition: authored.transition ?? "none",
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
    visitorFacts: visitorFactsOf(funnel),
    screens: screens.map((screen) => ({
      id: screen.id,
      ...reachable(screen),
      reads: readsOf(screen),
      presentation: presentationOf(screen),
      ...enterOf(screen),
    })),
  };
}
