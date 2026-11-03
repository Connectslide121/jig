import { X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { MeetingOverview } from "../../../shared/meetings";
import type { ProjectsState } from "../../../shared/projects";
import { call, errorMessage, useHostEvent } from "../../lib/host";
import { useThemeController } from "../../lib/theme";
import { cn, DialogHost, ErrorBoundary, MenuHost } from "../../ui";

const EMPTY_PROJECTS: ProjectsState = { projects: [], workspaces: [], activeId: undefined };

/** The frame both Meetings windows share (D-292): theme, menus, dialogs and an error boundary. */
export function MeetingsShell({ label, children }: { label: string; children: ReactNode }) {
  useThemeController();
  return (
    <ErrorBoundary label={label}>
      {children}
      <MenuHost />
      <DialogHost />
    </ErrorBoundary>
  );
}

export type Pending = "calendar" | "notes" | "join" | "ask" | "queue" | "connection" | "call";

/**
 * What the lobby and the call window both read: the overview (kept fresh on `meetings.changed`), the
 * projects, the status bar's error and the button that is busy.
 */
export function useMeetingsData() {
  const [overview, setOverview] = useState<MeetingOverview>();
  const [projects, setProjects] = useState<ProjectsState>(EMPTY_PROJECTS);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Pending>();
  const refreshed = useRef(0);
  const reload = useCallback(async () => {
    const version = ++refreshed.current;
    const data = await call("meetings.overview");
    if (version === refreshed.current) setOverview(data);
  }, []);
  const run = async (fn: () => Promise<unknown>, key: Pending = "call") => {
    setPending(key);
    setError("");
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(undefined);
    }
  };
  useEffect(() => {
    void reload().catch((e) => setError(errorMessage(e)));
    void call("projects.list")
      .then(setProjects)
      .catch((e) => setError(errorMessage(e)));
  }, [reload]);
  useHostEvent("meetings.changed", () => {
    void reload().catch((e) => setError(errorMessage(e)));
  });
  useHostEvent("projects.changed", setProjects);
  const connected = Boolean(overview?.account || overview?.fake);
  return {
    overview,
    setOverview,
    projects,
    error,
    setError,
    pending,
    setPending,
    reload,
    run,
    connected,
  };
}

/** The Microsoft account the windows use, or that none is connected. */
export function AccountLabel({ overview }: { overview: MeetingOverview }) {
  const connected = Boolean(overview.account || overview.fake);
  return (
    <span className="flex max-w-64 items-center gap-2 text-xs text-muted">
      <span className={cn("size-2 shrink-0 rounded-full", connected ? "bg-success" : "bg-hint")} />
      <span className="truncate">
        {overview.fake ? "Test meeting service" : (overview.account ?? "Microsoft not connected")}
      </span>
    </span>
  );
}

/** The bottom status bar: an error (with ×) in place of the status while there is one. */
export function StatusBar({
  error,
  onDismiss,
  children,
}: {
  error: string;
  onDismiss(): void;
  children: ReactNode;
}) {
  return (
    <footer
      role="status"
      className="flex h-7 shrink-0 items-center gap-2 border-t border-line bg-surface px-3 text-xs"
    >
      {error ? (
        <>
          <span className="min-w-0 flex-1 truncate text-danger" title={error}>
            {error}
          </span>
          <button
            type="button"
            aria-label="Dismiss error"
            className="rounded-sm text-hint hover:text-fg"
            onClick={onDismiss}
          >
            <X className="size-3.5" />
          </button>
        </>
      ) : (
        children
      )}
    </footer>
  );
}
