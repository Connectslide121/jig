import { CircleHelp } from "lucide-react";
import { registerAction, registerTabType } from "../../workbench/registry";
import { workbench } from "../../workbench/store";
import { AboutTab } from "./AboutTab";

export function openAbout(section?: string): void {
  workbench.openTab("jig.about", section ? { section } : {});
}

export function registerAbout(): void {
  registerTabType({
    type: "jig.about",
    title: () => "What Jig can do",
    icon: CircleHelp,
    component: AboutTab,
    singleton: true,
    owner: "core",
  });
  registerAction({
    id: "jig.about",
    title: "What Jig can do",
    group: "Jig",
    icon: CircleHelp,
    keywords: ["about", "help", "features", "slots", "extensions", "skills"],
    run: () => openAbout(),
  });
}
