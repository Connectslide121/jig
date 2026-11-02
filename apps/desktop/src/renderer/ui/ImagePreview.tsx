import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { IconButton } from "./Button";
import { cn } from "./cn";
import { openMenuAt } from "./Menu";

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export interface ImagePreviewProps {
  src: string;
  alt?: string;
  /** File size, shown in the footer. */
  bytes?: number;
  /** A small thumbnail (chat cards): no footer, limited height. */
  compact?: boolean;
  className?: string;
  onClick?: () => void;
}

const ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8];

/** Shared image viewer for files, previews and Git comparisons. Thumbnails stay compact. */
export function ImagePreview(props: ImagePreviewProps) {
  return <ImagePreviewContent key={props.src} {...props} />;
}

function ImagePreviewContent({ src, alt = "", bytes, compact, className, onClick }: ImagePreviewProps) {
  const [natural, setNatural] = useState<{ w: number; h: number }>();
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [failed, setFailed] = useState(false);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const scroller = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const anchor = useRef<{ x: number; y: number } | undefined>(undefined);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const resize = () => setViewport({ w: el.clientWidth, h: el.clientHeight });
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    return () => observer.disconnect();
  }, []);
  const fit = natural
    ? Math.max(0.001, Math.min(1, (viewport.w - 32) / natural.w, (viewport.h - 32) / natural.h))
    : 1;
  const scale = zoom === "fit" ? fit : zoom;
  const width = (natural?.w ?? 0) * scale;
  const height = (natural?.h ?? 0) * scale;
  const canvasWidth = Math.max(viewport.w, width);
  const canvasHeight = Math.max(viewport.h, height);
  const changeZoom = useCallback((next: number | "fit") => {
    const el = scroller.current;
    const img = imageRef.current;
    if (el && img) {
      const box = el.getBoundingClientRect();
      const picture = img.getBoundingClientRect();
      anchor.current = {
        x: Math.max(0, Math.min(1, (box.left + el.clientWidth / 2 - picture.left) / picture.width)),
        y: Math.max(0, Math.min(1, (box.top + el.clientHeight / 2 - picture.top) / picture.height)),
      };
    }
    setZoom(next);
  }, []);
  useLayoutEffect(() => {
    const el = scroller.current;
    const at = anchor.current;
    if (!el || !at) return;
    el.scrollLeft = (canvasWidth - width) / 2 + at.x * width - el.clientWidth / 2;
    el.scrollTop = (canvasHeight - height) / 2 + at.y * height - el.clientHeight / 2;
    anchor.current = undefined;
  }, [canvasWidth, canvasHeight, width, height]);
  const step = useCallback(
    (direction: number) => {
      if (direction < 0 && scale <= 0.1) return;
      const next =
        direction > 0
          ? (ZOOM_STEPS.find((value) => value > scale + 0.001) ?? 8)
          : (ZOOM_STEPS.findLast((value) => value < scale - 0.001) ?? 0.1);
      changeZoom(next);
    },
    [scale, changeZoom],
  );
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      if (event.deltaY) step(event.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [step]);
  const image = failed ? (
    <div className="p-4 text-sm text-muted">The image can't be shown.</div>
  ) : (
    <img
      ref={imageRef}
      src={src}
      alt={alt}
      draggable={false}
      onClick={onClick}
      onLoad={(event) =>
        setNatural({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight })
      }
      onError={() => setFailed(true)}
      className={cn(
        "block",
        compact ? "max-h-40 max-w-full object-contain" : "max-w-none shrink-0",
        onClick && "cursor-pointer",
      )}
      style={compact || !natural ? undefined : { width, height }}
      data-testid="image-preview-img"
    />
  );
  if (compact)
    return (
      <div
        className={cn("jig-checkerboard inline-flex rounded-md border border-line", className)}
        data-testid="image-thumb"
      >
        {image}
      </div>
    );
  const disabled = !natural || failed;
  return (
    <div className={cn("flex h-full min-h-0 min-w-0 flex-col", className)} data-testid="image-preview">
      <div
        ref={scroller}
        className="jig-checkerboard min-h-0 flex-1 overflow-auto"
        style={{ scrollbarGutter: "stable" }}
        data-testid="image-viewport"
      >
        <div
          className="flex items-center justify-center"
          style={{ width: canvasWidth, height: canvasHeight }}
        >
          {image}
        </div>
      </div>
      <div
        className="flex h-8 shrink-0 items-center gap-1 border-t border-line px-2 text-xs text-muted"
        data-testid="image-toolbar"
      >
        <span className="min-w-0 flex-1 truncate">
          <span data-testid="image-size">{natural ? `${natural.w} × ${natural.h} px` : ""}</span>
          {bytes !== undefined ? ` · ${formatBytes(bytes)}` : ""}
        </span>
        <IconButton
          size="sm"
          icon={ZoomOut}
          label="Zoom out"
          disabled={disabled || scale <= 0.1}
          onClick={() => step(-1)}
        />
        <button
          type="button"
          className="h-6 w-16 shrink-0 rounded-sm text-center tabular-nums hover:bg-hover hover:text-fg disabled:opacity-50"
          disabled={disabled}
          aria-label="Image zoom"
          title={`Zoom: ${Math.round(scale * 100)}% (Ctrl/Cmd + scroll to zoom)`}
          data-testid="image-zoom"
          onClick={(event) =>
            openMenuAt(
              event.currentTarget,
              [
                { label: "Fit", checked: zoom === "fit", onSelect: () => changeZoom("fit") },
                ...ZOOM_STEPS.map((value) => ({
                  label: `${value * 100}%`,
                  checked: zoom === value,
                  onSelect: () => changeZoom(value),
                })),
              ],
              true,
            )
          }
        >
          {zoom === "fit" ? "Fit" : `${Math.round(zoom * 100)}%`}
        </button>
        <IconButton
          size="sm"
          icon={ZoomIn}
          label="Zoom in"
          disabled={disabled || scale >= 8}
          onClick={() => step(1)}
        />
        <IconButton
          size="sm"
          icon={Maximize2}
          label="Fit image"
          disabled={disabled}
          onClick={() => changeZoom("fit")}
        />
        <button
          type="button"
          className="h-6 w-12 shrink-0 rounded-sm tabular-nums hover:bg-hover hover:text-fg disabled:opacity-50"
          disabled={disabled}
          onClick={() => changeZoom(1)}
          aria-label="Actual size"
        >
          100%
        </button>
      </div>
    </div>
  );
}
