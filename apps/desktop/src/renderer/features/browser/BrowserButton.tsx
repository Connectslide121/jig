import { Globe } from "lucide-react";
import { IconButton } from "../../ui";
import { workbench } from "../../workbench/store";

export function BrowserButton() {
  return (
    <IconButton
      icon={Globe}
      label="Open Browser"
      data-testid="topbar-browser"
      onClick={() => workbench.openViewTab("jig.userBrowser")}
    />
  );
}
