import type { AddonUiContext } from "@jig/sdk";
import { Badge, Button, cn, Spinner } from "@jig/sdk/ui";
import { ChevronDown, ChevronRight, Tag } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { RepoState } from "./host";
import { type CommitFile, commitAge, type RepoCommit, refLabel } from "./lib/commits";

/** How many commits a repository shows first, and how many more each "Show more" adds. */
const FIRST = 15;
const MORE = 25;

const MARK = {
  incoming: { glyph: "↓", className: "text-info", title: "To pull: on the upstream, not here yet" },
  local: { glyph: "↑", className: "text-warning", title: "To push: only on this machine" },
  pushed: { glyph: "●", className: "text-hint", title: "Pushed" },
} as const;

const STATUS: Record<string, string> = {
  A: "text-success",
  D: "text-danger",
  R: "text-info",
  C: "text-info",
};

/**
 * Under a repository's row, like the Git plugin (D-149): its branch and upstream, the commits to pull,
 * then the branch's latest (to push or pushed). A commit opens its files; a file opens its diff.
 */
export function Commits({ ctx, repo }: { ctx: AddonUiContext; repo: RepoState }) {
  const [limit, setLimit] = useState(FIRST);
  const [list, setList] = useState<RepoCommit[]>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [open, setOpen] = useState<string>();
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setList(await ctx.host.call<RepoCommit[]>("commits", { path: repo.path, limit }));
      setError(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [ctx, repo.path, limit]);
  // Read again when the branch moves (a commit, a pull, a push, a fetch).
  useEffect(() => {
    void load();
  }, [load, repo.branch, repo.ahead, repo.behind]);
  const info = [
    `${repo.branch ?? "—"}${repo.upstream ? ` → ${repo.upstream}` : " · no upstream"}`,
    repo.ahead ? `↑${repo.ahead} to push` : "",
    repo.behind ? `↓${repo.behind} to pull` : "",
  ].filter(Boolean);
  return (
    <div className="mb-1 ml-1 border-l border-line pl-2" data-testid={`repo-commits-${repo.path}`}>
      <div className="truncate py-0.5 text-2xs text-muted">{info.join(" · ")}</div>
      {error && <div className="text-xs text-danger">{error}</div>}
      {!list && !error && <Spinner center />}
      {list?.length === 0 && <div className="py-1 text-xs text-hint">No commits yet.</div>}
      {list?.map((c) => (
        <CommitRow
          key={`${c.state}:${c.hash}`}
          ctx={ctx}
          repo={repo}
          commit={c}
          open={open === c.hash}
          onToggle={() => setOpen(open === c.hash ? undefined : c.hash)}
        />
      ))}
      {list && list.filter((c) => c.state !== "incoming").length >= limit && (
        <Button
          size="sm"
          variant="ghost"
          busy={loading}
          className="mt-0.5"
          onClick={() => setLimit(limit + MORE)}
          data-testid="repo-commits-more"
        >
          Show more
        </Button>
      )}
    </div>
  );
}

function CommitRow({
  ctx,
  repo,
  commit,
  open,
  onToggle,
}: {
  ctx: AddonUiContext;
  repo: RepoState;
  commit: RepoCommit;
  open: boolean;
  onToggle: () => void;
}) {
  const mark = MARK[commit.state];
  return (
    <div data-testid={`repo-commit-${commit.short}`}>
      <button
        type="button"
        onClick={onToggle}
        title={`${commit.short} · ${commit.author}\n${commit.subject}`}
        className={cn(
          "flex h-6 w-full min-w-0 items-center gap-1.5 rounded-sm px-1 text-left text-xs hover:bg-active",
          open && "bg-active",
        )}
      >
        <span className={cn("w-3 shrink-0 text-center", mark.className)} title={mark.title}>
          {mark.glyph}
        </span>
        {commit.refs.slice(0, 2).map((ref) => {
          const { label, tag } = refLabel(ref);
          return (
            <Badge
              key={ref}
              tone={tag ? "warning" : "accent"}
              className="max-w-1/3 shrink-0 gap-0.5 truncate"
            >
              {tag && <Tag className="size-2.5" />}
              {label}
            </Badge>
          );
        })}
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            commit.state === "pushed" && !open ? "text-muted" : "text-fg",
          )}
        >
          {commit.subject}
        </span>
        <span className="shrink-0 text-2xs text-hint tabular-nums">
          {commit.author.split(" ")[0]} · {commitAge(commit.time)}
        </span>
      </button>
      {open && <Files ctx={ctx} repo={repo} commit={commit} />}
    </div>
  );
}

