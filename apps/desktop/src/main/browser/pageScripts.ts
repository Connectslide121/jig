/**
 * Scripts run inside the page (as strings, through executeJavaScript). `snapshot` numbers the
 * interactive elements (data-jig-ref) so Claude can name them; `locate` finds one and scrolls it into
 * view, returning its centre.
 */
export const SNAPSHOT_SCRIPT = `(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const label = (el) =>
    (el.getAttribute("aria-label") || el.innerText || el.value || el.getAttribute("placeholder") ||
      el.getAttribute("title") || el.getAttribute("alt") || el.getAttribute("name") || "").trim().replace(/\\s+/g, " ").slice(0, 80);
  const selector = 'a[href], button, input, select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="menuitem"], [contenteditable="true"], [onclick]';
  document.querySelectorAll("[data-jig-ref]").forEach((el) => el.removeAttribute("data-jig-ref"));
  const items = [];
  let n = 0;
  for (const el of document.querySelectorAll(selector)) {
    if (!visible(el) || n >= 200) continue;
    n++;
    el.setAttribute("data-jig-ref", String(n));
    const tag = el.tagName.toLowerCase();
    const type = el.getAttribute("type");
    const role = el.getAttribute("role");
    const kind = role || (tag === "input" ? "input" + (type ? "[" + type + "]" : "") : tag === "a" ? "link" : tag);
    const extra = [];
    if (tag === "input" || tag === "textarea" || tag === "select") extra.push("value=" + JSON.stringify(String(el.value).slice(0, 60)));
    if (el.disabled) extra.push("disabled");
    if (el.checked) extra.push("checked");
    if (tag === "a") extra.push("href=" + (el.getAttribute("href") || "").slice(0, 80));
    items.push("[" + n + "] " + kind + ' "' + label(el) + '"' + (extra.length ? " " + extra.join(" ") : ""));
  }
  const text = (document.body ? document.body.innerText : "").replace(/\\n{3,}/g, "\\n\\n").trim();
  return { title: document.title, url: location.href, text: text.slice(0, 8000), truncated: text.length > 8000, items };
})()`;

/** A script that finds an element by ref, CSS selector or visible text and returns its centre. */
export function locateScript(target: { ref?: number; selector?: string; text?: string }): string {
  return `(() => {
  const t = ${JSON.stringify(target)};
  let el = null;
  if (t.ref) el = document.querySelector('[data-jig-ref="' + t.ref + '"]');
  if (!el && t.selector) el = document.querySelector(t.selector);
  if (!el && t.text) {
    const want = t.text.trim().toLowerCase();
    const candidates = [...document.querySelectorAll('a, button, [role="button"], [role="link"], [role="tab"], label, summary, input[type="submit"], input[type="button"], [onclick]')];
    el = candidates.find((c) => (c.innerText || c.value || "").trim().toLowerCase() === want)
      || candidates.find((c) => (c.innerText || c.value || "").trim().toLowerCase().includes(want));
  }
  if (!el) return null;
  el.scrollIntoView({ block: "center", inline: "center" });
  const r = el.getBoundingClientRect();
  const label = (el.innerText || el.value || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 60);
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), label, tag: el.tagName.toLowerCase() };
})()`;
}

/** Focuses an element (and selects its content when `clear`), for typing. */
export function focusScript(target: { ref?: number; selector?: string }, clear: boolean): string {
  return `(() => {
  const t = ${JSON.stringify(target)};
  const el = (t.ref && document.querySelector('[data-jig-ref="' + t.ref + '"]')) || (t.selector && document.querySelector(t.selector));
  if (!el) return false;
  el.scrollIntoView({ block: "center" });
  el.focus();
  if (${clear} && "select" in el) el.select();
  else if (${clear} && el.isContentEditable) document.execCommand("selectAll");
  return true;
})()`;
}
