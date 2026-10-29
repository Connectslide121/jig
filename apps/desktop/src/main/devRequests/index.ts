import { release } from "node:os";
import { app } from "electron";
import { addonService } from "../addons";
import { buildService } from "../builder";
import { getConfig } from "../config";
import { handle } from "../ipc/router";
import { paths } from "../state/paths";
import { openMail } from "./mail";
import { DevRequestService } from "./service";

/** Development requests: `devRequests.*` (docs/reference/ipc.md, D-119). */
export function startDevRequests(): void {
  const s = new DevRequestService({
    dir: paths.devRequests(),
    job: (id) => buildService().get(id),
    context: () => ({
      jigVersion: app.getVersion(),
      os: `${process.platform} ${release()} (${process.arch})`,
      addons: addonService()
        .list()
        .filter((a) => a.enabled && !a.preview)
        .map((a) => a.id),
      createdAt: new Date().toISOString(),
    }),
    recipient: () => getConfig().devRequests.email.trim() || "support@sprinta.se",
    openMail,
  });
  handle("devRequests.create", ({ buildId }) => s.create(buildId));
  handle("devRequests.email", ({ buildId }) => s.email(buildId));
  handle("devRequests.prompt", ({ buildId }) => s.prompt(buildId));
}
