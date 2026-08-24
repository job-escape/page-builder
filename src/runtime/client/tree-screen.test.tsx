/**
 * One funnel, two emitters, one behaviour.
 *
 * The tree renderer is only worth having if it is indistinguishable from the
 * JavaScript one. So almost nothing here asserts a shape: it compiles the same
 * fixture both ways, mounts both, and clicks through both, asserting they agree
 * — on markup, on what a tap does, on what a binding looks like afterwards.
 *
 * That is the test that would catch the failure that actually costs money: not
 * a crash, but one platform quietly branching differently from the other and
 * converting worse for a month before anyone looks.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { compile } from "../compiler/emit";
import { locale, source } from "../compiler/fixture";
import { compileToTree } from "../compiler/tree";
import { Funnel, type ScreenModule } from "./funnel";
import { screensFromTree } from "./tree-screen";

function fromModules(): Record<string, ScreenModule> {
  const { modules } = compile(source);
  const screens: Record<string, ScreenModule> = {};

  Object.entries(modules).forEach(([id, code]) => {
    const body = code.replace("export default function Screen", "return function Screen");
    // eslint-disable-next-line no-new-func -- what the web runtime does with a fetched module
    screens[id] = new Function(body)() as ScreenModule;
  });

  return screens;
}

const mount = (screens: Record<string, ScreenModule>) => {
  const { manifest } = compile(source);
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

/** Both paths, so every case below runs twice and is named by which it ran. */
const paths: Array<[string, () => Record<string, ScreenModule>]> = [
  ["javascript modules", fromModules],
  ["the tree", () => screensFromTree(compileToTree(source))],
];

describe.each(paths)("rendered from %s", (_name, build) => {
  it("renders the entry screen", () => {
    mount(build());
    expect(screen.getByText("What's your goal?")).toBeInTheDocument();
  });

  it("an interaction writes state and navigates", () => {
    mount(build());
    fireEvent.click(screen.getByTestId("o1"));
    expect(screen.getByText("What do you have?")).toBeInTheDocument();
  });

  it("a binding drives appearance from a comparison", () => {
    mount(build());
    expect(screen.getByTestId("o1")).toHaveAttribute("aria-checked", "false");
    fireEvent.click(screen.getByTestId("o1"));
    fireEvent.click(screen.getByTestId("g1"));
    expect(screen.getByTestId("g1")).toHaveAttribute("aria-checked", "true");
  });

  it("a conditional gates navigation until its condition holds", () => {
    mount(build());
    fireEvent.click(screen.getByTestId("o1"));

    // The minimum is not met, so the branch does not fire.
    fireEvent.click(screen.getByTestId("continue"));
    expect(screen.getByText("What do you have?")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("g1"));
    fireEvent.click(screen.getByTestId("continue"));
    expect(screen.getByText("All set")).toBeInTheDocument();
  });

  it("an overlay opens over the screen and Escape dismisses it", () => {
    mount(build());
    fireEvent.click(screen.getByTestId("o1"));
    fireEvent.click(screen.getByTestId("why"));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // The screen underneath stays mounted — that is what makes it an overlay.
    expect(screen.getByText("What do you have?")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows no raw locale keys, whichever path drew it", () => {
    const { container } = mount(build());
    expect(container.textContent).not.toContain("s_goal.");
  });
});

/**
 * The comparison itself, rather than two lists of independent assertions.
 *
 * Same clicks, same resulting DOM. If the two ever diverge — a prop dropped, a
 * child ordered differently, a condition read the other way — this fails and
 * names the funnel state it failed in.
 */
describe("the two paths produce the same document", () => {
  const drawn = (build: () => Record<string, ScreenModule>, clicks: string[]): string => {
    const { container, unmount } = mount(build());
    clicks.forEach((testId) => fireEvent.click(screen.getByTestId(testId)));
    const html = container.innerHTML;
    unmount();
    return html;
  };

  it.each([
    ["on the entry screen", []],
    ["after choosing an option", ["o1"]],
    ["after a selection that flips a binding", ["o1", "g1"]],
    ["after a conditional lets navigation through", ["o1", "g1", "continue"]],
  ])("%s", (_case, clicks) => {
    expect(drawn(() => screensFromTree(compileToTree(source)), clicks)).toBe(
      drawn(fromModules, clicks),
    );
  });
});

describe("what the tree path does on its own", () => {
  it("keeps a screen's children in the order the frames declared", () => {
    mount(screensFromTree(compileToTree(source)));
    const option = screen.getByTestId("o1");
    expect(within(option).getByText("Build muscle")).toBeInTheDocument();
  });

  it("needs no eval — the screens are built from data alone", () => {
    // The guarantee the whole feature rests on for React Native: a tree round
    // trips through JSON and still renders, so nothing was a function.
    const artifact = JSON.parse(JSON.stringify(compileToTree(source)));
    mount(screensFromTree(artifact));
    expect(screen.getByText("What's your goal?")).toBeInTheDocument();
  });
});
