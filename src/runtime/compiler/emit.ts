/**
 * Design data in, JavaScript out.
 *
 * The compiler reads the editor's frames and emits one module per screen, in
 * exactly the shape the runtime already consumes — a function of
 * `{ ui, c, t, state, nav }` with no imports of its own. Nothing it emits is
 * interpreted at runtime: conditions become real `if`s, interactions become real
 * calls. Only the primitives that must behave identically across every funnel
 * are helper calls (`state.has`, `nav.show`), and those come in through the
 * argument rather than through an import.
 *
 * Two rules, both load-bearing:
 *
 * - **Deterministic.** The same source produces the same bytes, which is what
 *   makes the artifact content-hashable, cacheable and a rollback meaningful.
 * - **Total.** Every document the editor can produce compiles. A compiler that
 *   can reject its own editor's output is a support queue.
 */
import type { VariableDecl } from "../types";
import type {
  SourceAction,
  SourceCondition,
  SourceFrame,
  SourceFunnel,
  SourceScreen,
} from "./source";

export type CompiledFunnel = {
  manifest: {
    version: string;
    entry: string;
    variables: VariableDecl[];
    overlayDefaults: Record<string, NonNullable<SourceScreen["overlay"]>>;
    screens: Array<{ id: string; next: string[]; overlays: string[] }>;
  };
  /** Screen id → module source. */
  modules: Record<string, string>;
};

/** JSON is the safe encoder for every literal the editor can produce. */
const lit = (value: unknown): string => JSON.stringify(value ?? null);

/** A condition becomes a helper call — never an inlined JS operator (§9.8a). */
export function emitCondition(condition: SourceCondition): string {
  switch (condition.op) {
    case "has":
      return `state.has(${lit(condition.variable)}, ${lit(condition.value)})`;
    case "eq":
      return `state.get(${lit(condition.variable)}) === ${lit(condition.value)}`;
    case "neq":
      return `state.get(${lit(condition.variable)}) !== ${lit(condition.value)}`;
    case "isSet":
      return `state.isSet(${lit(condition.variable)})`;
    case "isEmpty":
      return `state.isEmpty(${lit(condition.variable)})`;
    case "atMax":
      return `state.atMax(${lit(condition.variable)})`;
    case "meetsMin":
      return `state.meetsMin(${lit(condition.variable)})`;
    case "count": {
      const op = condition.cmp === "gte" ? ">=" : condition.cmp === "lte" ? "<=" : "===";
      return `state.count(${lit(condition.variable)}) ${op} ${condition.value}`;
    }
    case "not":
      return `!(${emitCondition(condition.of)})`;
    case "and":
      return condition.of.length ? `(${condition.of.map(emitCondition).join(" && ")})` : "true";
    case "or":
      return condition.of.length ? `(${condition.of.map(emitCondition).join(" || ")})` : "false";
    default:
      // Total by construction: an unknown op compiles to a condition that is
      // simply false rather than failing the build or throwing at runtime.
      return "false";
  }
}

function emitAction(action: SourceAction, indent: string): string {
  switch (action.type) {
    case "select":
      return `${indent}state.select(${lit(action.variable)}, ${lit(action.value)});`;
    case "set":
      return `${indent}state.set(${lit(action.variable)}, ${lit(action.value)});`;
    case "close":
      return `${indent}nav.close();`;
    case "show": {
      const presentation: Record<string, unknown> = {};
      if (action.as) presentation.as = action.as;
      if (action.position) presentation.position = action.position;
      if (action.dim !== undefined) presentation.dim = action.dim;
      if (action.closeOnOutside !== undefined) presentation.closeOnOutside = action.closeOnOutside;
      const options = Object.keys(presentation).length ? `, ${lit(presentation)}` : "";
      return `${indent}nav.show(${lit(action.target)}${options});`;
    }
    case "conditional": {
      // Real control flow — an `if` chain, not a serialized branch table.
      const lines: string[] = [];
      action.branches.forEach((branch, index) => {
        const body = branch.do.map((inner) => emitAction(inner, `${indent}  `)).join("\n");
        if (!branch.when) {
          lines.push(`${indent}${index === 0 ? "" : "else "}{\n${body}\n${indent}}`);
          return;
        }
        const keyword = index === 0 ? "if" : "else if";
        lines.push(`${indent}${keyword} (${emitCondition(branch.when)}) {\n${body}\n${indent}}`);
      });
      return lines.join("\n");
    }
    default:
      return `${indent}/* unsupported action */`;
  }
}

