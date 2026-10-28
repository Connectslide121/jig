import { useEffect, useState } from "react";
import type { ImageData } from "../../../shared/files";
import { call, errorMessage } from "../../lib/host";
import { workbench } from "../../workbench/store";

// A few recent images, so a transcript re-render doesn't read the file again.
const cache = new Map<string, Promise<ImageData>>();
const CACHE_SIZE = 40;

export function loadImage(path: string, fresh = false): Promise<ImageData> {
  let entry = fresh ? undefined : cache.get(path);
  if (!entry) {
    entry = call("files.image", { path });
    entry.catch(() => cache.delete(path));
    cache.set(path, entry);
    while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  }
  return entry;
}

/** An image file as a data URL (through the host), with loading and error state. */
export function useImageFile(path: string | undefined, version = 0): { data?: ImageData; error?: string } {
  const [state, setState] = useState<{ data?: ImageData; error?: string }>({});
  useEffect(() => {
    if (!path) return;
    let live = true;
    setState({});
    loadImage(path, version > 0).then(
      (data) => live && setState({ data }),
      (error) => live && setState({ error: errorMessage(error) }),
    );
    return () => {
      live = false;
    };
  }, [path, version]);
  return state;
}

/** Opens an image file in a main-area tab. */
export function openImage(path: string): void {
  workbench.openTab("jig.image", { path });
}
