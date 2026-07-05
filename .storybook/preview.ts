import type { Preview } from "@storybook/react-vite";
import "../src/index.css";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    layout: "fullscreen",
    backgrounds: { disable: true },
    docs: {
      toc: true,
    },
    options: {
      storySort: {
        order: ["Design System", "App", "Diff", "Pull Requests", "Comments", "Settings"],
      },
    },
  },
  globalTypes: {
    theme: {
      description: "Color theme",
      defaultValue: "dark",
      toolbar: {
        title: "Theme",
        icon: "circlehollow",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme ?? "dark";
      document.documentElement.setAttribute("data-theme", theme);
      document.documentElement.style.setProperty("color-scheme", theme);
      return Story();
    },
  ],
};

export default preview;
