import type { ShellChoices } from "../../../shared/terminals";
import type { MenuEntry } from "../../ui/Menu";

/**
 * One menu row per installed shell: the name, its path muted, and a "Default" mark in a column at the
 * far right. Pure, so it is unit-tested.
 */
export function shellEntries(
  choices: ShellChoices | undefined,
  onPick: (path: string) => void,
  checkedPath?: string,
): MenuEntry[] {
  if (!choices) return [{ label: "Looking for shells…", disabled: true }];
  const isDefault = (path: string) => base(path) === base(choices.defaultShell.path);
  return choices.options.map((o) => ({
    label: o.name,
    detail: o.path,
    badge: isDefault(o.path) ? "Default" : undefined,
    checked: checkedPath !== undefined && checkedPath === o.path,
    onSelect: () => onPick(o.path),
  }));
}

const base = (p: string) => (p.split(/[\\/]/).pop() ?? p).toLowerCase();
