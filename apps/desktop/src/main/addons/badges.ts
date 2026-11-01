/**
 * Add-on view badges (D-215): a small count or word on a view's icon. Keyed by the full view id
 * (`addon.<id>.<view>`); an add-on may only badge its own views.
 */

/** The text shown for a badge value: numbers above 99 as "99+", words cut to 4 characters; nothing clears it. */
export function badgeText(value: unknown): string | undefined {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return undefined;
    return value > 99 ? "99+" : String(Math.floor(value));
  }
  if (typeof value === "string") {
    const text = value.trim();
    return text ? text.slice(0, 4) : undefined;
  }
  return undefined;
}

/** The full view id for an add-on's view (`list` or `addon.<id>.list`); undefined if it isn't its own. */
export function ownViewId(addonId: string, view: string, views: string[]): string | undefined {
  const short = view.startsWith(`addon.${addonId}.`) ? view.slice(`addon.${addonId}.`.length) : view;
  return views.includes(short) ? `addon.${addonId}.${short}` : undefined;
}

export class Badges {
  private values = new Map<string, string>();

  constructor(private readonly changed: (all: Record<string, string>) => void) {}

  set(viewId: string, value: unknown): void {
    const text = badgeText(value);
    if (text === this.values.get(viewId)) return;
    if (text) this.values.set(viewId, text);
    else this.values.delete(viewId);
    this.changed(this.all());
  }

  /** Clears an add-on's badges (it was turned off, reloaded or removed). */
  clear(addonId: string): void {
    let any = false;
    for (const key of [...this.values.keys()])
      if (key.startsWith(`addon.${addonId}.`)) {
        this.values.delete(key);
        any = true;
      }
    if (any) this.changed(this.all());
  }

  all(): Record<string, string> {
    return Object.fromEntries(this.values);
  }
}
