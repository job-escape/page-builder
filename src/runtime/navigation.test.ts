import { createNavigator } from "./navigation";

const known = new Set(["s_goal", "s_plan", "s_thanks", "d_confirm", "d_terms"]);
const nav = (over: Partial<Parameters<typeof createNavigator>[0]> = {}) =>
  createNavigator({ entry: "s_goal", known, ...over });

describe("show — one verb, stacking is a parameter", () => {
  it("replaces the screen by default", () => {
    const n = nav();
    n.show("s_plan");
    expect(n.state()).toEqual({ screen: "s_plan", overlays: [] });
  });

  it("keeps the screen mounted underneath an overlay", () => {
    const n = nav();
    n.show("d_confirm", { as: "overlay" });
    expect(n.state().screen).toBe("s_goal");
    expect(n.state().overlays.map((o) => o.id)).toEqual(["d_confirm"]);
  });

  it("stacks overlays, innermost last", () => {
    const n = nav();
    n.show("d_confirm", { as: "overlay" });
    n.show("d_terms", { as: "overlay" });
    expect(n.state().overlays.map((o) => o.id)).toEqual(["d_confirm", "d_terms"]);
  });

  it("ignores a double-tap on the opener rather than stacking duplicates", () => {
    const n = nav();
    n.show("d_confirm", { as: "overlay" });
    n.show("d_confirm", { as: "overlay" });
    expect(n.state().overlays).toHaveLength(1);
  });

  it("merges per-frame defaults, with the call site winning", () => {
    const n = nav({ defaults: { d_confirm: { as: "overlay", position: "center", dim: true } } });
    n.show("d_confirm", { position: "bottom" });
    expect(n.state().overlays[0].presentation).toEqual({
      as: "overlay",
      position: "bottom",
      dim: true,
    });
  });

  it("navigating dismisses whatever was open above the screen being left", () => {
    const n = nav();
    n.show("d_confirm", { as: "overlay" });
    n.show("s_plan");
    expect(n.state()).toEqual({ screen: "s_plan", overlays: [] });
  });
});

describe("back", () => {
  it("closes the top overlay rather than leaving the funnel", () => {
    const n = nav();
    n.show("d_confirm", { as: "overlay" });

    expect(n.back()).toBe(true);
    expect(n.state()).toEqual({ screen: "s_goal", overlays: [] });
  });

  it("unwinds a stack one overlay at a time", () => {
    const n = nav();
    n.show("d_confirm", { as: "overlay" });
    n.show("d_terms", { as: "overlay" });

    n.back();
    expect(n.state().overlays.map((o) => o.id)).toEqual(["d_confirm"]);
    n.back();
    expect(n.state().overlays).toEqual([]);
  });

  it("returns to the previous screen once no overlay is open", () => {
    const n = nav();
    n.show("s_plan");
    n.back();
    expect(n.state().screen).toBe("s_goal");
  });

  it("reports that there is nowhere to go from the entry screen", () => {
    const n = nav();
    expect(n.canGoBack()).toBe(false);
    expect(n.back()).toBe(false);
    expect(n.state().screen).toBe("s_goal");
  });

  it("overlays are not history entries — back from a later screen skips them", () => {
    const n = nav();
    n.show("d_confirm", { as: "overlay" });
    n.show("s_plan");
    n.back();
    expect(n.state()).toEqual({ screen: "s_goal", overlays: [] });
  });
});

describe("leaving a screen cancels what it owns", () => {
  it("fires on navigation, so an abandoned loader stops writing to state", () => {
    const onLeaveScreen = jest.fn();
    const n = nav({ onLeaveScreen });
    n.show("s_plan");
    expect(onLeaveScreen).toHaveBeenCalledWith("s_goal");
  });

  it("fires on back", () => {
    const onLeaveScreen = jest.fn();
    const n = nav({ onLeaveScreen });
    n.show("s_plan");
    onLeaveScreen.mockClear();
    n.back();
    expect(onLeaveScreen).toHaveBeenCalledWith("s_plan");
  });

  it("does NOT fire for an overlay — the screen underneath is still live", () => {
    const onLeaveScreen = jest.fn();
    const n = nav({ onLeaveScreen });
    n.show("d_confirm", { as: "overlay" });
    n.close();
    expect(onLeaveScreen).not.toHaveBeenCalled();
  });
});

describe("unknown targets", () => {
  it("is reported and ignored, never thrown", () => {
    const onUnknown = jest.fn();
    const n = nav({ onUnknown });

    n.show("s_typo");

    expect(onUnknown).toHaveBeenCalledWith("s_typo");
    expect(n.state().screen).toBe("s_goal");
  });
});

describe("subscribers", () => {
  it("is notified on a move", () => {
    const n = nav();
    const seen = jest.fn();
    n.subscribe(seen);
    n.show("s_plan");
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("is not notified when already on that screen with nothing open", () => {
    const n = nav();
    const seen = jest.fn();
    n.subscribe(seen);
    n.show("s_goal");
    expect(seen).not.toHaveBeenCalled();
  });

  it("closing with nothing open is a no-op", () => {
    const n = nav();
    const seen = jest.fn();
    n.subscribe(seen);
    expect(n.close()).toBe(false);
    expect(seen).not.toHaveBeenCalled();
  });
});

describe("snapshot identity — what useSyncExternalStore depends on", () => {
  it("is stable between changes, so React does not loop", () => {
    const n = nav();
    const first = n.state();
    expect(n.state()).toBe(first);

    n.show("s_plan");
    const second = n.state();
    expect(second).not.toBe(first);
    expect(n.state()).toBe(second);
  });

  it("is unchanged by a move that did nothing", () => {
    const n = nav();
    const before = n.state();
    n.show("s_goal");
    n.close();
    expect(n.state()).toBe(before);
  });
});
