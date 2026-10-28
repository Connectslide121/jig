import { X } from "lucide-react";
import type { ChatAttachment } from "../../../shared/engine";
import { call } from "../../lib/host";
import { Badge, cn, FileIcon, IconButton, Spinner } from "../../ui";
import { openImage, useImageFile } from "../files";
import { openPreview } from "../preview/actions";

const KIND_LABEL: Record<NonNullable<ChatAttachment["kind"]>, string> = {
  image: "image",
  pdf: "PDF",
  office: "as text",
  text: "text",
};

function RemoveButton({ onRemove }: { onRemove: () => void }) {
  return (
    <IconButton
      icon={X}
      size="sm"
      label="Remove the attachment"
      className="absolute -top-1.5 -right-1.5 size-5 bg-elevated shadow-card"
      onClick={onRemove}
    />
  );
}

function Thumb({ file, onRemove }: { file: ChatAttachment; onRemove?: () => void }) {
  const { data, error } = useImageFile(file.path);
  return (
    <div className="group relative" data-testid="chat-attachment" data-kind="image">
      <button
        type="button"
        title="Open the image"
        onClick={() => openImage(file.path)}
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
      {onRemove && <RemoveButton onRemove={onRemove} />}
    </div>
  );
}

function DocumentChip({ file, onRemove }: { file: ChatAttachment; onRemove?: () => void }) {
  const name = file.name ?? file.path.split(/[\\/]/).pop() ?? "file";
  return (
    <div className="relative" data-testid="chat-attachment" data-kind={file.kind}>
      <button
        type="button"
        title={`Open ${name}`}
        onClick={() => openPreview(file.path)}
        className="flex h-16 max-w-56 items-center gap-2 rounded-md border border-line bg-surface px-3 text-left hover:bg-hover"
      >
        <FileIcon path={name} className="size-6" />
        <span className="min-w-0">
          <span className="block truncate text-xs font-medium text-fg">{name}</span>
          {file.kind && <Badge>{KIND_LABEL[file.kind]}</Badge>}
        </span>
      </button>
      {onRemove && <RemoveButton onRemove={onRemove} />}
    </div>
  );
}

/** Files of a message: image thumbnails and document chips; removable while composing. */
export function ChatAttachments({
  files,
  onRemove,
  className,
}: {
  files: ChatAttachment[];
  onRemove?: (file: ChatAttachment) => void;
  className?: string;
}) {
  if (files.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {files.map((file) =>
        (file.kind ?? "image") === "image" ? (
          <Thumb key={file.path} file={file} onRemove={onRemove && (() => onRemove(file))} />
        ) : (
          <DocumentChip key={file.path} file={file} onRemove={onRemove && (() => onRemove(file))} />
        ),
      )}
    </div>
  );
}

/** A pasted or dropped file → base64 for `sessions.addAttachment`. */
export function readAsBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error ?? new Error("Couldn't read the file"));
    reader.readAsDataURL(file);
  });
}

/** Keeps pasted or dropped files for the next message of a session (through the host). */
export async function addFiles(sessionId: string, files: File[]): Promise<ChatAttachment[]> {
  const out: ChatAttachment[] = [];
  for (const file of files)
    out.push(
      await call("sessions.addAttachment", {
        id: sessionId,
        data: await readAsBase64(file),
        mime: file.type,
        name: file.name,
      }),
    );
  return out;
}
