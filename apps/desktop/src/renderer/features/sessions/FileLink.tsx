import { useEffect, useState } from "react";
import { pathInCode } from "../../../shared/filePaths";
import { call } from "../../lib/host";
import { formatShortcut } from "../../workbench/shortcuts";
import { openPreview } from "../preview/actions";

type Found = { path: string; kind: "file" | "folder" } | null;
/** What each path resolved to, per chat folder, so a long chat asks the host once per path. */
const cache = new Map<string, Promise<Found>>();

function locate(cwd: string, path: string): Promise<Found> {
  const key = `${cwd}\n${path}`;
  let found = cache.get(key);
  if (!found) {
    found = call("files.locate", { cwd, path }).catch(() => null);
    cache.set(key, found);
  }
  return found;
}

/**
 * A path Claude wrote in inline code, as a link when it exists (D-261): a file opens in Preview, a
 * folder in the file manager; Ctrl/Cmd+click opens it with its own app (an HTML page in the browser).
 * Until the host answers, and when nothing is there, it stays plain code, the same size either way.
 */
function FileLink({ text, cwd }: { text: string; cwd: string }) {
  const ref = pathInCode(text)!;
  const [found, setFound] = useState<Found>();
  useEffect(() => {
    let live = true;
    void locate(cwd, ref.path).then((f) => live && setFound(f));
    return () => {
      live = false;
    };
  }, [cwd, ref.path]);
  const code = "rounded-sm bg-code px-1 py-px font-mono text-xs";
  if (!found) return <code className={code}>{text}</code>;
  const open = (external: boolean) => {
    if (external || found.kind === "folder") void call("app.openPath", { path: found.path });
    else openPreview(found.path);
  };
  return (
    <button
      type="button"
      title={`${found.path}
Click: open ${found.kind === "folder" ? "the folder" : "in Preview"} · ${formatShortcut("Mod+Click")}: open with its app`}
      data-testid="file-link"
      onClick={(e) => open(e.ctrlKey || e.metaKey)}
      className="inline cursor-pointer text-left align-baseline"
    >
      <code
        className={`${code} text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent`}
      >
        {text}
      </code>
    </button>
  );
}

/** For chat Markdown: inline code that looks like a path becomes a `FileLink` (resolved from `cwd`). */
export function chatInlineCode(cwd: string | undefined) {
  return (text: string) => (cwd && pathInCode(text) ? <FileLink text={text} cwd={cwd} /> : undefined);
}
