/**
 * The compiled-funnel runtime, running. **Beta.**
 *
 * Click through it: pick a goal and it advances, pick equipment and watch the
 * cap engage, open the sheet, press Escape, reach a plan that was chosen by what
 * you answered.
 *
 * The screens behind this are hand-written in exactly the shape the compiler
 * will emit — plain functions of `{ ui, t, state, nav }` with no imports of
 * their own. So what renders here is a faithful preview of a compiled funnel,
 * built before the compiler exists precisely so the contract can be judged by
 * using it rather than by reading it.
 */
import type { Meta, StoryObj } from "@storybook/react";

import { Funnel } from "./funnel";
import { locale, manifest, screens } from "./demo/quiz";

const meta: Meta<typeof Funnel> = {
  title: "Runtime (beta)/Funnel",
  component: Funnel,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "A funnel rendered from the beta runtime: single select with auto-advance, " +
          "multi-select with a cap and a minimum, an overlay, and navigation that " +
          "branches on an answer. Everything is driven by declared variables — the " +
          "screens never know whether a question is single or multi select.",
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof Funnel>;

/** The whole funnel, unpersisted — reload gives a clean run. */
export const Playable: Story = {
  args: { manifest, screens, locale },
};

/**
 * The same funnel with persistence on. Answer a question, reload the frame, and
 * the answers are still there — written through to a cookie on every change,
 * keyed by funnel version so a republish starts clean.
 */
export const WithPersistence: Story = {
  args: {
    manifest,
    screens,
    locale,
    persist: { funnelId: "storybook", version: "v1" },
  },
};

/**
 * Multi-select as its own start point, so the cap and the `min` gate can be
 * exercised without walking the funnel first. Continue stays inert until one
 * item is chosen, and the fourth pick is refused while the other three stand.
 */
export const MultiSelect: Story = {
  args: {
    manifest: { ...manifest, entry: "s_gear" },
    screens,
    locale,
  },
};
