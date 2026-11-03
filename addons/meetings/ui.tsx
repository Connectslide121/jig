import type { AddonUiContext } from "@jig/sdk";
import { IconButton, useAddon } from "@jig/sdk/ui";
import { Video } from "lucide-react";

/** The privileged media window has its own lifetime, independent of workbench/project views. */
export async function openMeetings(ctx: AddonUiContext): Promise<void> {
  await ctx.meetings.open();
}

/** Past meetings, as a tab in Jig's main window (D-250). */
export function openHistory(ctx: AddonUiContext): void {
  ctx.meetings.history();
}

/** The top bar's Meetings button: the meeting window, or the history here. */
export function MeetingsButton() {
  const ctx = useAddon();
  return (
    <IconButton
      icon={Video}
      label="Meetings"
      data-testid="topbar-meetings"
      onClick={(e) =>
        ctx.menu(
          [
            {
              label: "Open meetings window",
              icon: "video",
              testId: "meetings-open-window",
              onSelect: () => void ctx.meetings.open(),
            },
            {
              label: "Meeting history",
              icon: "history",
              testId: "meetings-open-history",
              onSelect: () => ctx.meetings.history(),
            },
          ],
          e.currentTarget,
        )
      }
    />
  );
}
