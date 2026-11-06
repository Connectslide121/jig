import type { AddonUiContext } from "@jig/sdk";
import { IconButton, useAddon } from "@jig/sdk/ui";
import { Video } from "lucide-react";

/** The privileged media window has its own lifetime, independent of workbench/project views. */
export async function openMeetings(ctx: AddonUiContext): Promise<void> {
  await ctx.meetings.open();
}

/** Past meetings: the Meetings window on its Meetings tab (D-250, D-376). */
export async function openHistory(ctx: AddonUiContext): Promise<void> {
  await ctx.meetings.history();
}

/** The top bar's Meetings button: one click opens, or focuses, the Meetings window (D-376). */
export function MeetingsButton() {
  const ctx = useAddon();
  return (
    <IconButton
      icon={Video}
      label="Meetings"
      data-testid="topbar-meetings"
      onClick={() => void ctx.meetings.open()}
    />
  );
}
