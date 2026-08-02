import type { Meta, StoryObj } from "@storybook/react-vite";

import { Progress } from "./progress";

/**
 * The funnel progress bar. It fills by `width` rather than `translateX` so it
 * follows text direction — the RTL story below is the one that matters, and is
 * the reason the implementation is not the obvious transform-based one.
 */
const meta = {
  title: "Internal/Progress",
  component: Progress,
  args: { value: 40 },
  argTypes: {
    value: { control: { type: "range", min: 0, max: 100, step: 1 } },
  },
  decorators: [
    (Story) => (
      <div className="max-w-md">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = { args: { value: 0 } };

export const Complete: Story = { args: { value: 100 } };

export const Steps: Story = {
  render: (args) => (
    <div className="flex flex-col gap-4">
      {[0, 25, 50, 75, 100].map((value) => (
        <Progress {...args} key={value} value={value} />
      ))}
    </div>
  ),
};

/**
 * In a right-to-left funnel the bar must fill from the right. A transform-based
 * fill is physical and ignores `dir`, so it would fill the wrong way and read as
 * progress running backwards.
 */
export const RightToLeft: Story = {
  render: (args) => (
    <div className="flex flex-col gap-4">
      <div dir="ltr">
        <p className="mb-1 text-xs text-slate-500">dir=&quot;ltr&quot;</p>
        <Progress {...args} />
      </div>
      <div dir="rtl">
        <p className="mb-1 text-xs text-slate-500">dir=&quot;rtl&quot;</p>
        <Progress {...args} />
      </div>
    </div>
  ),
};

/**
 * Callers that sweep the bar hand it the final value plus a duration and let CSS
 * animate. Reload the story to watch the sweep.
 */
export const Animated: Story = {
  args: { value: 90, transitionDuration: "2s" },
};

export const CustomIndicator: Story = {
  args: {
    value: 65,
    className: "h-2 bg-slate-200",
    indicatorClassName: "bg-emerald-500",
  },
};
