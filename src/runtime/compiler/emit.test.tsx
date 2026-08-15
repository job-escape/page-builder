/**
 * The compiler, judged by what its output does rather than by how it looks.
 *
 * The important test here is the last block: a funnel described as *data* is
 * compiled to JavaScript, that JavaScript is evaluated, and the result is
 * rendered and clicked through. If design data in produces a working funnel out,
 * the whole chain holds — which is the claim the feature rests on.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";

import { Funnel, type ScreenModule } from "../client/funnel";
import { compile, emitCondition, emitScreen } from "./emit";
import type { SourceFunnel } from "./source";

/** A two-screen funnel with a choice, a bound appearance and a branch. */
const source: SourceFunnel = {
  id: 1234,
  version: "v1",
  entry: "s_goal",
  variables: [
    { name: "goal", type: "string" },
    { name: "gear", type: "list<string>", min: 1, max: 2 },
  ],
  screens: [
    {
      id: "s_goal",
      frames: [
        { id: "root", parent: null, kind: "frame", pos: "a0", props: { layout: "column", gap: 12, padding: 24 } },
        { id: "title", parent: "root", kind: "text", pos: "a0", textKey: "s_goal.title", props: { size: 24 } },
        {
          id: "o1",
          parent: "root",
          kind: "frame",
          pos: "a1",
          props: { padding: 16, radius: 12, testId: "o1", role: "radio" },
          bindings: {
            fill: { when: { op: "has", variable: "goal", value: "muscle" }, whenTrue: "#eef2ff", whenFalse: "#fff" },
            ariaChecked: { when: { op: "has", variable: "goal", value: "muscle" }, whenTrue: true, whenFalse: false },
          },
          interactions: [
            {
              on: { event: "click" },
              do: [
                { type: "select", variable: "goal", value: "muscle" },
                { type: "show", target: "s_gear" },
              ],
            },
          ],
        },
        { id: "o1label", parent: "o1", kind: "text", pos: "a0", textKey: "s_goal.o1" },
      ],
    },
    {
      id: "s_gear",
      frames: [
        { id: "groot", parent: null, kind: "frame", pos: "a0", props: { layout: "column", gap: 12, padding: 24 } },
        { id: "gtitle", parent: "groot", kind: "text", pos: "a0", textKey: "s_gear.title" },
        {
          id: "g1",
          parent: "groot",
          kind: "frame",
          pos: "a1",
          props: { testId: "g1", padding: 16 },
          bindings: {
            ariaChecked: { when: { op: "has", variable: "gear", value: "bands" }, whenTrue: true, whenFalse: false },
          },
          interactions: [{ on: { event: "click" }, do: [{ type: "select", variable: "gear", value: "bands" }] }],
        },
        {
          id: "cont",
          parent: "groot",
          kind: "frame",
          pos: "a2",
          props: { testId: "continue", padding: 16 },
          interactions: [
            {
              on: { event: "click" },
              do: [
                {
                  type: "conditional",
                  branches: [
                    { when: { op: "meetsMin", variable: "gear" }, do: [{ type: "show", target: "s_done" }] },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: "why",
          parent: "groot",
          kind: "frame",
          pos: "a3",
          props: { testId: "why", padding: 8 },
          interactions: [
            { on: { event: "click" }, do: [{ type: "show", target: "d_why", as: "overlay", position: "bottom" }] },
          ],
        },
      ],
    },
    {
      id: "d_why",
      overlay: { position: "bottom", dim: true },
      frames: [
        { id: "wroot", parent: null, kind: "frame", pos: "a0", props: { padding: 24, fill: "#fff", testId: "sheet" } },
        { id: "wtext", parent: "wroot", kind: "text", pos: "a0", textKey: "d_why.body" },
      ],
    },
    {
      id: "s_done",
      frames: [
        { id: "droot", parent: null, kind: "frame", pos: "a0", props: { padding: 24 } },
        { id: "dtext", parent: "droot", kind: "text", pos: "a0", textKey: "s_done.title" },
      ],
    },
  ],
};

const locale = {
  "s_goal.title": "What's your goal?",
  "s_goal.o1": "Build muscle",
  "s_gear.title": "What do you have?",
  "d_why.body": "We ask so the plan fits.",
  "s_done.title": "All set",
};

describe("conditions become helper calls, never inlined operators", () => {
  it.each([
    [{ op: "has", variable: "gear", value: "bands" }, 'state.has("gear","bands")'],
    [{ op: "isSet", variable: "goal" }, 'state.isSet("goal")'],
    [{ op: "atMax", variable: "gear" }, 'state.atMax("gear")'],
    [{ op: "count", variable: "gear", cmp: "gte", value: 2 }, 'state.count("gear") >= 2'],
  ] as const)("%j", (condition, expected) => {
    expect(emitCondition(condition).replace(/,\s+/g, ",")).toBe(expected);
  });

  it("composes and/or/not as real JavaScript", () => {
    const emitted = emitCondition({
      op: "and",
      of: [
        { op: "has", variable: "gear", value: "bands" },
        { op: "not", of: { op: "isEmpty", variable: "goal" } },
      ],
    });
    expect(emitted).toContain("&&");
    expect(emitted).toContain("!(");
  });
});

describe("the compiler is deterministic", () => {
  it("produces identical bytes for the same source", () => {
    expect(JSON.stringify(compile(source))).toBe(JSON.stringify(compile(source)));
  });

  it("is unaffected by the order screens arrive in", () => {
    const shuffled = { ...source, screens: [...source.screens].reverse() };
    expect(JSON.stringify(compile(shuffled))).toBe(JSON.stringify(compile(source)));
  });
});

describe("the manifest", () => {
  const { manifest } = compile(source);

  it("carries the declared variables and entry", () => {
    expect(manifest.entry).toBe("s_goal");
    expect(manifest.variables.map((v) => v.name)).toEqual(["gear", "goal"]);
  });

  it("derives reachability, so the runtime can prefetch", () => {
    const gear = manifest.screens.find((s) => s.id === "s_gear");
    expect(gear?.next).toEqual(["s_done"]);
    expect(gear?.overlays).toEqual(["d_why"]);
  });

  it("finds targets inside conditional branches", () => {
    expect(manifest.screens.find((s) => s.id === "s_gear")?.next).toContain("s_done");
  });

  it("carries per-frame overlay defaults", () => {
    expect(manifest.overlayDefaults.d_why).toEqual({ position: "bottom", dim: true });
  });
});

describe("emitted modules contain no literal copy", () => {
  it("every user-visible string is a t() key", () => {
    const { modules } = compile(source);
    Object.values(modules).forEach((code) => {
      expect(code).not.toContain("What's your goal?");
      expect(code).toContain("t(");
    });
  });
});

/**
 * The claim the whole feature rests on: design data compiles to JavaScript that
 * actually runs. The modules are evaluated exactly as the runtime would — a
 * function of the injected scope, with no imports of its own.
 */
describe("compiled output runs", () => {
  const build = () => {
    const { manifest, modules } = compile(source);

    const screens: Record<string, ScreenModule> = {};
    Object.entries(modules).forEach(([id, code]) => {
      // `export default function Screen` → a value we can call.
      const body = `${code.replace("export default function Screen", "return function Screen")}`;
      // eslint-disable-next-line no-new-func -- this is what the runtime does with a fetched module
      screens[id] = new Function(body)() as ScreenModule;
    });

    return { manifest, screens };
  };

  const mount = () => {
    const { manifest, screens } = build();
    return render(
      <Funnel
        manifest={{
          entry: manifest.entry,
          variables: manifest.variables,
          overlayDefaults: manifest.overlayDefaults,
        }}
        screens={screens}
        locale={locale}
      />,
    );
  };

  it("renders the entry screen from compiled code", () => {
    mount();
    expect(screen.getByText("What's your goal?")).toBeInTheDocument();
  });

  it("a compiled interaction writes state and navigates", () => {
    mount();
    fireEvent.click(screen.getByTestId("o1"));
    expect(screen.getByText("What do you have?")).toBeInTheDocument();
  });

  it("a compiled binding drives appearance from a comparison", () => {
    mount();
    expect(screen.getByTestId("o1")).toHaveAttribute("aria-checked", "false");
    // Selecting is what flips it — the binding is re-evaluated, not toggled.
    fireEvent.click(screen.getByTestId("o1"));
    fireEvent.click(screen.getByTestId("g1"));
    expect(screen.getByTestId("g1")).toHaveAttribute("aria-checked", "true");
  });

  it("a compiled conditional gates navigation", () => {
    mount();
    fireEvent.click(screen.getByTestId("o1"));

    // The min is not met, so the branch does not fire.
    fireEvent.click(screen.getByTestId("continue"));
    expect(screen.getByText("What do you have?")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("g1"));
    fireEvent.click(screen.getByTestId("continue"));
    expect(screen.getByText("All set")).toBeInTheDocument();
  });

  it("a compiled overlay opens over the screen and dismisses", () => {
    mount();
    fireEvent.click(screen.getByTestId("o1"));
    fireEvent.click(screen.getByTestId("why"));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("What do you have?")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("copy travels with the artifact", () => {
  it("carries the locale bundle into the manifest", () => {
    const withCopy = { ...source, locales: { en: { "s1.title": "Hello" } } };
    expect(compile(withCopy).manifest.locales.en["s1.title"]).toBe("Hello");
  });

  it("is an empty map when nothing has been authored", () => {
    expect(compile(source).manifest.locales).toEqual({});
  });

  it("never puts the words in a module — only the key", () => {
    const withCopy = { ...source, locales: { en: { "s_goal.title": "What's your goal?" } } };
    const { modules } = compile(withCopy);
    Object.values(modules).forEach((code) => {
      expect(code).not.toContain("What's your goal?");
    });
  });
});

describe("an input field", () => {
  const inputFrame = {
    id: "f1",
    name: "Email",
    parent: null,
    kind: "input" as const,
    pos: "a0",
    variable: "email",
    props: { placeholder: "you@example.com", type: "email" },
    textKey: null,
    interactions: [],
    bindings: {},
  };

  it("binds both ways to the declared variable", () => {
    const code = emitScreen({ id: "s1", name: "Lead", frames: [inputFrame] });

    // Reading and writing the same name is what makes the answer survive
    // navigating away and back.
    expect(code).toContain('value: String(state.get("email") ?? "")');
    expect(code).toContain('onValue: (next) => state.set("email", next)');
  });

  it("carries its own props through untouched", () => {
    const code = emitScreen({ id: "s1", name: "Lead", frames: [inputFrame] });

    expect(code).toContain('"placeholder": "you@example.com"');
    expect(code).toContain('"type": "email"');
  });
});

describe("submitting to a backend", () => {
  const submitting = {
    id: "f1",
    name: "Submit",
    parent: null,
    kind: "frame" as const,
    pos: "a0",
    props: {},
    textKey: null,
    bindings: {},
    interactions: [
      {
        on: { event: "click" as const },
        do: [
          {
            type: "submit" as const,
            action: "leads.create",
            fields: { email: "email" },
            into: { leadId: "id" },
            errorInto: "submitError",
            onSuccess: [{ type: "show" as const, target: "s_thanks" }],
          },
        ],
      },
    ],
  };

  const code = () => emitScreen({ id: "s1", name: "Lead", frames: [submitting] });

  it("emits a name, never a URL — the artifact is a public file", () => {
    expect(code()).toContain('await req("leads.create"');
    expect(code()).not.toMatch(/https?:\/\//);
  });

  it("reads the payload at click time, so no answer is baked in", () => {
    expect(code()).toContain('"email": state.get("email")');
  });

  it("writes the response into the variables asked for", () => {
    expect(code()).toContain('state.set("leadId", r["id"] ?? null)');
  });

  it("is a real try/catch, not a serialized error structure", () => {
    // The whole point of compiling: control flow is control flow. A branch
    // table would need something at runtime to walk it.
    expect(code()).toContain("try {");
    expect(code()).toContain("} catch (e) {");
    expect(code()).toContain('state.set("submitError", e.message)');
  });

  it("runs the success branch inside the try, after the call", () => {
    const emitted = code();
    expect(emitted.indexOf('nav.show("s_thanks"')).toBeGreaterThan(emitted.indexOf("await req("));
    expect(emitted.indexOf('nav.show("s_thanks"')).toBeLessThan(emitted.indexOf("} catch"));
  });
});

describe("the handler around a backend call", () => {
  const withSubmit = (steps: unknown[]) => ({
    id: "f1",
    name: "Submit",
    parent: null,
    kind: "frame" as const,
    pos: "a0",
    props: {},
    textKey: null,
    bindings: {},
    interactions: [{ on: { event: "click" as const }, do: steps as never }],
  });

  it("is async when it awaits, or the module throws on parse", () => {
    // A plain arrow around an `await` is not a slow funnel, it is no funnel:
    // the module fails to parse and the screen renders as nothing.
    const code = emitScreen({
      id: "s1",
      name: "Lead",
      frames: [withSubmit([{ type: "submit", action: "leads.create" }])],
    });

    expect(code).toContain("onClick: async () =>");
  });

  it("is async when the call is buried in a branch, which is the normal shape", () => {
    // A guard before the call — "only submit when the field is filled" — puts
    // the await one level down, where a shallow check would miss it.
    const code = emitScreen({
      id: "s1",
      name: "Lead",
      frames: [
        withSubmit([
          {
            type: "conditional",
            branches: [
              { when: { op: "isSet", variable: "email" }, do: [{ type: "submit", action: "leads.create" }] },
            ],
          },
        ]),
      ],
    });

    expect(code).toContain("onClick: async () =>");
  });

  it("stays a plain arrow when nothing awaits", () => {
    const code = emitScreen({
      id: "s1",
      name: "Lead",
      frames: [withSubmit([{ type: "show", target: "s2" }])],
    });

    expect(code).toContain("onClick: () =>");
    expect(code).not.toContain("async");
  });
});
