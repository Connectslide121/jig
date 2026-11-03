import {
  LSPClient,
  LSPPlugin,
  languageServerExtensions,
  type Transport,
  Workspace,
  type WorkspaceFile,
} from "@codemirror/lsp-client";
import type { Extension, Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import DOMPurify from "dompurify";
import { fileUri, type LanguageServerStatus, sameUri, uriPath } from "../../../shared/lsp";
import { call } from "../../lib/host";
import { openPreview } from "./actions";

/** What `syncFiles` returns (the package doesn't export its name). */
type WorkspaceFileUpdate = ReturnType<Workspace["syncFiles"]>[number];

class JigFile implements WorkspaceFile {
  constructor(
    readonly uri: string,
    readonly languageId: string,
    public version: number,
    public doc: Text,
    public view: EditorView,
  ) {}
  getView(): EditorView {
    return this.view;
  }
}

const windows = navigator.userAgent.includes("Windows");

/**
 * Jig's files for one language server (D-259): editors open and close them; a definition in another
 * file opens it in Preview. URIs are compared loosely (servers write `c%3A` where Jig writes `C:`).
 */
class JigWorkspace extends Workspace {
  files: JigFile[] = [];
  private versions: Record<string, number> = {};
  private next(uri: string): number {
    this.versions[uri] = (this.versions[uri] ?? -1) + 1;
    return this.versions[uri]!;
  }
  override getFile(uri: string): WorkspaceFile | null {
    return this.files.find((f) => sameUri(f.uri, uri)) ?? null;
  }
  syncFiles(): readonly WorkspaceFileUpdate[] {
    const out: WorkspaceFileUpdate[] = [];
    for (const file of this.files) {
      const plugin = LSPPlugin.get(file.view);
      if (!plugin) continue;
      const changes = plugin.unsyncedChanges;
      if (changes.empty) continue;
      out.push({ changes, file, prevDoc: file.doc });
      file.doc = file.view.state.doc;
      file.version = this.next(file.uri);
      plugin.clear();
    }
    return out;
  }
  openFile(uri: string, languageId: string, view: EditorView): void {
    // The same file in two editors (split view): the first one talks to the server.
    if (this.getFile(uri)) return;
    const file = new JigFile(uri, languageId, this.next(uri), view.state.doc, view);
    this.files.push(file);
    this.client.didOpen(file);
  }
  closeFile(uri: string, view: EditorView): void {
    const file = this.files.find((f) => sameUri(f.uri, uri) && f.view === view);
    if (!file) return;
    this.files = this.files.filter((f) => f !== file);
    this.client.didClose(file.uri);
  }
  override async displayFile(uri: string): Promise<EditorView | null> {
    openPreview(uriPath(uri, windows));
    // The Preview tab's editor joins this workspace when it opens; wait for it a moment.
    for (let i = 0; i < 40; i++) {
      const file = this.getFile(uri) as JigFile | null;
      if (file) return file.view;
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  }
}

/** Messages to and from one running server, through the host (`lsp.send` / `lsp.message`). */
function transport(id: string): Transport {
  const handlers = new Set<(message: string) => void>();
  window.jig.on("lsp.message", (event) => {
    if (event.id === id) for (const h of handlers) h(event.message);
  });
  return {
    send: (message) => void call("lsp.send", { id, message }).catch(() => {}),
    subscribe: (h) => handlers.add(h),
    unsubscribe: (h) => handlers.delete(h),
  };
}

const clients = new Map<string, LSPClient>();
window.jig?.on?.("lsp.exited", ({ id }) => {
  clients.get(id)?.disconnect();
  clients.delete(id);
});

function client(status: Extract<LanguageServerStatus, { status: "ready" }>): LSPClient {
  let c = clients.get(status.id);
  if (!c) {
    c = new LSPClient({
      rootUri: status.rootUri,
      workspace: (cl) => new JigWorkspace(cl),
      extensions: languageServerExtensions(),
      // Hover text is Markdown from the server: rendered as HTML, so it's cleaned first.
      sanitizeHTML: (html) => DOMPurify.sanitize(html),
      timeout: 10_000,
    }).connect(transport(status.id));
    clients.set(status.id, c);
  }
  return c;
}

/** Errors, warnings and the server's tooltips in Jig's tokens, so they follow the theme. */
export const lspTheme = EditorView.theme({
  ".cm-lintRange-error": {
    backgroundImage: "none",
    textDecoration: "underline wavy var(--color-danger)",
    textUnderlineOffset: "3px",
  },
  ".cm-lintRange-warning": {
    backgroundImage: "none",
    textDecoration: "underline wavy var(--color-warning)",
    textUnderlineOffset: "3px",
  },
  ".cm-lintRange-info, .cm-lintRange-hint": {
    backgroundImage: "none",
    textDecoration: "underline dotted var(--color-info)",
    textUnderlineOffset: "3px",
  },
  ".cm-diagnostic": { padding: "4px 8px", fontFamily: "var(--font-sans)", fontSize: "0.85rem" },
  ".cm-diagnostic-error": { borderLeft: "3px solid var(--color-danger)" },
  ".cm-diagnostic-warning": { borderLeft: "3px solid var(--color-warning)" },
  ".cm-diagnostic-info, .cm-diagnostic-hint": { borderLeft: "3px solid var(--color-info)" },
  ".cm-lsp-documentation": { fontFamily: "var(--font-sans)", fontSize: "0.85rem", maxWidth: "36rem" },
  ".cm-lsp-documentation code, .cm-lsp-documentation pre": { fontFamily: "var(--font-mono)" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--color-accent-soft)",
    color: "var(--color-fg)",
  },
  ".cm-panel.cm-lsp-reference-panel": { backgroundColor: "var(--color-surface)" },
});

/**
 * The language server for a file in the editor: its CodeMirror extension (or why there is none) and
 * `release` for when the editor closes.
 */
export async function languageServerFor(
  path: string,
): Promise<{ status: LanguageServerStatus; extension?: Extension; release: () => void }> {
  const status = await call("lsp.open", { path });
  if (status.status !== "ready") return { status, release: () => {} };
  const c = client(status);
  let released = false;
  return {
    status,
    extension: [c.plugin(fileUri(path), status.languageId), lspTheme],
    release: () => {
      if (released) return;
      released = true;
      void call("lsp.release", { id: status.id }).catch(() => {});
    },
  };
}
