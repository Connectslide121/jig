import { useCallback, useEffect, useState } from "react";
import type { ProjectScripts } from "../../../shared/terminals";
import { call, useHostEvent } from "../../lib/host";
import { useTerminals } from "../terminals/store";

/** A project's discovered scripts and groups, plus which scripts are running. */
export function useProjectScripts(projectId: string | undefined) {
  const [data, setData] = useState<ProjectScripts>();
  const [error, setError] = useState<string>();
  const terminals = useTerminals((s) => s.terminals);
  const reload = useCallback(() => {
    if (!projectId) return;
    call("scripts.list", { projectId })
      .then((d) => {
        setData(d);
        setError(undefined);
      })
      .catch((e: Error) => setError(e.message));
  }, [projectId]);
  useEffect(reload, [reload]);
  useHostEvent("scripts.changed", (d) => {
    if (d.projectId === projectId) setData(d);
  });
  const running = new Map(
    terminals
      .filter((t) => t.projectId === projectId && t.scriptId && t.status === "running")
      .map((t) => [t.scriptId!, t]),
  );
  return { data, error, reload, running };
}
