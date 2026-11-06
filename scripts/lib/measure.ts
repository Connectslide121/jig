// Functions that run inside the demo page (passed to page.evaluate): they only read the DOM.
import type { MeasuredList } from "./checks.ts";

/** Starts collecting layout shifts as soon as the page loads (an init script). */
export function observeShifts() {
  const w = window as unknown as { __cls: number };
  w.__cls = 0;
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
        if (!e.hadRecentInput) w.__cls += e.value;
      }
    }).observe({ type: "layout-shift", buffered: true } as PerformanceObserverInit);
  } catch {
    // no layout-shift support: nothing to measure
  }
}

/** Every list-like container's rows, as column boxes. */
export function measureLists(): MeasuredList[] {
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const describe = (el: Element) => {
    const demo = el.closest("[data-demo]")?.getAttribute("data-demo");
    const label = el.getAttribute("aria-label");
    return demo ? `[data-demo=${demo}]` : label ? `"${label}"` : el.tagName.toLowerCase();
  };
  // A row's columns: the children of its single horizontal box (a row that is one button or link
  // holding the columns counts through it).
  const columns = (row: Element): Element[] => {
    let box: Element = row;
    while (box.children.length === 1 && box.firstElementChild) box = box.firstElementChild;
    const kids = [...box.children].filter(visible);
    if (box.tagName === "TR") return kids;
    const style = getComputedStyle(box);
    if (!style.display.includes("flex") || style.flexDirection.startsWith("column")) return [];
    return kids;
  };
  const out: MeasuredList[] = [];
  for (const list of document.querySelectorAll("tbody, ol, ul, [role=list]")) {
    if (!visible(list) || list.closest("[data-kit], [role=menu], [role=listbox]")) continue;
    const rows = [...list.children]
      .filter(visible)
      .map((row) => columns(row).map((c) => {
        const r = c.getBoundingClientRect();
        return { left: Math.round(r.left), right: Math.round(r.right) };
      }));
    out.push({ where: describe(list), rows });
  }
  return out;
}

/** What the template must show, and the demo's own description. */
export function readTemplate() {
  const w = window as unknown as { __demo?: { name: string; version: number; routes: string[]; story: { route: string; target?: string }[]; allowDomains?: string[] } };
  return {
    demo: w.__demo ?? null,
    banner: !!document.querySelector("[data-kit=banner]"),
    version: document.querySelector("[data-kit=version]")?.textContent?.match(/v\d+/)?.[0] ?? "",
    story: !!document.querySelector("[data-kit=story]"),
    present: !!document.querySelector("[data-kit=present]"),
  };
}

/** The page's visible text plus link targets and input values (where real data could hide). */
export function readText() {
  const extra = [...document.querySelectorAll("a[href^='mailto:'], a[href^='tel:'], input, textarea")]
    .map((el) => (el instanceof HTMLAnchorElement ? el.href : (el as HTMLInputElement).value))
    .join("\n");
  return `${document.body.innerText}\n${extra}`;
}

export function horizontalOverflow() {
  const el = document.scrollingElement ?? document.documentElement;
  return el.scrollWidth - el.clientWidth;
}
