import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { changelogPlugin } from "./scripts/changelog-plugin";

const root = fileURLToPath(new URL("./src/renderer", import.meta.url));
const repo = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  root,
  base: "./",
  // What's new reads release/jig-*-notes.md at build time (D-393).
  plugins: [react(), tailwindcss(), changelogPlugin(repo)],
  build: {
    outDir: fileURLToPath(new URL("./dist/renderer", import.meta.url)),
    emptyOutDir: true,
    target: "chrome140",
    chunkSizeWarningLimit: 4000,
  },
  // Dictation's Whisper worker imports transformers.js, which splits into chunks (D-208).
  worker: { format: "es" },
  server: { port: 5199, strictPort: false },
});
