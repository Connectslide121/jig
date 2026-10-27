import { Settings } from "lucide-react";
import { registerTabType } from "../../workbench/registry";
import { SettingsTab } from "./SettingsTab";

export function registerSettings(): void {
  registerTabType({
    type: "jig.settings",
    title: () => "Settings",
    icon: Settings,
    component: SettingsTab,
    singleton: true,
    owner: "core",
  });
}
