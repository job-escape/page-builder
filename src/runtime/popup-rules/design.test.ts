/**
 * A popup's design, loaded from its manifest and entered through the host
 * screen — and the screen that says when it has been closed.
 */
import { act, render } from "@testing-library/react";
import { createElement } from "react";

import {
  POPUP_HOST_SCREEN,
  loadPopupDesign,
  popupEventProps,
  popupFunnelManifest,
  popupHostScreen,
  type PopupManifest,
} from "./design";
import type { PopupRule } from "./types";

const rule: PopupRule = {
  id: "rule-1",
  name: "Welcome",
  designId: 140,
  on: [],
  when: { all: [] },
  cap: null,
  show: { target: "dialog", as: "overlay", position: "bottom", dim: false },
  manifestUrl: "https://cdn.example/140/manifest.json",
};

const manifest = {
  entry: "page",
  variables: [],
  schema: "1.3",
  screens: [
    { id: "page", tree: "https://cdn.example/140/page.json" },
    { id: "dialog", tree: "https://cdn.example/140/dialog.json", presentation: { kind: "sheet" } },
  ],
} as unknown as PopupManifest;

afterEach(() => {
  (globalThis as { fetch?: unknown }).fetch = undefined;
});

function serve(files: Record<string, unknown>) {
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: string) =>
    url in files
      ? { ok: true, status: 200, json: async () => files[url] }
      : { ok: false, status: 404, json: async () => ({}) },
  );
}

describe("loading a popup's design", () => {
  it("loads every screen's tree and the words", async () => {
    serve({
      [rule.manifestUrl]: manifest,
      "https://cdn.example/140/page.json": { id: "page" },
      "https://cdn.example/140/dialog.json": { id: "dialog" },
    });
    const loaded = await loadPopupDesign(rule, "en");
    expect(Object.keys(loaded.trees).sort()).toEqual(["dialog", "page"]);
    expect(loaded.copy).toBeDefined();
  });

  it("refuses a design that no longer has the rule's target", async () => {
    serve({ [rule.manifestUrl]: manifest });
    await expect(loadPopupDesign({ ...rule, show: { ...rule.show, target: "gone" } }, "en"))
      .rejects.toThrow("target gone");
  });

  it("refuses a schema it cannot read", async () => {
    serve({ [rule.manifestUrl]: { ...manifest, schema: "2.0" } });
    await expect(loadPopupDesign(rule, "en")).rejects.toThrow("unsupported schema");
  });
});

describe("the funnel a popup runs", () => {
  it("enters on the host screen, which shows the target as the rule says", () => {
    const funnel = popupFunnelManifest(rule, manifest);
    expect(funnel.entry).toBe(POPUP_HOST_SCREEN);
    expect(funnel.enter?.[POPUP_HOST_SCREEN]).toEqual([
      { type: "show", target: "dialog", as: "overlay", position: "bottom", dim: false },
    ]);
    expect(funnel.screens).toEqual({ dialog: { kind: "sheet" } });
  });
});

describe("the host screen", () => {
  it("reports closed once the popup it showed is gone, and not before", () => {
    const closed = jest.fn();
    const Host = popupHostScreen(closed);
    let overlays = [{ id: "dialog" }];
    const nav = { state: () => ({ screen: POPUP_HOST_SCREEN, overlays, direction: "forward" }) } as never;

    const view = render(createElement(Host, { nav }));
    expect(closed).not.toHaveBeenCalled();

    overlays = [];
    act(() => view.rerender(createElement(Host, { nav })));
    expect(closed).toHaveBeenCalledTimes(1);
  });
});

describe("a popup's own analytics", () => {
  it("says which popup it came from, and the design's own properties win", () => {
    expect(popupEventProps(rule, { step: "cta", design_id: "override" })).toEqual({
      quiz_version: "design-140",
      design_id: "override",
      popup_rule_id: "rule-1",
      popup_rule_name: "Welcome",
      step: "cta",
    });
  });
});
