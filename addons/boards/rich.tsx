import type { AddonUiContext } from "@jig/sdk";
import { Button, cn, Dialog, IconButton, ImagePreview, Spinner, sanitizeHtml } from "@jig/sdk/ui";
import { Bold, ExternalLink, Italic, Link2, List, ListOrdered, Underline } from "lucide-react";
import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { attachmentId, attachmentName, type Board, downloadUrl } from "./lib/boards";

/**
 * Azure DevOps rich text in Jig (D-342): sanitized before it reaches the DOM, its attachment images
 * fetched by the host with your az login (they need a sign-in) and shown as data URLs, the original
 * URL kept in `data-jig-src` so saving puts it back.
 */

/** Images already fetched, by organisation + URL (the latest few; a data URL can be large). */
const images = new Map<string, Promise<string | undefined>>();
const KEEP_IMAGES = 60;

/** Waits until the image is decoded, so it shows at its size at once. */
async function decoded(src: string): Promise<string> {
  const img = new Image();
  img.src = src;
  await img.decode().catch(() => undefined);
  return src;
}

/** An attachment image as a data URL (undefined when it couldn't be fetched or isn't an image). */
export function attachmentImage(ctx: AddonUiContext, board: Board, url: string): Promise<string | undefined> {
  const key = `${board.org.toLowerCase()}|${url}`;
  let hit = images.get(key);
  if (!hit) {
    hit = ctx.host
      .call<{ dataUrl: string }>("attachment", { board, url, name: attachmentName(url) })
      .then((r) => decoded(r.dataUrl))
      .catch(() => {
        images.delete(key);
        return undefined;
      });
    images.set(key, hit);
    while (images.size > KEEP_IMAGES) images.delete(images.keys().next().value as string);
  }
  return hit;
}

const parse = (html: string) => new DOMParser().parseFromString(sanitizeHtml(html), "text/html").body;

/** The attachment images in these HTML texts. */
function attachmentSources(htmls: string[], org: string): string[] {
  const out = new Set<string>();
  for (const html of htmls) {
    if (!/<img\b/i.test(html)) continue;
    for (const img of parse(html).querySelectorAll("img")) {
      const src = img.getAttribute("src") ?? "";
      if (attachmentId(src, org)) out.add(src);
    }
  }
  return [...out];
}

/**
 * Fetches every attachment image in `htmls` and answers `ready` once all of them are in (or failed),
 * so a rich section shows complete and nothing moves as its images arrive. Images stay known across
 * reloads (a new comment doesn't bring the spinner back).
 */
export function useRichImages(ctx: AddonUiContext, board: Board, htmls: string[]) {
  const key = htmls.join("\u0000");
  const sources = useMemo(() => attachmentSources(htmls, board.org), [key, board.org]);
  const [known, setKnown] = useState<Map<string, string | undefined>>(() => new Map());
  useEffect(() => {
    const missing = sources.filter((s) => !known.has(s));
    if (!missing.length) return;
    let live = true;
    void Promise.all(missing.map((s) => attachmentImage(ctx, board, s))).then((found) => {
      if (!live) return;
      setKnown((prev) => {
        const next = new Map(prev);
        for (const [i, s] of missing.entries()) next.set(s, found[i]);
        return next;
      });
    });
    return () => {
      live = false;
    };
  }, [sources, known, ctx, board]);
  const ready = sources.every((s) => known.has(s));
  /** HTML ready for the DOM: sanitized, attachment images as data URLs (missing ones as a dashed box). */
  const prepare = (html: string): string => {
    if (!html) return "";
    const body = parse(html);
    for (const img of body.querySelectorAll("img")) {
      const src = img.getAttribute("src") ?? "";
      if (!attachmentId(src, board.org)) continue;
      img.setAttribute("data-jig-src", src);
      const data = known.get(src);
      if (data) img.setAttribute("src", data);
      else {
        img.removeAttribute("src");
        img.setAttribute("data-jig-missing", "");
        img.setAttribute("alt", `${attachmentName(src)} (couldn't be loaded)`);
      }
    }
    return body.innerHTML;
  };
  return { ready, prepare };
}

