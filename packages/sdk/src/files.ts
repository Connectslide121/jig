/** Image files Jig previews: types, size limit and path helpers (pure; used by the app and add-ons). */
export const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  svg: "image/svg+xml",
};

/** Largest image Jig loads for a preview. */
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

export function extensionOf(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function isImagePath(path: string): boolean {
  return extensionOf(path) in IMAGE_TYPES;
}

export function imageMime(path: string): string | undefined {
  return IMAGE_TYPES[extensionOf(path)];
}
