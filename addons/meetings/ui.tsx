import type { AddonUiContext } from "@jig/sdk";

/** The privileged media window has its own lifetime, independent of workbench/project views. */
export async function openMeetings(ctx: AddonUiContext): Promise<void> {
  await ctx.meetings.open();
}
