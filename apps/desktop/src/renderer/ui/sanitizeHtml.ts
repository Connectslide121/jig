import DOMPurify from "dompurify";

/**
 * Rich text from elsewhere (an Azure DevOps description, a pasted page) made safe to put into the DOM:
 * no scripts, event handlers, `javascript:` links, frames, forms or styles sheets. Inline `style`
 * attributes stay, so saving the text back loses no formatting; show it inside `.jig-rich`, which
 * draws it in the theme's colours. Images keep `data:` and `https:` sources.
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: [
      "style",
      "form",
      "input",
      "button",
      "textarea",
      "select",
      "option",
      "iframe",
      "object",
      "embed",
    ],
    FORBID_ATTR: ["srcset"],
  });
}
