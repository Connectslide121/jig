import { FolderOpen, RefreshCw } from "lucide-react";
import { useState } from "react";
import { call } from "../../lib/host";
import { Empty, IconButton, ImagePreview, Spinner } from "../../ui";
import type { TabProps } from "../../workbench/registry";
import { useImageFile } from "./images";

/** An image file, fitted, with its size; opened from chat, Git or add-ons. */
export function ImageTab({ params }: TabProps) {
  const path = String(params.path ?? "");
  const [version, setVersion] = useState(0);
  const { data, error } = useImageFile(path || undefined, version);
  return (
    <div className="flex h-full flex-col" data-testid="image-tab">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
        <span className="selectable min-w-0 flex-1 truncate font-mono text-xs text-muted" title={path}>
          {path}
        </span>
        <IconButton icon={RefreshCw} size="sm" label="Reload" onClick={() => setVersion((v) => v + 1)} />
        <IconButton
          icon={FolderOpen}
          size="sm"
          label="Show in folder"
          onClick={() => void call("app.showItemInFolder", { path })}
        />
      </div>
      <div className="min-h-0 flex-1">
        {error ? (
          <Empty title="Can't show this image">{error}</Empty>
        ) : data ? (
          <ImagePreview src={data.dataUrl} alt={path} bytes={data.bytes} />
        ) : (
          <Spinner className="m-4" />
        )}
      </div>
    </div>
  );
}
