import type { AddonUiContext } from "@jig/sdk";
import { IconButton, useAddon } from "@jig/sdk/ui";
import { Video } from "lucide-react";

/** The privileged media window has its own lifetime, independent of workbench/project views. */
export async function openMeetings(ctx: AddonUiContext): Promise<void> {
  await ctx.meetings.open();
}

/** The top bar's Meetings button, beside Jig's other icon buttons. */
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
