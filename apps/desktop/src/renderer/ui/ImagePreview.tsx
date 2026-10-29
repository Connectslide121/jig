import { Maximize2, Minimize2 } from "lucide-react";
import { useState } from "react";
import { cn } from "./cn";

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

/**
 * An image on a checkerboard (so transparency shows), scaled to fit; click the size button to see it at
 * 100%. The footer shows its pixel size and file size.
 */
export function ImagePreview({ src, alt = "", bytes, compact, className, onClick }: ImagePreviewProps) {
  const [natural, setNatural] = useState<{ w: number; h: number }>();
  const [actual, setActual] = useState(false);
  const [failed, setFailed] = useState(false);
  const image = failed ? (
    <div className="p-4 text-sm text-muted">The image can't be shown.</div>
  ) : (
    <img
      src={src}
      alt={alt}
      draggable={false}
      onClick={onClick}
      onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
      onError={() => setFailed(true)}
      className={cn(
        "block",
        compact
          ? "max-h-40 max-w-full object-contain"
          : actual
            ? "max-w-none"
            : "max-h-full max-w-full object-contain",
        onClick && "cursor-pointer",
      )}
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
  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)} data-testid="image-preview">
      <div
        className={cn(
          "jig-checkerboard min-h-0 flex-1 overflow-auto",
          !actual && "flex items-center justify-center p-4",
        )}
      >
        {image}
      </div>
      <div className="flex h-8 shrink-0 items-center gap-3 border-t border-line px-3 text-xs text-muted">
        {natural && (
          <span data-testid="image-size">
            {natural.w} × {natural.h} px
          </span>
        )}
        {bytes !== undefined && <span>{formatBytes(bytes)}</span>}
        <div className="flex-1" />
        <button
          type="button"
          className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 hover:bg-hover hover:text-fg"
          onClick={() => setActual(!actual)}
        >
          {actual ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          {actual ? "Fit" : "100%"}
        </button>
      </div>
    </div>
  );
}
