import { cn, Spinner } from "../../ui";
import { openImage, useImageFile } from "../files";

/**
 * The images a folded run of steps produced (screenshots, images Claude looked at), as small previews
 * under its line; click one to open it in a tab. Each sits in a fixed box, so nothing moves as it loads.
 */
export function StepImages({ paths }: { paths: string[] }) {
  if (paths.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-2" data-testid="step-images">
      {paths.map((path) => (
        <StepImage key={path} path={path} />
      ))}
    </div>
  );
}

function StepImage({ path }: { path: string }) {
  const { data, error } = useImageFile(path);
  if (error) return null;
  return (
    <button
      type="button"
      title="Open in a tab"
      aria-label={`Open ${path.split(/[\\/]/).pop()} in a tab`}
      onClick={() => openImage(path)}
      className={cn(
        "jig-checkerboard flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line",
        "hover:border-line-strong focus-visible:outline-2 focus-visible:outline-accent",
      )}
      data-testid="step-image"
    >
      {data ? (
        <img src={data.dataUrl} alt="" draggable={false} className="size-full object-contain" />
      ) : (
        <Spinner size="sm" />
      )}
    </button>
  );
}
