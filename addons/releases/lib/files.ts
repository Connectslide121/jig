/**
 * Where a repository keeps its version, and changing it (pure, tested): .csproj / Directory.Build.props
 * (`<Version>`, `<VersionPrefix>`), package.json (`"version"`), a VERSION file.
 */
export type VersionFileKind = "msbuild" | "package.json" | "plain";

export function versionFileKind(path: string): VersionFileKind | undefined {
  const name = path.split(/[\\/]/).pop()!.toLowerCase();
  if (name.endsWith(".csproj") || name.endsWith(".fsproj") || name === "directory.build.props")
    return "msbuild";
  if (name === "package.json") return "package.json";
  if (name === "version" || name === "version.txt") return "plain";
  return undefined;
}

export function readVersion(kind: VersionFileKind, text: string): string | undefined {
  if (kind === "msbuild") return /<(Version|VersionPrefix)>\s*([^<\s]+)\s*<\/\1>/.exec(text)?.[2];
  if (kind === "package.json") {
    try {
      const v = JSON.parse(text).version;
      return typeof v === "string" ? v : undefined;
    } catch {
      return undefined;
    }
  }
  return text.trim().split(/\s/)[0] || undefined;
}

/** The file with its version set to `version` (formatting kept; an msbuild file without one gets `<Version>`). */
export function writeVersion(kind: VersionFileKind, text: string, version: string): string {
  if (kind === "msbuild") {
    if (/<(Version|VersionPrefix)>[^<]*<\/\1>/.test(text))
      return text.replace(/<(Version|VersionPrefix)>[^<]*<\/\1>/, `<$1>${version}</$1>`);
    return text.replace(/<PropertyGroup>/, `<PropertyGroup>\n    <Version>${version}</Version>`);
  }
  if (kind === "package.json") return text.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`);
  return `${version}\n`;
}
