import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "./button";

/**
 * The button every authored CTA renders through. Its variants are referenced by
 * name from serialized page content, so the set below is a contract as much as
 * a style choice — an author picks `destructive` in the constructor and this is
 * what the user sees.
 */
const meta = {
  title: "Internal/Button",
  component: Button,
  args: { children: "Continue" },
  argTypes: {
    variant: {
      control: "select",
      options: [
        "default",
        "old",
        "destructive",
        "outline",
        "empty",
        "secondary",
        "ghost",
        "link",
      ],
    },
    size: { control: "select", options: ["default", "sm", "lg", "icon"] },
    loading: { control: "boolean" },
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllVariants: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <Button {...args} variant="default">Default</Button>
      <Button {...args} variant="old">Old</Button>
      <Button {...args} variant="destructive">Destructive</Button>
      <Button {...args} variant="outline">Outline</Button>
      <Button {...args} variant="secondary">Secondary</Button>
      <Button {...args} variant="ghost">Ghost</Button>
      <Button {...args} variant="link">Link</Button>
      <Button {...args} variant="empty">Empty</Button>
    </div>
  ),
};

export const AllSizes: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <Button {...args} size="sm">Small</Button>
      <Button {...args} size="default">Default</Button>
      <Button {...args} size="lg">Large</Button>
    </div>
  ),
};

/**
 * Loading is not just a spinner: it also disables the button. A user who taps a
 * CTA twice while the next page fetches must not submit twice.
 */
export const Loading: Story = {
  args: { loading: true },
};

export const Disabled: Story = {
  args: { disabled: true },
};

/**
 * `asChild` renders the styling onto the child element instead of a `<button>`,
 * which is how a CTA becomes a real link — right-clickable, openable in a new
 * tab, and crawlable.
 */
export const AsLink: Story = {
  args: {
    asChild: true,
    children: <a href="https://example.com">Go to the offer</a>,
  },
};
