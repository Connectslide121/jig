import { Eye } from "lucide-react";
import { call } from "../../lib/host";
import { registerAction, registerTabType } from "../../workbench/registry";
import { openPreview } from "./actions";
import { PreviewTab } from "./PreviewTab";

export { openPreview } from "./actions";

const baseName = (path: string) => path.split(/[\\/]/).pop() || path;

export function registerPreview(): void {
  registerTabType({
    type: "jig.preview",
    title: (params) => baseName(String(params.path ?? "Preview")),
    icon: Eye,
    component: PreviewTab,
    filePath: (params) => (typeof params.path === "string" ? params.path : undefined),
    owner: "core",
  });
  registerAction({
    id: "jig.preview",
    title: "Preview a file…",
    group: "Files",
    icon: Eye,
    keywords: ["markdown", "pdf", "csv", "json", "open", "view", "mermaid", "notebook"],
    run: async () => {
      const [path] = await call("app.pickFiles", { title: "Preview a file" });
      if (path) openPreview(path);
    },
  });
}
