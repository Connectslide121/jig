import { registerStatusItem } from "../../workbench/registry";
import { UsageStatusItem } from "./UsageMeter";

export { UsageRing } from "./UsageMeter";

export function registerUsage(): void {
  registerStatusItem({ id: "jig.usage", side: "right", order: 0, component: UsageStatusItem, owner: "core" });
}
