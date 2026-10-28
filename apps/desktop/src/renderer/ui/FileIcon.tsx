import { resolveFileIcon } from "@jig/themes";
import {
  File,
  FileArchive,
  FileCode,
  FileImage,
  FileJson,
  FileTerminal,
  FileText,
  Folder,
  FolderOpen,
  type LucideIcon,
} from "lucide-react";
import { memo } from "react";
import { isImagePath } from "../../shared/files";
import { useAppearance } from "../stores/appearance";
import { fontFamily, useFileIcons } from "../stores/fileIcons";
import { cn } from "./cn";

const CODE =
  /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|cs|fs|vb|py|go|rs|rb|php|java|kt|swift|c|h|cpp|hpp|cc|vue|svelte|dart|lua|html|htm|css|scss|less|sql|graphql|razor|cshtml|xml|csproj|sln|bicep|tf)$/i;

/** Jig's own icons, by kind of file. */
function fallbackIcon(name: string, folder?: boolean, expanded?: boolean): LucideIcon {
  if (folder) return expanded ? FolderOpen : Folder;
  if (isImagePath(name)) return FileImage;
  if (/\.(json|jsonc)$/i.test(name)) return FileJson;
  if (/\.(sh|bash|zsh|ps1|psm1|bat|cmd)$/i.test(name)) return FileTerminal;
  if (/\.(zip|gz|tgz|7z|rar|tar)$/i.test(name)) return FileArchive;
  if (CODE.test(name)) return FileCode;
  if (/\.(md|markdown|txt|log|rst)$/i.test(name) || /^readme/i.test(name)) return FileText;
  return File;
}

export interface FileIconProps {
  /** A file or folder name, or a path (its last segment counts). */
  path: string;
  folder?: boolean;
  expanded?: boolean;
  className?: string;
}

/**
 * The icon of a file or folder in the chosen file icon theme (Settings → Appearance → File icons; e.g.
 * Material Icon Theme from your VS Code), or Jig's own icon when there is none. Size it like a lucide
 * icon: `className="size-4"`.
 */
export const FileIcon = memo(function FileIcon({ path, folder, expanded, className }: FileIconProps) {
  const data = useFileIcons((s) => s.data);
  const light = useAppearance((s) => s.theme?.appearance === "light");
  const name = path.split(/[\\/]/).filter(Boolean).pop() ?? path;
  const id = data ? resolveFileIcon(data.theme, { name, folder, expanded, light }) : undefined;
  const def = id ? data?.theme.iconDefinitions[id] : undefined;
  if (def?.iconPath)
    return (
      <img
        src={def.iconPath}
        alt=""
        draggable={false}
        className={cn("size-4 shrink-0 object-contain", className)}
        data-file-icon={id}
      />
    );
  if (def?.fontCharacter && data) {
    const fontId = def.fontId ?? data.theme.fonts?.[0]?.id ?? "";
    return (
      <span
        aria-hidden
        className={cn("inline-flex size-4 shrink-0 items-center justify-center leading-none", className)}
        style={{
          fontFamily: `"${fontFamily(data.id, fontId)}"`,
          color: def.fontColor,
          fontSize: def.fontSize ?? data.theme.fonts?.find((f) => f.id === fontId)?.size ?? "1.15em",
        }}
        data-file-icon={id}
      >
        {def.fontCharacter.startsWith("\\")
          ? String.fromCodePoint(Number.parseInt(def.fontCharacter.slice(1), 16))
          : def.fontCharacter}
      </span>
    );
  }
  const Icon = fallbackIcon(name, folder, expanded);
  return <Icon className={cn("size-4 shrink-0 text-muted", className)} data-file-icon="jig" />;
});