function Files({ ctx, repo, commit }: { ctx: AddonUiContext; repo: RepoState; commit: RepoCommit }) {
  const [files, setFiles] = useState<CommitFile[]>();
  const [error, setError] = useState<string>();
  const [open, setOpen] = useState<string>();
  useEffect(() => {
    ctx.host
      .call<CommitFile[]>("commitFiles", { path: repo.path, hash: commit.hash })
      .then(setFiles, (e: Error) => setError(e.message));
  }, [ctx, repo.path, commit.hash]);
  return (
    <div className="mb-1 ml-4 flex flex-col" data-testid="repo-commit-files">
      <div className="flex items-center gap-1 py-0.5 text-2xs text-hint">
        <span className="font-mono">{commit.short}</span>
        <span>· {files ? `${files.length} file${files.length === 1 ? "" : "s"} changed` : ""}</span>
        <button
          type="button"
          className="ml-auto text-accent hover:underline"
          onClick={() => void navigator.clipboard.writeText(commit.hash)}
        >
          Copy hash
        </button>
      </div>
      {error && <div className="text-xs text-danger">{error}</div>}
      {!files && !error && <Spinner center />}
      {files?.map((f) => (
        <div key={f.path}>
          <button
            type="button"
            onClick={() => setOpen(open === f.path ? undefined : f.path)}
            className={cn(
              "flex h-6 w-full min-w-0 items-center gap-1.5 rounded-sm px-1 text-left text-xs hover:bg-active",
              open === f.path && "bg-active",
            )}
            title={f.from ? `${f.from} → ${f.path}` : f.path}
            data-testid={`repo-commit-file-${f.path}`}
          >
            {open === f.path ? (
              <ChevronDown className="size-3 shrink-0 text-hint" />
            ) : (
              <ChevronRight className="size-3 shrink-0 text-hint" />
            )}
            <span className={cn("w-3 shrink-0 font-mono font-semibold", STATUS[f.status] ?? "text-warning")}>
              {f.status}
            </span>
            <span className="min-w-0 flex-1 truncate" dir="rtl">
              {/* rtl keeps the file's name in view when the path is cut. */}
              <bdi>{f.path}</bdi>
            </span>
            {f.added < 0 ? (
              <span className="shrink-0 text-2xs text-hint">binary</span>
            ) : (
              <span className="shrink-0 font-mono text-2xs tabular-nums">
                <span className="text-success">+{f.added}</span>{" "}
                <span className="text-danger">−{f.removed}</span>
              </span>
            )}
          </button>
          {open === f.path && <Diff ctx={ctx} repo={repo} hash={commit.hash} file={f} />}
        </div>
      ))}
    </div>
  );
}

function Diff({
  ctx,
  repo,
  hash,
  file,
}: {
  ctx: AddonUiContext;
  repo: RepoState;
  hash: string;
  file: CommitFile;
}) {
  const [diff, setDiff] = useState<{ text: string; cut: boolean }>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    ctx.host
      .call<{ text: string; cut: boolean }>("commitDiff", {
        path: repo.path,
        hash,
        file: file.path,
        from: file.from,
      })
      .then(setDiff, (e: Error) => setError(e.message));
  }, [ctx, repo.path, hash, file.path, file.from]);
  if (error) return <div className="text-xs text-danger">{error}</div>;
  if (!diff) return <Spinner center />;
  if (!diff.text) return <div className="py-1 pl-5 text-xs text-hint">No text changes.</div>;
  return (
    <div
      className="my-1 ml-1 overflow-x-auto rounded-md border border-line bg-surface py-1 font-mono text-2xs leading-relaxed"
      data-testid="repo-commit-diff"
    >
      {diff.text.split("\n").map((line, i) => (
        <div
          key={i}
          className={cn(
            "px-2 whitespace-pre",
            line.startsWith("@@")
              ? "text-info"
              : line.startsWith("+")
                ? "bg-success-soft text-success"
                : line.startsWith("-")
                  ? "bg-danger-soft text-danger"
                  : "text-muted",
          )}
        >
          {line || " "}
        </div>
      ))}
      {diff.cut && <div className="px-2 pt-1 text-hint">… cut here: the rest is in the Git view.</div>}
    </div>
  );
}
