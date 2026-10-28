/**
 * VS Code file icon themes (`contributes.iconThemes`, e.g. Material Icon Theme or Seti): the JSON format
 * and how a file or folder name picks its icon, following VS Code's rules. Pure; the app loads the
 * files (apps/desktop/src/main/themes/fileIcons.ts). Documented in docs/reference/file-icons.md.
 */

export interface IconDefinition {
  /** Relative to the theme JSON file (svg/png). The app rewrites it to a URL. */
  iconPath?: string;
  /** Font icon themes (Seti): a glyph of one of `fonts`. */
  fontCharacter?: string;
  fontColor?: string;
  fontSize?: string;
  fontId?: string;
}

export interface IconAssociations {
  file?: string;
  folder?: string;
  folderExpanded?: string;
  rootFolder?: string;
  rootFolderExpanded?: string;
  fileExtensions?: Record<string, string>;
  fileNames?: Record<string, string>;
  folderNames?: Record<string, string>;
  folderNamesExpanded?: Record<string, string>;
  rootFolderNames?: Record<string, string>;
  rootFolderNamesExpanded?: Record<string, string>;
  languageIds?: Record<string, string>;
}

export interface IconFont {
  id: string;
  src: Array<{ path: string; format?: string }>;
  weight?: string;
  style?: string;
  size?: string;
}

export interface FileIconTheme extends IconAssociations {
  iconDefinitions: Record<string, IconDefinition>;
  fonts?: IconFont[];
  /** Overrides for light colour themes and high-contrast themes. */
  light?: IconAssociations;
  highContrast?: IconAssociations;
  hidesExplorerArrows?: boolean;
  showLanguageModeIcons?: boolean;
}

export interface ContributedIconTheme {
  id: string;
  label?: string;
  path: string;
}

/** The icon themes an extension's package.json contributes. */
export function contributedIconThemes(manifest: unknown): ContributedIconTheme[] {
  const themes = (manifest as { contributes?: { iconThemes?: unknown } })?.contributes?.iconThemes;
  if (!Array.isArray(themes)) return [];
  return themes.filter(
    (t): t is ContributedIconTheme =>
      typeof t === "object" && t !== null && typeof t.id === "string" && typeof t.path === "string",
  );
}

/** VS Code's `workbench.iconTheme` from its settings.json text (JSONC); VS Code's default is Seti. */
export function iconThemeSetting(settings: unknown): string | undefined {
  const value = (settings as Record<string, unknown> | undefined)?.["workbench.iconTheme"];
  return typeof value === "string" ? value : value === null ? "" : undefined;
}

/**
 * The language id VS Code would give a file (themes use these as a fallback: `languageIds`). Covers
 * the common languages; anything else has no language icon.
 */
const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "typescriptreact",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascriptreact",
  json: "json",
  jsonc: "jsonc",
  md: "markdown",
  markdown: "markdown",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  py: "python",
  cs: "csharp",
  csx: "csharp",
  fs: "fsharp",
  vb: "vb",
  java: "java",
  kt: "kotlin",
  go: "go",
  rs: "rust",
  rb: "ruby",
  php: "php",
  c: "c",
  h: "c",
  cpp: "cpp",
  hpp: "cpp",
  cc: "cpp",
  swift: "swift",
  sh: "shellscript",
  bash: "shellscript",
  zsh: "shellscript",
  ps1: "powershell",
  psm1: "powershell",
  psd1: "powershell",
  bat: "bat",
  cmd: "bat",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  xml: "xml",
  csproj: "xml",
  sln: "sln",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  vue: "vue",
  svelte: "svelte",
  dart: "dart",
  lua: "lua",
  r: "r",
  ini: "ini",
  txt: "plaintext",
  log: "log",
  diff: "diff",
  patch: "diff",
  bicep: "bicep",
  tf: "terraform",
  razor: "razor",
  cshtml: "razor",
};
const LANGUAGE_BY_NAME: Record<string, string> = {
  dockerfile: "dockerfile",
  makefile: "makefile",
  ".gitignore": "ignore",
  ".dockerignore": "ignore",
  ".env": "dotenv",
};

export function languageIdForFile(name: string): string | undefined {
  const lower = name.toLowerCase();
  if (LANGUAGE_BY_NAME[lower]) return LANGUAGE_BY_NAME[lower];
  const dot = lower.lastIndexOf(".");
  return dot >= 0 ? LANGUAGE_BY_EXTENSION[lower.slice(dot + 1)] : undefined;
}

export interface IconQuery {
  /** The file or folder name (a path works too: the last segment is used). */
  name: string;
  folder?: boolean;
  expanded?: boolean;
  /** The workspace root folder. */
  root?: boolean;
  /** Use the theme's `light` overrides (light colour theme). */
  light?: boolean;
  highContrast?: boolean;
  /** Overrides `languageIdForFile`. */
  languageId?: string;
}

const lookup = (map: Record<string, string> | undefined, key: string) =>
  map ? (map[key] ?? map[key.toLowerCase()]) : undefined;

/**
 * The icon definition id for a file or folder, like VS Code: file name, then extensions from the
 * longest (`spec.ts`) to the shortest (`ts`), then language, then the default; folders by name, then
 * the default. Light / high-contrast overrides win over the base associations at every step.
 */
export function resolveFileIcon(theme: FileIconTheme, query: IconQuery): string | undefined {
  const name = query.name.split(/[\\/]/).filter(Boolean).pop() ?? query.name;
  const layers: IconAssociations[] = [
    ...(query.highContrast && theme.highContrast ? [theme.highContrast] : []),
    ...(query.light && theme.light ? [theme.light] : []),
    theme,
  ];
  const first = (pick: (a: IconAssociations) => string | undefined) => {
    for (const layer of layers) {
      const id = pick(layer);
      if (id && theme.iconDefinitions[id]) return id;
    }
    return undefined;
  };
  if (query.folder) {
    const open = query.expanded;
    return (
      (query.root
        ? first((a) => lookup(open ? a.rootFolderNamesExpanded : a.rootFolderNames, name))
        : undefined) ??
      first((a) => lookup(open ? a.folderNamesExpanded : a.folderNames, name)) ??
      (query.root ? first((a) => (open ? a.rootFolderExpanded : a.rootFolder)) : undefined) ??
      first((a) => (open ? (a.folderExpanded ?? a.folder) : a.folder))
    );
  }
  const byName = first((a) => lookup(a.fileNames, name));
  if (byName) return byName;
  const lower = name.toLowerCase();
  for (let i = lower.indexOf("."); i >= 0; i = lower.indexOf(".", i + 1)) {
    const extension = lower.slice(i + 1);
    if (!extension) break;
    const id = first((a) => lookup(a.fileExtensions, extension));
    if (id) return id;
  }
  const language = query.languageId ?? languageIdForFile(name);
  return (language ? first((a) => lookup(a.languageIds, language)) : undefined) ?? first((a) => a.file);
}