function emitHandler(frame: SourceFrame, indent: string): string | null {
  const actions = frame.interactions?.flatMap((interaction) => interaction.do) ?? [];
  if (actions.length === 0) return null;
  const body = actions.map((action) => emitAction(action, `${indent}    `)).join("\n");
  return `${indent}  onClick: () => {\n${body}\n${indent}  },`;
}

/** Static props merged with bound ones, bound values expressed as ternaries. */
function emitProps(frame: SourceFrame, indent: string): string {
  const lines: string[] = [];

  Object.entries(frame.props ?? {}).forEach(([key, value]) => {
    lines.push(`${indent}  ${JSON.stringify(key)}: ${lit(value)},`);
  });

  Object.entries(frame.bindings ?? {}).forEach(([key, binding]) => {
    lines.push(
      `${indent}  ${JSON.stringify(key)}: ${emitCondition(binding.when)}` +
        ` ? ${lit(binding.whenTrue)} : ${lit(binding.whenFalse)},`,
    );
  });

  const handler = emitHandler(frame, indent);
  if (handler) lines.push(handler);

  return lines.join("\n");
}

function emitFrame(frame: SourceFrame, all: SourceFrame[], depth: number): string {
  const indent = "  ".repeat(depth + 2);
  const children = all
    .filter((candidate) => candidate.parent === frame.id)
    .sort((a, b) => (a.pos ?? "").localeCompare(b.pos ?? ""));

  if (frame.kind === "text") {
    return `${indent}ui.Text({\n${emitProps(frame, indent)}\n${indent}}, t(${lit(frame.textKey)}))`;
  }

  if (frame.kind === "image") {
    return `${indent}ui.Image({\n${emitProps(frame, indent)}\n${indent}  src: ${lit(frame.src)},\n${indent}})`;
  }

  const inner = children.map((child) => emitFrame(child, all, depth + 1)).join(",\n");
  const body = children.length ? `, [\n${inner}\n${indent}]` : "";
  return `${indent}ui.Frame({\n${emitProps(frame, indent)}\n${indent}}${body})`;
}

export function emitScreen(screen: SourceScreen): string {
  const roots = screen.frames
    .filter((frame) => frame.parent === null)
    .sort((a, b) => (a.pos ?? "").localeCompare(b.pos ?? ""));

  const body = roots.map((frame) => emitFrame(frame, screen.frames, 0)).join(",\n");

  return [
    `// ${screen.id} — generated, do not edit`,
    `export default function Screen({ ui, c, t, state, nav }) {`,
    `  return [`,
    body,
    `  ];`,
    `}`,
    ``,
  ].join("\n");
}

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

export function compile(funnel: SourceFunnel): CompiledFunnel {
  const modules: Record<string, string> = {};
  const overlayDefaults: CompiledFunnel["manifest"]["overlayDefaults"] = {};

  // Sorted so the output is byte-identical for the same input regardless of the
  // order rows came back from the database.
  const screens = [...funnel.screens].sort((a, b) => a.id.localeCompare(b.id));

  screens.forEach((screen) => {
    modules[screen.id] = emitScreen(screen);
    if (screen.overlay) overlayDefaults[screen.id] = screen.overlay;
  });

  return {
    manifest: {
      version: funnel.version,
      entry: funnel.entry,
      variables: [...funnel.variables].sort((a, b) => a.name.localeCompare(b.name)),
      overlayDefaults,
      screens: screens.map((screen) => ({ id: screen.id, ...reachable(screen) })),
    },
    modules,
  };
}
