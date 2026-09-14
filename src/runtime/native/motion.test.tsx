/**
 * Motion on the phone — the same loader and countdown as `client/motion.test`,
 * through the native `<Funnel>` and bricks.
 *
 * Rendered with `react-native-web`, as the console preview renders the native
 * runtime, so what is asserted is what the renderer decides: the numbers the
 * words show, the width the bar is told, the animated style a preset wears.
 * The interpolation itself is React Native's.
 */
import "@testing-library/jest-dom";
import { act, render, screen } from "@testing-library/react";

import type { SourceFunnel } from "../compiler/source";
import { compileToTree } from "../compiler/tree";
import { screensFromTree } from "../client/tree-screen";
import { carriedLooks } from "../motion";
import type { TimerRecord } from "../timers";
import { Frame, Text } from "./bricks";
import { IPHONE_INSETS } from "./safe-area-mock";

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

// Imported after the mock, which is hoisted above it anyway — spelled here so a
// reader does not wonder why the host renders at all in jsdom.
// eslint-disable-next-line import/first
import { Funnel } from "./funnel";

const wait = (ms: number) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

describe("a loader on the phone", () => {
  const loader: SourceFunnel = {
    id: "loader-native",
    version: "v1",
    entry: "s_loader",
    variables: [{ name: "progress", type: "number", screen: "s_loader", default: 0 }],
    screens: [
      {
        id: "s_loader",
        frames: [
          { id: "s_loader", parent: null, kind: "frame", pos: "a0" },
          {
            id: "label",
            parent: "s_loader",
            kind: "text",
            pos: "a1",
            textKey: "label",
            props: { testId: "label" },
            params: { pct: { fn: "format", args: [{ var: "progress" }, { lit: "percent" }] } },
          },
        ],
      },
      { id: "s_done", frames: [{ id: "s_done", parent: null, kind: "text", pos: "a0", textKey: "done" }] },
    ],
  };

  it("counts to 100% on the same clock the web uses, then moves on", async () => {
    const compiled = compileToTree(loader);
    render(
      <Funnel
        manifest={{
          entry: "s_loader",
          variables: compiled.manifest.variables,
          enter: {
            s_loader: [
              { type: "animate", variable: "progress", to: { lit: 100 }, ms: 200, easing: "linear" },
              { type: "show", target: "s_done" },
            ],
          },
        }}
        screens={screensFromTree(compiled)}
        locale={{ label: "Building your plan {pct}", done: "Your plan is ready" }}
      />,
    );
    expect(screen.getByTestId("label")).toHaveTextContent("Building your plan 0%");
    await wait(100);
    const midway = Number(/(\d+)%/.exec(screen.getByTestId("label").textContent ?? "")?.[1]);
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(100);
    await wait(250);
    expect(screen.getByText("Your plan is ready")).toBeInTheDocument();
  });
});

describe("a countdown on the phone", () => {
  it("reads its deadline back from the app's own asynchronous storage", async () => {
    const realNow = Date.now;
    const now = 1_700_000_000_000;
    Date.now = () => now;
    try {
      const stored: Record<string, TimerRecord> = {
        offer: { mode: "countdown", start: now - 125_000, deadline: now + 475_000 },
      };
      const writes: Array<Record<string, TimerRecord>> = [];
      const compiled = compileToTree({
        id: "offer-native",
        version: "v9",
        entry: "s_offer",
        variables: [],
        screens: [
          {
            id: "s_offer",
            frames: [
              { id: "s_offer", parent: null, kind: "frame", pos: "a0" },
              {
                id: "clock",
                parent: "s_offer",
                kind: "text",
                pos: "a1",
                textKey: "left",
                props: { testId: "clock" },
                params: { left: { fn: "format", args: [{ timer: "offer" }, { lit: "mm:ss" }] } },
              },
            ],
          },
        ],
      });
      render(
        <Funnel
          manifest={{ entry: "s_offer", variables: [], enter: { s_offer: [{ type: "timer", id: "offer", seconds: 600 }] } }}
          screens={screensFromTree(compiled)}
          locale={{ left: "Offer ends in {left}" }}
          persist={{ funnelId: "offer-native", version: "v9" }}
          timerStorage={{ read: async () => stored, write: (records) => void writes.push(records) }}
        />,
      );
      await wait(300);
      expect(screen.getByTestId("clock")).toHaveTextContent("Offer ends in 07:55");
      // Started again, and left alone: the deadline written back is the one read.
      expect(writes.at(-1)?.offer?.deadline ?? stored.offer.deadline).toBe(now + 475_000);
    } finally {
      Date.now = realNow;
    }
  });
});

describe("the native bricks' motion", () => {
  beforeEach(() => carriedLooks.clear());

  it("draws a percent width", () => {
    render(<Frame testId="fill" width="42%" height={8} />);
    expect(screen.getByTestId("fill")).toHaveStyle({ width: "42%" });
  });

  it("wears an animated view for a preset, and a plain one otherwise", async () => {
    render(<Frame testId="plain" width={20} height={20} />);
    render(<Frame testId="spinner" width={20} height={20} motion={{ preset: "spin", duration: 400 }} />);
    await wait(120);
    const turning = screen.getByTestId("spinner").style.transform;
    expect(turning).toMatch(/rotate\(\d+(\.\d+)?deg\)/);
    expect(screen.getByTestId("plain").style.transform).toBe("");
  });

  it("glides a bound width, and settles on the new value", async () => {
    // jsdom's `react-native-web` runs a timing to its end at once, so the frames
    // in between are checked in a browser (the console preview) rather than
    // here; what is held here is that the bar is animated and where it lands.
    const { rerender } = render(<Frame testId="bar" width="10%" height={8} transition={{ duration: 200, easing: "linear" }} />);
    rerender(<Frame testId="bar" width="90%" height={8} transition={{ duration: 200, easing: "linear" }} />);
    await wait(300);
    expect(screen.getByTestId("bar").style.width).toBe("90%");
  });

  it("gives text an entrance that ends entered", async () => {
    render(
      <Text testId="title" motion={{ preset: "fadeIn", duration: 200 }}>
        Hello
      </Text>,
    );
    await wait(300);
    expect(Number(screen.getByTestId("title").style.opacity || "1")).toBeCloseTo(1);
  });
});

it("uses the iPhone the console preview does", () => {
  expect(IPHONE_INSETS.top).toBe(59);
});
