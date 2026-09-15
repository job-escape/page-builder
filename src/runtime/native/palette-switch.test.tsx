import "@testing-library/jest-dom";
import { act, render, screen } from "@testing-library/react";

import type { SourceFunnel } from "../compiler/source";
import { compileToTree } from "../compiler/tree";
import { screensFromTree } from "../client/tree-screen";

jest.mock("react-native-safe-area-context", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement, Fragment } = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const insets = require("./safe-area-mock").IPHONE_INSETS;
  return {
    SafeAreaProvider: ({ children }: { children: unknown }) => createElement(Fragment, null, children),
    useSafeAreaInsets: () => insets,
  };
});

// eslint-disable-next-line import/first
import { Funnel } from "./funnel";

const wait = (ms: number) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

it("repaints when a step changes the palette variable at the end of a countdown", async () => {
  const source = {
    id: "palette-native",
    version: "v1",
    entry: "s1",
    variables: [
      { name: "theme", type: "string", palette: "mode", default: "dark" },
      { name: "endsAt", type: "number" },
      { name: "left", type: "number", formula: { fn: "max", args: [{ lit: 0 }, { fn: "subtract", args: [{ var: "endsAt" }, { now: true }] }] } },
    ],
    screens: [
      {
        id: "s1",
        frames: [
          { id: "s1", parent: null, kind: "frame", pos: "a0" },
          { id: "label", parent: "s1", kind: "text", pos: "a1", textKey: "label", props: { testId: "label", color: { $token: "bg.surface" } } },
        ],
      },
    ],
  } as unknown as SourceFunnel;
  const compiled = compileToTree(source);
  render(
    <Funnel
      manifest={{
        entry: "s1",
        variables: compiled.manifest.variables,
        tokens: { light: { "bg.surface": "#ffffff" }, dark: { "bg.surface": "#111827" } },
        defaultMode: "light",
        enter: {
          s1: [
            { type: "set", variable: "endsAt", from: { fn: "add", args: [{ now: true }, { lit: 300 }] } },
            { type: "waitUntil", when: { op: "cmp", cmp: "lte", left: { var: "left" }, right: { lit: 0 } } },
            { type: "set", variable: "theme", value: "light" },
          ],
        },
      } as never}
      screens={screensFromTree(compiled)}
      locale={{ label: "Continue" }}
    />,
  );
  const colour = () => window.getComputedStyle(screen.getByTestId("label")).color;
  expect(colour()).toBe("rgb(17, 24, 39)");
  await wait(700);
  expect(colour()).toBe("rgb(255, 255, 255)");
});
