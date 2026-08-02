import tailwindcss from "@tailwindcss/vite";
import type { StorybookConfig } from "@storybook/react-vite";

// The vite builder, not the Next one: this package is a component library, not
// an application. It has no Next app to boot, and its peer dependencies (Next,
// Effector, Farfetched) are the consumer's to provide.
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx|mdx)"],
  addons: ["@storybook/addon-docs"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  viteFinal: async (viteConfig) => {
    // The components are Tailwind-classed, but this package ships no CSS — the
    // consumer's Tailwind scans `dist` and generates it. Storybook therefore
    // has to build its own, or every story renders unstyled.
    viteConfig.plugins = [...(viteConfig.plugins ?? []), tailwindcss()];
    return viteConfig;
  },
};

export default config;
