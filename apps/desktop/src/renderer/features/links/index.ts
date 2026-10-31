import { Link } from "lucide-react";
import { registerAction, registerView } from "../../workbench/registry";
import { workbench } from "../../workbench/store";
import { LinksView, openAzureDialog, openLinkDialog } from "./LinksView";

export const LINKS_VIEW = "jig.links";

/** Project links: opened from "Add a project link" or the Views list (D-102: left, follows the project). */
export function registerLinks(): void {
  registerView({
    id: LINKS_VIEW,
    title: "Links",
    icon: Link,
    defaultRegion: "left",
    startHidden: true,
    component: LinksView,
    owner: "core",
  });
  registerAction({
    id: "jig.links.show",
    title: "Project links",
    group: "Projects",
    icon: Link,
    keywords: ["link", "links", "url", "site"],
    run: () => workbench.showView(LINKS_VIEW),
  });
  registerAction({
    id: "jig.links.add",
    title: "Add a project link…",
    group: "Projects",
    icon: Link,
    keywords: ["link", "azure", "url", "site", "resource"],
    run: () => {
      workbench.showView(LINKS_VIEW);
      openLinkDialog();
    },
  });
  registerAction({
    id: "jig.links.azure",
    title: "Add project links from Azure…",
    group: "Projects",
    icon: Link,
    keywords: ["azure", "resource group", "portal"],
    run: () => {
      workbench.showView(LINKS_VIEW);
      openAzureDialog();
    },
  });
}
