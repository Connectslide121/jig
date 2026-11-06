import { useEffect, useRef, useState } from "react";
import { call } from "../../lib/host";
import { cn } from "../../ui";

/** The width a page is laid out at before it is scaled down into the thumbnail. */
const PAGE_WIDTH = 1100;

/**
 * A small picture of an HTML page: the page itself in a sandboxed frame (no scripts, never same-origin,
 * the same as the Preview tab), laid out at desktop width and scaled to fit the width it is given, cut
 * off at `height`. It takes no clicks (put the click on what holds it) and keeps its size while it loads
 * (D-405).
 */
export function HtmlThumbnail({
  path,
  height = 168,
  className,
}: {
  /** The page file; empty while it is still being looked up (the box keeps its size). */
  path?: string;
  height?: number;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string>();
  const [width, setWidth] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(false);
    setUrl(undefined);
    if (!path) return;
    call("files.preview", { path })
      .then((p) => live && setUrl(p.url))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [path]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const scale = width / PAGE_WIDTH;
  return (
    <div
      ref={box}
      className={cn("relative w-full overflow-hidden bg-surface", className)}
      style={{ height }}
      data-testid="html-thumbnail"
    >
      {url && width > 0 && !failed && (
        <iframe
          title="Page preview"
          src={url}
          sandbox=""
          tabIndex={-1}
          aria-hidden
          loading="lazy"
          className="pointer-events-none absolute top-0 left-0 border-0"
          style={{
            width: PAGE_WIDTH,
            height: height / scale,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        />
      )}
    </div>
  );
}
