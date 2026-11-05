import { ArrowDown } from "lucide-react";

/**
 * The "Latest" pill over the bottom of a scrolled-up list (chat, meeting transcript): it floats over
 * the content, so showing it moves nothing. The parent is `relative`.
 */
export function JumpToLatest({ onClick, testId }: { onClick(): void; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-3 left-1/2 flex h-7 -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-elevated px-3 text-xs text-fg shadow-popover hover:bg-hover"
      data-testid={testId}
    >
      <ArrowDown className="size-3.5" /> Latest
    </button>
  );
}
