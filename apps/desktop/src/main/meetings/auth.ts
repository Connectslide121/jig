import { CommunicationIdentityClient } from "@azure/communication-identity";
import { AzureCliCredential } from "@azure/identity";
import { type AccountInfo, PublicClientApplication } from "@azure/msal-node";
import { shell } from "electron";
import { JigError } from "../../shared/ipc";
import type { MeetingEvent, MeetingSettings } from "../../shared/meetings";

const callingScopes = [
  "https://auth.msft.communication.azure.com/Teams.ManageCalls",
  "https://auth.msft.communication.azure.com/Teams.ManageChats",
];

/** MSAL's cache stays in memory. Resource authentication uses the user's own Azure CLI login. */
export class MeetingAuth {
  private client?: PublicClientApplication;
  private account?: AccountInfo;
  private interactive?: Promise<string>;
  constructor(private readonly settings: () => MeetingSettings) {}
  get name(): string | undefined {
    return this.account?.username;
  }
  get displayName(): string | undefined {
    return this.account?.name;
  }
  reset(): void {
    this.client = undefined;
    this.account = undefined;
  }
  private app(): PublicClientApplication {
    const { tenantId, clientId } = this.settings();
    if (!tenantId || !clientId)
      throw new JigError("meeting_setup", "Configure the Microsoft tenant and app registration first");
    this.client ??= new PublicClientApplication({
      auth: { clientId, authority: `https://login.microsoftonline.com/${tenantId}` },
      system: { loggerOptions: { piiLoggingEnabled: false, loggerCallback: () => {} } },
    });
    return this.client;
  }
  private async access(scopes: string[], interactive: boolean): Promise<string> {
    const client = this.app();
    if (this.account) {
      try {
        return (await client.acquireTokenSilent({ account: this.account, scopes })).accessToken;
      } catch {
        if (!interactive)
          throw new JigError("meeting_signin", "Reconnect your Microsoft account from Meetings");
      }
    }
    if (!interactive) throw new JigError("meeting_signin", "Connect your Microsoft account from Meetings");
    if (this.interactive)
      throw new JigError("meeting_signin", "A Microsoft sign-in is already open in your browser");
    this.interactive = (async () => {
      try {
        const result = await client.acquireTokenInteractive({
          scopes,
          openBrowser: async (url) => {
            await shell.openExternal(url);
          },
          successTemplate: "You are connected to Jig. You can close this page.",
          errorTemplate: "Microsoft could not connect Jig. Return to Jig for details.",
        });
        this.account = result.account ?? undefined;
        return result.accessToken;
      } catch {
        throw new JigError(
          "meeting_signin",
          "Microsoft sign-in did not complete. If approval is required, ask your administrator to approve Jig's delegated Teams.ManageCalls, Teams.ManageChats and Calendars.ReadBasic permissions, then try again.",
        );
      } finally {
        this.interactive = undefined;
      }
    })();
    return this.interactive;
  }
  async signIn(): Promise<string> {
    await this.access(callingScopes, true);
    return this.name ?? "Microsoft account";
  }
  async credential(): Promise<{ token: string }> {
    const aad = await this.access(callingScopes, false);
    const { endpoint, tenantId, clientId } = this.settings();
    if (!endpoint || !this.account)
      throw new JigError("meeting_setup", "Configure your Azure Communication Services endpoint first");
    try {
      const identity = new CommunicationIdentityClient(endpoint, new AzureCliCredential({ tenantId }));
      const result = await identity.getTokenForTeamsUser({
        teamsUserAadToken: aad,
        clientId,
        userObjectId: this.account.localAccountId,
      });
      return { token: result.token };
    } catch {
      throw new JigError(
        "meeting_azure",
        "Could not issue the calling credential. Check your Azure CLI sign-in and the Communication Services identity role on this resource. No resource keys are required.",
      );
    }
  }
  async calendar(): Promise<MeetingEvent[]> {
    const token = await this.access(["https://graph.microsoft.com/Calendars.ReadBasic"], true);
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const until = new Date(from);
    until.setDate(until.getDate() + 14);
    const query = new URLSearchParams({
      startDateTime: from.toISOString(),
      endDateTime: until.toISOString(),
      $select: "id,subject,start,end,organizer,onlineMeeting,isCancelled",
      $orderby: "start/dateTime",
      $top: "100",
    });
    let url: string | undefined = `https://graph.microsoft.com/v1.0/me/calendarView?${query}`;
    const events: MeetingEvent[] = [];
    while (url && events.length < 1000) {
      const parsed = new URL(url);
      if (parsed.origin !== "https://graph.microsoft.com")
        throw new JigError("meeting_calendar", "Invalid calendar continuation");
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"' },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok)
        throw new JigError(
          "meeting_calendar",
          `Calendar request failed (${response.status}). Reconnect Microsoft or check calendar permission.`,
        );
      const data = (await response.json()) as {
        value: Array<{
          id: string;
          subject: string;
          start: { dateTime: string };
          end: { dateTime: string };
          organizer?: { emailAddress?: { name?: string } };
          onlineMeeting?: { joinUrl?: string };
          isCancelled?: boolean;
        }>;
        "@odata.nextLink"?: string;
      };
      for (const e of data.value)
        if (!e.isCancelled)
          events.push({
            id: e.id,
            title: e.subject || "Meeting",
            start: `${e.start.dateTime.replace(/Z$/, "")}Z`,
            end: `${e.end.dateTime.replace(/Z$/, "")}Z`,
            organizer: e.organizer?.emailAddress?.name ?? "",
            joinUrl: e.onlineMeeting?.joinUrl,
          });
      url = data["@odata.nextLink"];
    }
    return events;
  }
}
