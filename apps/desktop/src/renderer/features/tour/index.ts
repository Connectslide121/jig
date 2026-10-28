import { Map as MapIcon } from "lucide-react";
import { registerTabType } from "../../workbench/registry";
import { TourTab } from "./TourTab";

export { startTour } from "./actions";

export function registerTour(): void {
  registerTabType({
    type: "jig.tour",
    title: (params) => `Tour: ${String(params.title ?? "changes")}`,
    icon: MapIcon,
    component: TourTab,
    owner: "core",
  });
}
