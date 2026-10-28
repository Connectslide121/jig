import { LayoutTemplate } from "lucide-react";
import { registerAction, registerTabType } from "../../workbench/registry";
import { workbench } from "../../workbench/store";
import { ArtifactsTab } from "./ArtifactsTab";

export function registerArtifacts(): void {
  registerTabType({
    type: "jig.artifacts",
    title: () => "Artifacts",
    icon: LayoutTemplate,
    component: ArtifactsTab,
    singleton: true,
    owner: "core",
  });
  registerAction({
    id: "jig.artifacts",
    title: "Artifacts",
    group: "Claude",
    icon: LayoutTemplate,
    keywords: ["artifact", "page", "published", "claude.ai"],
    run: () => {
      workbench.openTab("jig.artifacts");
    },
  });
}
