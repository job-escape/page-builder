import type { Preview } from "@storybook/react-vite";

import "./tokens.css";

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    // These render inside a funnel page, not a centred canvas.
    layout: "padded",
  },
};

export default preview;
