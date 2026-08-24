/**
 * The funnel both emitters are judged against.
 *
 * Shared rather than copied, and that is the whole point: the JavaScript
 * emitter and the tree emitter are held to the *same* funnel, so "they agree"
 * is a claim about one document rather than about two that drifted apart the
 * first time someone edited one of them.
 *
 * Not reachable from any entry point, so it does not ship — `tsup` builds the
 * entries and nothing imports this outside tests.
 */
import type { SourceFunnel } from "./source";

/** A two-screen funnel with a choice, a bound appearance and a branch. */
export const source: SourceFunnel = {
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

export const locale = {
  "s_goal.title": "What's your goal?",
  "s_goal.o1": "Build muscle",
  "s_gear.title": "What do you have?",
  "d_why.body": "We ask so the plan fits.",
  "s_done.title": "All set",
};
