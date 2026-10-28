import { CalendarClock } from "lucide-react";
import { registerAction, registerTabType } from "../../workbench/registry";
import { workbench } from "../../workbench/store";
import { RoutinesTab } from "./RoutinesTab";

export function registerRoutines(): void {
  registerTabType({
    type: "jig.routines",
    title: () => "Routines",
    icon: CalendarClock,
    component: RoutinesTab,
    singleton: true,
    owner: "core",
  });
  registerAction({
    id: "jig.routines",
    title: "Routines",
    group: "Claude",
    icon: CalendarClock,
    keywords: ["schedule", "cron", "trigger", "recurring", "automation"],
    run: () => {
      workbench.openTab("jig.routines");
    },
  });
}
