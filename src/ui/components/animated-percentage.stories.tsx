import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import AnimatedPercentageRegistry from "./animated-percentage";
import { storyNode } from "./story-node";

/**
 * The counter that ticks a number up while a loader runs.
 *
 * Its inputs are attributes on the authored node, not React props, so each story sets them
 * through `storyNode` exactly as the builder would.
 */
const meta = {
  title: "Components/AnimatedPercentage",
  component: AnimatedPercentageRegistry,
  parameters: { layout: "centered" },
} satisfies Meta<typeof AnimatedPercentageRegistry>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: storyNode("span", {
    "percentage-animation-start": "0",
    "percentage-animation-finish": "100",
    "percentage-animation-speed": "2000",
  }),
};

/** A short run, so the play function below can assert the END state without a long wait. */
export const Fast: Story = {
  args: storyNode("span", {
    "percentage-animation-start": "0",
    "percentage-animation-finish": "42",
    "percentage-animation-speed": "300",
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // The component animates with requestAnimationFrame and writes into the span's text
    // directly, suffixed with a percent sign. This asserts the animation actually RAN and
    // settled on its finish value, not merely that a span rendered.
    await waitFor(
      async () => {
        await expect(canvas.getByText("42%")).toBeInTheDocument();
      },
      { timeout: 4000 },
    );
  },
};

/**
 * Counting down. The component takes start > finish without special-casing it, and this is
 * the story that would fail if someone "fixed" the easing with a Math.max.
 */
export const CountsDown: Story = {
  args: storyNode("span", {
    "percentage-animation-start": "90",
    "percentage-animation-finish": "10",
    "percentage-animation-speed": "300",
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(
      async () => {
        await expect(canvas.getByText("10%")).toBeInTheDocument();
      },
      { timeout: 4000 },
    );
  },
};

/**
 * Nothing authored. Every attribute falls back to its default (0 -> 100), rather than
 * rendering NaN — which is what `getNumberAttr` exists to prevent.
 */
export const NoAttributes: Story = {
  args: storyNode("span", {}),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.textContent).not.toContain("NaN");
  },
};
