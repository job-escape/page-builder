/**
 * Motion on the page — a loader counting to 100 through the real `<Funnel>`,
 * a countdown that survives a remount, and the CSS a bound bar glides with.
 *
 * Everything here goes through the tree, because that is what publishes.
 */
import "@testing-library/jest-dom";
import { act, render, screen } from "@testing-library/react";

import type { SourceFunnel } from "../compiler/source";
import { compileToTree } from "../compiler/tree";
import { carriedLooks, MOTION_PRESETS } from "../motion";
import { timerStorageKey } from "../timers";
import { Frame, Text } from "./bricks";
import { Funnel } from "./funnel";
import { MOTION_KEYFRAMES, transitionCss } from "./motion-css";
import { screensFromTree } from "./tree-screen";

/**
 * A loader: on opening, `progress` animates 0 → 100 over 200ms; a bar's width
 * is bound to it as a percent, and a label reads it through `format`. When it
 * arrives it moves on.
 */
const loader: SourceFunnel = {
  id: "loader-funnel",
  version: "v1",
  entry: "s_loader",
  variables: [{ name: "progress", type: "number", screen: "s_loader", default: 0 }],
  screens: [
    {
      id: "s_loader",
      frames: [
        {
          id: "s_loader",
          parent: null,
          kind: "frame",
          pos: "a0",
          interactions: [
            {
              on: { event: "load" },
              do: [
                { type: "animate", variable: "progress", from: { lit: 0 }, to: { lit: 100 }, ms: 200, easing: "linear" },
                { type: "show", target: "s_done" },
              ],
            },
          ],
        },
        {
          id: "bar",
          parent: "s_loader",
          kind: "frame",
          pos: "a1",
          props: { height: 8, fill: "#2563eb", transition: { duration: 120, easing: "linear" }, testId: "bar" },
          bindings: {
            width: { value: { fn: "concat", args: [{ fn: "round", args: [{ var: "progress" }] }, { lit: "%" }] } },
          },
        },
        {
          id: "label",
          parent: "s_loader",
          kind: "text",
          pos: "a2",
          textKey: "label",
          props: { testId: "label" },
          params: { pct: { fn: "format", args: [{ var: "progress" }, { lit: "percent" }] } },
        },
      ],
    },
    {
      id: "s_done",
      frames: [{ id: "s_done", parent: null, kind: "text", pos: "a0", textKey: "done" }],
    },
  ],
  locales: { en: { label: "Building your plan {pct}", done: "Your plan is ready" } },
};

const mountLoader = () => {
  const compiled = compileToTree(loader);
  return render(
    <Funnel
      manifest={{ entry: compiled.manifest.entry, variables: compiled.manifest.variables, enter: { s_loader: loader.screens[0].frames[0].interactions![0].do } }}
      screens={screensFromTree(compiled)}
      locale={loader.locales!.en}
    />,
  );
};

describe("a loader in the funnel", () => {
  it("counts its label up and fills its bar, then moves on at 100%", async () => {
    mountLoader();
    expect(screen.getByTestId("label")).toHaveTextContent("Building your plan 0%");

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    const midway = Number(/(\d+)%/.exec(screen.getByTestId("label").textContent ?? "")?.[1]);
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(100);
    expect(screen.getByTestId("bar").style.width).toBe(`${midway}%`);
    expect(screen.getByTestId("bar").style.transition).toContain("width 120ms linear");

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
    expect(screen.getByText("Your plan is ready")).toBeInTheDocument();
  });
});

describe("a countdown in the funnel", () => {
  const offer: SourceFunnel = {
    id: "offer-funnel",
    version: "v1",
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
  };
  const enter = { s_offer: [{ type: "timer" as const, id: "offer", seconds: 600 }] };

  const mount = (version: string) => {
    const compiled = compileToTree({ ...offer, version });
    return render(
      <Funnel
        manifest={{ entry: "s_offer", variables: [], enter }}
        screens={screensFromTree(compiled)}
        locale={{ left: "Offer ends in {left}" }}
        persist={{ funnelId: offer.id, version }}
      />,
    );
  };

  beforeEach(() => window.localStorage.clear());

  it("keeps its deadline across a remount and a republish", async () => {
    const realNow = Date.now;
    let now = 1_700_000_000_000;
    Date.now = () => now;
    try {
      const first = mount("v1");
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      expect(screen.getByTestId("clock")).toHaveTextContent("Offer ends in 10:00");
      expect(window.localStorage.getItem(timerStorageKey(offer.id))).toContain('"deadline"');
      first.unmount();

      now += 125_000;
      // A different version is a republish: answers are discarded, the deadline is not.
      mount("v2");
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 300));
      });
      expect(screen.getByTestId("clock")).toHaveTextContent("Offer ends in 07:55");
    } finally {
      Date.now = realNow;
    }
  });
});

describe("the bricks' motion", () => {
  beforeEach(() => carriedLooks.clear());

  it("writes a transition over every glided property, with the CSS curve", () => {
    expect(transitionCss({ duration: 400, easing: "ease-out", delay: 50 })).toContain(
      "width 400ms cubic-bezier(0, 0, 0.58, 1) 50ms",
    );
    expect(transitionCss({ duration: 0 })).toBeUndefined();
  });

  it("plays a preset as an animation, and puts the keyframes in the page once", () => {
    render(<Frame testId="spinner" motion={{ preset: "spin" }} />);
    render(<Frame testId="spinner-2" motion={{ preset: "spin" }} />);
    expect(screen.getByTestId("spinner").style.animation).toContain("pb-motion-spin 900ms linear 0ms infinite");
    expect(document.querySelectorAll("#pb-motion-keyframes")).toHaveLength(1);
    expect(MOTION_KEYFRAMES).toContain("@keyframes pb-motion-spin");
    expect(Object.keys(MOTION_PRESETS)).toEqual(["spin", "pulse", "shimmer", "fadeIn", "slideUp"]);
  });

  it("draws a percent width as written", () => {
    render(<Frame testId="fill" width="42%" />);
    expect(screen.getByTestId("fill").style.width).toBe("42%");
  });

  it("starts a keyed frame from the look the same key had on the screen before", async () => {
    const before = render(<Frame testId="header" motionKey="progress" width="20%" transition={{ duration: 300 }} />);
    before.unmount();
    render(<Frame testId="header" motionKey="progress" width="40%" transition={{ duration: 300 }} />);
    expect(screen.getByTestId("header").style.width).toBe("20%");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    expect(screen.getByTestId("header").style.width).toBe("40%");
  });

  it("gives text an entrance too", () => {
    render(
      <Text testId="title" motion={{ preset: "fadeIn", delay: 100 }}>
        Hello
      </Text>,
    );
    expect(screen.getByTestId("title").style.animation).toContain("pb-motion-fadeIn 300ms");
  });
});
