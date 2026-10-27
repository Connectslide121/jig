import { registerFeatures } from "./features";
import { useThemeController } from "./lib/theme";
import { Workbench } from "./workbench/Workbench";

registerFeatures();

export function App() {
  useThemeController();
  return <Workbench />;
}
