import { X } from "lucide-react";
import type { ChatImage } from "../../../shared/engine";
import { call } from "../../lib/host";
import { cn, IconButton, Spinner } from "../../ui";
import { openImage, useImageFile } from "../files";

function Thumb({ image, onRemove }: { image: ChatImage; onRemove?: () => void }) {
  const { data, error } = useImageFile(image.path);
  return (
    <div className="group relative" data-testid="chat-image">
      <button
        type="button"
        title="Open the image"
        onClick={() => openImage(image.path)}
        className="jig-checkerboard flex size-16 items-center justify-center overflow-hidden rounded-md border border-line"
      >
        {data ? (
          <img src={data.dataUrl} alt="" draggable={false} className="max-h-full max-w-full object-contain" />
        ) : error ? (
          <span className="px-1 text-2xs text-danger">missing</span>
        ) : (
          <Spinner size="sm" />
        )}
      </button>
      {onRemove && (
        <IconButton
          icon={X}
          size="sm"
          label="Remove the image"
          className="absolute -top-1.5 -right-1.5 size-5 bg-elevated shadow-card"
          onClick={onRemove}
        />
      )}
    </div>
  );
}

/** Images of a message: thumbnails that open in the image tab; removable while composing. */
export function ChatImages({
  images,
  onRemove,
  className,
}: {
  images: ChatImage[];
  onRemove?: (image: ChatImage) => void;
  className?: string;
}) {
  if (images.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {images.map((image) => (
        <Thumb key={image.path} image={image} onRemove={onRemove && (() => onRemove(image))} />
      ))}
    </div>
  );
}

/** A pasted or dropped file (a screenshot) → base64 for `sessions.addImage`. */
export function readAsBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error ?? new Error("Couldn't read the image"));
    reader.readAsDataURL(file);
  });
}

/** Keeps images for the next message of a session (through the host). */
export async function addImages(sessionId: string, files: Blob[]): Promise<ChatImage[]> {
  const out: ChatImage[] = [];
  for (const file of files)
    out.push(
      await call("sessions.addImage", { id: sessionId, data: await readAsBase64(file), mime: file.type }),
    );
  return out;
}
