/**
 * A funnel keeps the visitor's answers and facts on its own.
 *
 * Handed the manifest as published, `<Funnel>` saves without being told where:
 * under the entry screen's id and the published version. The visitor's facts
 * are saved with the answers, the present ones winning over what was saved.
 * A host that must leave nothing behind says `persist={false}`.
 */
import "@testing-library/jest-dom";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import Cookies from "js-cookie";
import { TextEncoder } from "util";

import type { SourceFunnel } from "../compiler/source";
import { compileToTree } from "../compiler/tree";
import { cookieName } from "../persistence";
import { Funnel, type FunnelProps } from "./funnel";
import { screensFromTree } from "./tree-screen";

const source: SourceFunnel = {
  id: "saving",
  version: "v1",
  entry: "s_goal",
  variables: [
    { name: "goal", type: "string", default: "none" },
    { name: "email", type: "string", sensitive: true },
  ],
  screens: [
    {
      id: "s_goal",
      frames: [
        { id: "s_goal", parent: null, kind: "frame", pos: "a0" },
        {
          id: "pick",
          parent: "s_goal",
          kind: "frame",
          pos: "a0",
          props: { testId: "pick" },
          interactions: [
            {
              on: { event: "click" },
              do: [
                { type: "set", variable: "goal", value: "muscle" },
                { type: "set", variable: "email", value: "ana@example.com" },
              ],
            },
          ],
        },
        {
          id: "shown",
          parent: "s_goal",
          kind: "text",
          pos: "a1",
          textKey: "goal",
          params: { goal: { var: "goal" } },
        },
        {
          id: "from_google",
          parent: "s_goal",
          kind: "text",
          pos: "a2",
          textKey: "google",
          when: { op: "visitor", property: "utm_source", cmp: "eq", value: "google" },
        },
        {
          id: "country",
          parent: "s_goal",
          kind: "text",
          pos: "a3",
          textKey: "country",
          params: { country: { visitor: "country" } },
        },
      ],
    },
  ],
  locales: { en: { goal: "goal: {goal}", google: "Came from Google", country: "country: {country}" } },
};

const compiled = compileToTree(source);
const screens = screensFromTree(compiled);
const cookie = cookieName(compiled.manifest.entry);
const saved = () => JSON.parse(Cookies.get(cookie) ?? "null");

const mount = (props: Partial<FunnelProps> = {}) =>
  render(
    <Funnel manifest={compiled.manifest} screens={screens} locale={source.locales!.en} {...props} />,
  );

afterEach(() => {
  cleanup();
  Cookies.remove(cookie, { path: "/" });
});

describe("saving without being told where", () => {
  it("saves the answers under the entry screen's id and the published version", () => {
    mount();
    fireEvent.click(screen.getByTestId("pick"));
    expect(saved()).toMatchObject({ v: "v1", a: { goal: "muscle" } });
  });

  it("brings them back on the next visit", async () => {
    mount();
    fireEvent.click(screen.getByTestId("pick"));
    cleanup();

    mount();
    await act(async () => {});
    expect(screen.getByText("goal: muscle")).toBeInTheDocument();
  });

  it("still never saves what is marked sensitive", () => {
    mount();
    fireEvent.click(screen.getByTestId("pick"));
    expect(saved().a).not.toHaveProperty("email");
  });

  it("saves nothing when the host says `persist={false}`", () => {
    mount({ persist: false });
    fireEvent.click(screen.getByTestId("pick"));
    expect(Cookies.get(cookie)).toBeUndefined();
  });

  it("saves nothing for a manifest without a published version", () => {
    render(
      <Funnel
        manifest={{ entry: compiled.manifest.entry, variables: compiled.manifest.variables }}
        screens={screens}
        locale={source.locales!.en}
      />,
    );
    fireEvent.click(screen.getByTestId("pick"));
    expect(Cookies.get(cookie)).toBeUndefined();
  });
});

describe("visitor facts", () => {
  it("are saved as soon as the funnel opens, before anything is answered", () => {
    mount({ visitor: { utm_source: "google", country: "US" } });
    expect(saved().f).toEqual({ utm_source: "google", country: "US" });
  });

  it("stand in for a fact the host cannot answer on a later visit", async () => {
    mount({ visitor: { utm_source: "google", country: "US" } });
    cleanup();

    // Back without the campaign in the URL: the host has no utm_source now.
    mount({ visitor: { utm_source: null, country: "US" } });
    await act(async () => {});
    expect(screen.getByText("Came from Google")).toBeInTheDocument();
  });

  it("never replace one the host answers now", async () => {
    mount({ visitor: { country: "US" } });
    cleanup();

    mount({ visitor: { country: "DE" } });
    await act(async () => {});
    expect(screen.getByText("country: DE")).toBeInTheDocument();
    expect(saved().f).toMatchObject({ country: "DE" });
  });
});

describe("a server render", () => {
  it("draws the defaults, as a server that cannot read the cookie would, so hydration matches", () => {
    mount();
    fireEvent.click(screen.getByTestId("pick"));
    cleanup();

    // jsdom has no TextEncoder, which the server renderer needs; loaded after it
    // is supplied. jsdom rather than node on purpose: there *is* a cookie to
    // read here, so drawing the defaults proves the read was deferred.
    Object.assign(globalThis, { TextEncoder });
    const { renderToString } = require("react-dom/server") as typeof import("react-dom/server");
    const html = renderToString(
      <Funnel manifest={compiled.manifest} screens={screens} locale={source.locales!.en} />,
    );
    expect(html).toContain("goal: none");
  });
});
