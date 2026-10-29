import type { AddonUiContext } from "@jig/sdk";
import { Badge, Empty, formatBytes, ImagePreview, Spinner, useHostCall } from "@jig/sdk/ui";

type Version = { dataUrl: string; bytes: number } | { tooLarge: true } | null;

/** The revisions to compare for a changed image, matching the text diff of the same file. */
export function imageRevs(args: { commit?: string; staged?: boolean; untracked?: boolean }) {
  if (args.commit) return { before: `${args.commit}^`, after: args.commit };
  if (args.staged) return { before: "HEAD", after: "index" };
  if (args.untracked) return { before: undefined, after: "worktree" };
  return { before: "index", after: "worktree" };
}

function Side({
  title,
  version,
  cwd,
  path,
}: {
  title: string;
  version: Version | undefined;
  cwd: string;
  path: string;
}) {
  let body: React.ReactNode;
  if (version === undefined) body = <Spinner center />;
  else if (version === null) body = <Empty title="No file">The image doesn't exist in this version.</Empty>;
  else if ("tooLarge" in version) body = <Empty title="Too large">The image is larger than 25 MB.</Empty>;
  else body = <ImagePreview src={version.dataUrl} alt={`${path} (${title})`} bytes={version.bytes} />;
  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      data-testid={`git-image-${title.toLowerCase()}`}
      title={cwd}
    >
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line px-3 text-xs font-medium">
        {title}
        {version && !("tooLarge" in version) && <Badge>{formatBytes(version.bytes)}</Badge>}
      </div>
      <div className="min-h-0 flex-1">{body}</div>
    </div>
  );
}

/** A changed image: before and after, side by side, instead of "binary file". */
export function ImageDiff({
  ctx,
  cwd,
  path,
  commit,
  staged,
  untracked,
}: {
  ctx: AddonUiContext;
  cwd: string;
  path: string;
  commit?: string;
  staged?: boolean;
  untracked?: boolean;
}) {
  const revs = imageRevs({ commit, staged, untracked });
  const before = useHostCall<Version>("image", { cwd, path, rev: revs.before }, { skip: !revs.before });
  const after = useHostCall<Version>("image", { cwd, path, rev: revs.after });
  const error = before.error || after.error;
  if (error) return <div className="p-4 text-sm text-danger">{error}</div>;
  return (
    <div className="flex min-h-0 flex-1 divide-x divide-line" data-testid="git-image-diff">
      {revs.before && <Side title="Before" version={before.data} cwd={cwd} path={path} />}
      <Side title="After" version={after.data} cwd={cwd} path={path} />
      <span className="hidden">{ctx.addon.id}</span>
    </div>
  );
}
