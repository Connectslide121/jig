import { writeFile } from "node:fs/promises";
import { release } from "node:os";
import { join } from "node:path";
import { app, shell } from "electron";
import { addonService } from "../addons";
import { buildService } from "../builder";
import { handle } from "../ipc/router";
import { paths } from "../state/paths";
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
    // JIG_MAIL_OUT (tests): the zip and the mailto: link (mailto.txt) go to that folder; nothing opens.
    downloads: () => process.env.JIG_MAIL_OUT || app.getPath("downloads"),
    openEmail: async (url) => {
      if (process.env.JIG_MAIL_OUT) await writeFile(join(process.env.JIG_MAIL_OUT, "mailto.txt"), url);
      else await shell.openExternal(url);
    },
    showFile: (path) => {
      if (!process.env.JIG_MAIL_OUT) shell.showItemInFolder(path);
    },
  });
  handle("devRequests.create", ({ buildId }) => s.create(buildId));
  handle("devRequests.email", ({ buildId }) => s.email(buildId));
  handle("devRequests.prompt", ({ buildId }) => s.prompt(buildId));
  handle("devRequests.status", ({ buildId }) => s.status(buildId));
  handle("devRequests.approve", ({ buildId }) => s.approve(buildId));
}
