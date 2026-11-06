import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A screen's frame: its heading, a line under it, actions at the right, then the content. The
 * content is a size container: lay it out with container variants (@xl:, @3xl:, @5xl:), so the
 * same screen fits a window, a tablet frame and a phone.
 */
export function Page({
  title,
  description,
  actions,
  children,
  className,
  width = "wide",
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  width?: "wide" | "narrow" | "full";
}) {
  return (
    <div
      className={cn(
        "@container mx-auto w-full px-4 py-5 @3xl/shell:px-8 @3xl/shell:py-7",
        width === "wide" && "max-w-7xl",
        width === "narrow" && "max-w-3xl",
        className,
      )}
    >
      <div className="mb-6 flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance @3xl:text-[1.75rem]">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground @3xl:text-base">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

/** A titled group of content inside a page. */
export function Section({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center gap-3">
          {title && <h2 className="flex-1 text-base font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