/**
 * An editor's HTML as Azure DevOps should keep it: images back on their attachment URLs, Jig's marks
 * gone, sanitized; an editor holding nothing but a line break is empty.
 */
export function restoreSources(html: string): string {
  const body = parse(html);
  for (const img of body.querySelectorAll("img[data-jig-src]")) {
    img.setAttribute("src", img.getAttribute("data-jig-src") ?? "");
    img.removeAttribute("data-jig-src");
    if (img.hasAttribute("data-jig-missing")) {
      img.removeAttribute("data-jig-missing");
      img.removeAttribute("alt");
    }
  }
  return (body.textContent ?? "").trim() || body.querySelector("img") ? body.innerHTML : "";
}

/** What happens on a click in rich text: an image opens large, a link in the browser. */
export interface RichHandlers {
  onImage: (image: { src: string; original?: string; name: string }) => void;
  onLink: (href: string) => void;
}

function clickRich(e: React.MouseEvent, handlers: RichHandlers, editing: boolean) {
  const target = e.target as HTMLElement;
  if (target instanceof HTMLImageElement) {
    const original = target.getAttribute("data-jig-src") ?? undefined;
    if (!target.getAttribute("src")) return;
    e.preventDefault();
    handlers.onImage({
      src: target.src,
      original,
      name: original ? attachmentName(original) : target.alt || "Image",
    });
    return;
  }
  const link = target.closest("a");
  if (!link) return;
  // Never navigate Jig's window; while editing a link opens with Ctrl/Cmd, like a word processor.
  e.preventDefault();
  const href = link.getAttribute("href") ?? "";
  if ((!editing || e.ctrlKey || e.metaKey) && /^(https?:|mailto:)/i.test(href)) handlers.onLink(href);
}

