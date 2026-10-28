import { Image } from "lucide-react";
import { registerTabType } from "../../workbench/registry";
import { ImageTab } from "./ImageTab";

export { loadImage, openImage, useImageFile } from "./images";

const baseName = (path: string) => path.split(/[\\/]/).pop() || path;

export function registerFiles(): void {
  registerTabType({
    type: "jig.image",
    title: (params) => baseName(String(params.path ?? "Image")),
    icon: Image,
    component: ImageTab,
    owner: "core",
  });
}
