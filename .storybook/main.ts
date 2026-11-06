import type { StorybookConfig } from "@storybook/react-vite";

// The kit's catalogue: every block and shell with sample data, in the sample product kit's tokens.
const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../src/**/*.stories.tsx"],
  core: { disableTelemetry: true },
  async viteFinal(cfg) {
    // Storybook serves many files: drop the single-file plugin the demo builds use.
    cfg.plugins = (cfg.plugins ?? []).flat().filter((p) => !(p && typeof p === "object" && "name" in p && String(p.name).includes("singlefile")));
    if (cfg.build) cfg.build.outDir = undefined;
    return cfg;
  },
};
export default config;
