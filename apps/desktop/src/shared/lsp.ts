/**
 * Language servers for the file editor (D-259): errors, hover, completion lists, go to definition,
 * references, rename, signature help and formatting from the language servers the user has installed
 * (as with git, gh and az, Jig uses the user's own tools). Jig runs them; CodeMirror's LSP client
 * speaks to them from the editor.
 */
export interface LanguageServerDef {
  id: string;
  /** What the user sees: "TypeScript and JavaScript". */
  name: string;
  /** The program, looked up on PATH (Windows: also .cmd/.exe). */
  command: string;
  args: string[];
  /** File extensions it serves (lower case, no dot). */
  extensions: string[];
  /** Files that mark a project's root (`*.sln` matches by extension); else the git root or the file's folder. */
  markers: string[];
  /** How to install it, run in a Jig terminal when you choose Install. */
  install: string;
}

export const LANGUAGE_SERVERS: LanguageServerDef[] = [
  {
    id: "typescript",
    name: "TypeScript and JavaScript",
    command: "typescript-language-server",
    args: ["--stdio"],
    extensions: ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"],
    markers: ["tsconfig.json", "jsconfig.json", "package.json"],
    install: "npm install --global typescript-language-server typescript",
  },
  {
    id: "python",
    name: "Python (Pyright)",
    command: "pyright-langserver",
    args: ["--stdio"],
    extensions: ["py", "pyi"],
    markers: ["pyproject.toml", "pyrightconfig.json", "setup.py", "requirements.txt"],
    install: "npm install --global pyright",
  },
  {
    id: "csharp",
    name: "C#",
    command: "csharp-ls",
    args: [],
    extensions: ["cs"],
    markers: ["*.sln", "*.slnx", "*.csproj"],
    install: "dotnet tool install --global csharp-ls",
  },
  {
    id: "json",
    name: "JSON",
    command: "vscode-json-language-server",
    args: ["--stdio"],
    extensions: ["json", "jsonc"],
    markers: ["package.json"],
    install: "npm install --global vscode-langservers-extracted",
  },
  {
    id: "css",
    name: "CSS, SCSS and Less",
    command: "vscode-css-language-server",
    args: ["--stdio"],
    extensions: ["css", "scss", "less"],
    markers: ["package.json"],
    install: "npm install --global vscode-langservers-extracted",
  },
  {
    id: "html",
    name: "HTML",
    command: "vscode-html-language-server",
    args: ["--stdio"],
    extensions: ["html", "htm"],
    markers: ["package.json"],
    install: "npm install --global vscode-langservers-extracted",
  },
  {
    id: "go",
    name: "Go",
    command: "gopls",
    args: [],
    extensions: ["go"],
    markers: ["go.work", "go.mod"],
    install: "go install golang.org/x/tools/gopls@latest",
  },
  {
    id: "rust",
    name: "Rust",
    command: "rust-analyzer",
    args: [],
    extensions: ["rs"],
    markers: ["Cargo.toml"],
    install: "rustup component add rust-analyzer",
  },
];

const ext = (path: string) => /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase() ?? "";

/** The language server for a file, if one is known. */
export function serverFor(path: string): LanguageServerDef | undefined {
  const e = ext(path);
  return e ? LANGUAGE_SERVERS.find((s) => s.extensions.includes(e)) : undefined;
}

/** LSP language ids for common files. */
export function languageId(path: string): string {
  const e = ext(path);
  const ids: Record<string, string> = {
    ts: "typescript",
    mts: "typescript",
    cts: "typescript",
    tsx: "typescriptreact",
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    jsx: "javascriptreact",
    py: "python",
    pyi: "python",
    cs: "csharp",
    md: "markdown",
    yml: "yaml",
    rs: "rust",
    rb: "ruby",
    sh: "shellscript",
    ps1: "powershell",
    kt: "kotlin",
    htm: "html",
    jsonc: "jsonc",
  };
  return ids[e] ?? (e || "plaintext");
}

/** A file path as a `file://` URI, the way servers expect it (Windows drive letters included). */
export function fileUri(path: string): string {
  const p = path.replaceAll("\\", "/");
  const withSlash = /^[a-z]:/i.test(p) ? `/${p}` : p;
  return `file://${withSlash
    .split("/")
    .map((part, i) => (i === 1 && /^[a-z]:$/i.test(part) ? part : encodeURIComponent(part)))
    .join("/")}`;
}

/** The path of a `file://` URI, in the platform's form (`C:\\…` on Windows). */
export function uriPath(uri: string, windows: boolean): string {
  const raw = decodeURIComponent(uri.replace(/^file:\/\//i, ""));
  if (/^\/[a-z]:/i.test(raw)) {
    const path = raw.slice(1);
    return windows ? `${path[0]!.toUpperCase()}${path.slice(1).replaceAll("/", "\\")}` : path;
  }
  return raw;
}

/** One form per file for comparing URIs: servers often write `c%3A` where Jig writes `C:`. */
export function sameUri(a: string, b: string): boolean {
  const norm = (u: string) =>
    decodeURIComponent(u).replace(/^file:\/\/\/([a-z]):/i, (_m, d: string) => `file:///${d.toLowerCase()}:`);
  return norm(a) === norm(b);
}

/** Where a language server stands for a file, as the editor's status line shows it. */
export type LanguageServerStatus =
  | { status: "ready"; id: string; serverId: string; name: string; rootUri: string; languageId: string }
  | { status: "missing"; serverId: string; name: string; install: string }
  | { status: "none" | "off" };

export interface LanguageServerInfo {
  id: string;
  name: string;
  command: string;
  install: string;
  extensions: string[];
  /** Where it was found on PATH, if it was. */
  path?: string;
  /** Running now, for this many project roots. */
  running: number;
}
