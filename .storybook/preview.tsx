import "@generated/demo.css";
import type { Preview } from "@storybook/react-vite";
import { TooltipProvider } from "@/components/ui/tooltip";

const preview: Preview = {
  globalTypes: {
    theme: {
      description: "Light or dark",
      toolbar: { title: "Theme", icon: "mirror", items: ["light", "dark"], dynamicTitle: true },
    },
  },
  initialGlobals: { theme: "light" },
  parameters: { layout: "padded", controls: { expanded: true } },
  decorators: [
    (Story, ctx) => {
      document.documentElement.classList.toggle("dark", ctx.globals.theme === "dark");
      return (
        <TooltipProvider>
          <div className="@container bg-background text-foreground">
            <Story />
          </div>
        </TooltipProvider>
      );
    },
  ],
};
export default preview;
