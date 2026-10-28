/** Image previews (docs/reference/ipc.md, `files.image`). The helpers live in @jig/sdk for add-ons. */
export { extensionOf, IMAGE_TYPES, imageMime, isImagePath, MAX_IMAGE_BYTES } from "@jig/sdk";

export interface ImageData {
  /** `data:` URL, ready for `<img src>`. */
  dataUrl: string;
  bytes: number;
  mime: string;
}
