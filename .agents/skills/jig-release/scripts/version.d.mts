export function readVersions(root: string): { current: string; files: string[] };

export function setVersion(
  root: string,
  next: string,
  options?: { dryRun?: boolean },
): { from: string; to: string; dryRun: boolean; files: string[] };