/** Read-only rich text (a comment). */
export function RichView({ html, handlers }: { html: string; handlers: RichHandlers }) {
  return (
    <div
      className="jig-rich jig-markdown selectable min-w-0 text-sm break-words"
      onClick={(e) => clickRich(e, handlers, false)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Formatting through the browser's editing commands; the selection stays (buttons don't take focus). */
const FORMATS = [
  { icon: Bold, label: "Bold (Ctrl+B)", command: "bold" },
  { icon: Italic, label: "Italic (Ctrl+I)", command: "italic" },
  { icon: Underline, label: "Underline (Ctrl+U)", command: "underline" },
  { icon: List, label: "Bulleted list", command: "insertUnorderedList" },
  { icon: ListOrdered, label: "Numbered list", command: "insertOrderedList" },
] as const;

/**
 * A rich-text field you edit in place, keeping its images and formatting (D-342). Uncontrolled: the
 * HTML is set when it loads; `onDirty` fires on the first change, and the dialog reads the editor's
 * HTML when you save (`restoreSources`). Images can't be pasted yet (`onRefuse` says so).
 */
export function RichEditor({
  label,
  html,
  editorRef,
  onDirty,
  onRefuse,
  handlers,
  ctx,
  testId,
}: {
  label: string;
  html: string;
  editorRef: RefObject<HTMLDivElement | null>;
  onDirty: () => void;
  onRefuse: (message: string) => void;
  handlers: RichHandlers;
  ctx: AddonUiContext;
  testId?: string;
}) {
  const dirty = useRef(false);
  useLayoutEffect(() => {
    // A reload with other text (changed elsewhere) shows it, unless you've started editing.
    if (editorRef.current && !dirty.current) editorRef.current.innerHTML = html;
  }, [html, editorRef]);
  const changed = () => {
    if (dirty.current) return;
    dirty.current = true;
    onDirty();
  };
  const command = (name: string, value?: string) => {
    const el = editorRef.current;
    if (!el) return;
    if (!el.contains(document.getSelection()?.anchorNode ?? null)) el.focus();
    document.execCommand(name, false, value);
    changed();
  };
  const link = async () => {
    const selection = document.getSelection();
    const range =
      selection?.rangeCount && editorRef.current?.contains(selection.anchorNode)
        ? selection.getRangeAt(0).cloneRange()
        : undefined;
    const url = (
      await ctx.prompt({ title: "Link to", initial: "https://", confirmLabel: "Add link" })
    )?.trim();
    if (!url || !/^(https?:|mailto:)/i.test(url)) return;
    editorRef.current?.focus();
    if (range) {
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    if (range && !range.collapsed) command("createLink", url);
    else
      command(
        "insertHTML",
        sanitizeHtml(`<a href="${url.replace(/"/g, "&quot;")}">${url.replace(/</g, "&lt;")}</a>`),
      );
  };
  const refuseFiles = (files: FileList | undefined | null, e: React.SyntheticEvent) => {
    if (!files?.length) return false;
    e.preventDefault();
    onRefuse("Jig can't add images or files to a card yet: add them in Azure DevOps.");
    return true;
  };
  return (
    <section className="group">
      <div className="mb-1 flex h-7 items-center gap-0.5">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted">{label}</span>
        {/* Always there, visible while you edit this field: nothing moves when it shows. */}
        <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100">
          {FORMATS.map((f) => (
            <IconButton
              key={f.command}
              icon={f.icon}
              label={f.label}
              size="sm"
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => command(f.command)}
            />
          ))}
          <IconButton
            icon={Link2}
            label="Link"
            size="sm"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void link()}
          />
        </span>
      </div>
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline
        aria-label={label}
        tabIndex={0}
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Nothing yet"
        data-testid={testId}
        className={cn(
          "jig-rich jig-markdown selectable min-h-16 rounded-md border border-line bg-surface px-2.5 py-2 text-sm break-words",
          "transition-colors focus:border-focus",
        )}
        onInput={changed}
        onClick={(e) => clickRich(e, handlers, true)}
        onPaste={(e) => {
          if (refuseFiles(e.clipboardData.files, e)) return;
          const pasted = e.clipboardData.getData("text/html");
          if (!pasted) return;
          // Pasted HTML is sanitized first; images in it (data or other sites) aren't taken.
          e.preventDefault();
          const body = parse(pasted);
          for (const img of body.querySelectorAll("img")) img.remove();
          document.execCommand("insertHTML", false, body.innerHTML);
          changed();
        }}
        onDrop={(e) => refuseFiles(e.dataTransfer.files, e)}
      />
    </section>
  );
}

/** An image opened large (from rich text or the attachments), with a way to it in the browser. */
export function ImageDialog({
  ctx,
  board,
  image,
  onClose,
}: {
  ctx: AddonUiContext;
  board: Board;
  image: { src?: string; original?: string; name: string; bytes?: number };
  onClose: () => void;
}) {
  const [src, setSrc] = useState(image.src);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (image.src || !image.original) return;
    let live = true;
    void attachmentImage(ctx, board, image.original).then((s) => {
      if (!live) return;
      if (s) setSrc(s);
      else setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [ctx, board, image]);
  const original = image.original;
  return (
    <Dialog
      open
      onClose={onClose}
      width="xl"
      title={image.name}
      testId="board-image"
      footer={
        <>
          {original ? (
            <Button
              variant="ghost"
              icon={ExternalLink}
              className="mr-auto"
              onClick={() => ctx.openExternal(downloadUrl({ url: original, name: image.name }))}
            >
              Open in browser
            </Button>
          ) : null}
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      <div className="h-136">
        {src ? (
          <ImagePreview src={src} alt={image.name} bytes={image.bytes} />
        ) : failed ? (
          <p className="p-4 text-sm text-muted">
            The image couldn't be loaded. Open it in the browser instead.
          </p>
        ) : (
          <Spinner center />
        )}
      </div>
    </Dialog>
  );
}
