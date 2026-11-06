import type { ReactNode } from "react";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export interface DetailField {
  label: string;
  value: ReactNode;
}

export interface ActivityItem {
  id: string;
  when: string;
  who: string;
  text: string;
}

/**
 * One record's details beside the list: title, status, fields in two aligned columns, its activity,
 * and actions at the bottom. Opens over the page, so the list behind it doesn't move.
 */
export function DetailDrawer({
  open,
  onOpenChange,
  title,
  subtitle,
  status,
  fields,
  activity,
  actions,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  status?: ReactNode;
  fields: DetailField[];
  activity?: ActivityItem[];
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-md" data-kit="detail">
        <SheetHeader className="border-b pr-12">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <SheetTitle className="font-display text-lg">{title}</SheetTitle>
              <SheetDescription>{subtitle ?? "Details"}</SheetDescription>
            </div>
            {status}
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3 text-sm">
            {fields.map((f) => (
              <div key={f.label} className="contents">
                <dt className="text-muted-foreground">{f.label}</dt>
                <dd className="min-w-0 font-medium">{f.value}</dd>
              </div>
            ))}
          </dl>
          {children}
          {activity && activity.length > 0 && (
            <>
              <Separator className="my-5" />
              <h3 className="mb-3 text-sm font-semibold">Activity</h3>
              <ol className="relative space-y-4 border-l pl-4">
                {activity.map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-border ring-4 ring-background" aria-hidden />
                    <p className="text-sm">
                      <span className="font-medium">{a.who}</span> {a.text}
                    </p>
                    <p className="text-xs text-muted-foreground">{a.when}</p>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
        {actions && <SheetFooter className="flex-row justify-end gap-2 border-t">{actions}</SheetFooter>}
      </SheetContent>
    </Sheet>
  );
}
