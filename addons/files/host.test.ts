import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddonHostApi } from "@jig/sdk";
import { describe, expect, it } from "vitest";
import { unwatchFolder, watchFolder } from "./host";

describe("watchFolder", () => {
  // Windows reports an error on the watch when its folder is deleted; Linux has no recursive watch.
  it.runIf(process.platform === "win32")(
    "says when the watch is lost, so the view polls instead",
    async () => {
      const root = join(await mkdtemp(join(tmpdir(), "jig-files-")), "shown");
      await mkdir(root);
      const events: Array<{ topic: string; payload: unknown }> = [];
      const api = {
        emit: (topic: string, payload: unknown) => events.push({ topic, payload }),
      } as unknown as AddonHostApi;
      expect(watchFolder({ root }, api)).toEqual({ live: true });
      await rm(root, { recursive: true, force: true });
      await expect
        .poll(() => events.find((e) => e.topic === "watchLost"), { timeout: 5000 })
        .toEqual({
          topic: "watchLost",
          payload: { root },
        });
      // Whoever watches it next is told it isn't live.
      expect(watchFolder({ root }, api)).toEqual({ live: false });
      unwatchFolder({ root });
      unwatchFolder({ root });
    },
  );
});
