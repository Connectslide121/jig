import { createHash } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { CommunicationIdentityClient } from "@azure/communication-identity";
import { AzureCliCredential } from "@azure/identity";
import { type AccountInfo, PublicClientApplication, type TokenCacheContext } from "@azure/msal-node";
import { safeStorage } from "electron";
import { JigError } from "../../shared/ipc";
import type { MeetingEvent, MeetingSettings } from "../../shared/meetings";
import { openExternal } from "../appWindows";
import { logger } from "../log";

import { writeText } from "../state/jsonStore";
import { paths } from "../state/paths";

const log = logger("meetings");

const callingScopes = [
  "https://auth.msft.communication.azure.com/Teams.ManageCalls",
  "https://auth.msft.communication.azure.com/Teams.ManageChats",
];

/** Microsoft sign-in persists only through OS-protected encryption; calling tokens stay in memory. */
export class MeetingAuth {
  private client?: PublicClientApplication;
  private account?: AccountInfo;
  private interactive?: Promise<string>;
  private epoch = 0;
  private restored?: Promise<void>;
  private persisting?: Promise<void>;
  private cachedFile?: string;
  constructor(private readonly settings: () => MeetingSettings) {}
  get name(): string | undefined {
    return this.account?.username;
  }
  get displayName(): string | undefined {
    return this.account?.name;
  }
  reset(): void {
    this.epoch++;
    this.restored = undefined;
    this.client = undefined;
    this.account = undefined;
  }
  private cacheFile(): string | undefined {
    const { tenantId, clientId } = this.settings();
    if (!tenantId || !clientId) return undefined;
    const key = createHash("sha256").update(`${tenantId}:${clientId}`).digest("hex");
    return join(paths.cache(), "microsoft", `${key}.cache`);
  }
  async signOut(): Promise<void> {
    const file = this.cachedFile ?? this.cacheFile();
    this.reset();
    await this.persisting?.catch(() => {});
    if (file) await rm(file, { force: true });
    this.cachedFile = undefined;
  }
  async restore(): Promise<void> {
    if (!this.settings().clientId || !this.settings().tenantId) return;
    this.restored ??= (async () => {
      const epoch = this.epoch;
      try {
        const accounts = await this.app().getTokenCache().getAllAccounts();
        if (this.epoch === epoch && !this.account) this.account = accounts[0];
      } catch {
        /* An unavailable/corrupt protected cache requires a fresh sign-in. */
      }
    })();
    await this.restored;
  }
  private app(): PublicClientApplication {
    const { tenantId, clientId } = this.settings();
    if (!tenantId || !clientId)
      throw new JigError("meeting_setup", "Configure the Microsoft tenant and app registration first");
    if (this.client) return this.client;
    const file = this.cacheFile();
    const epoch = this.epoch;
    this.cachedFile = file;
    // MSAL clears its in-memory cache before every silent request and rebuilds it from what
    // beforeCacheAccess deserializes, so the latest state must be handed back on every access,
    // not only the file's contents at first load (otherwise a fresh sign-in is wiped).
    let latest: string | undefined;
    let loaded: Promise<void> | undefined;
    const protectedStorage = () =>
      safeStorage.isEncryptionAvailable() &&
      (process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text");
    this.client = new PublicClientApplication({
      cache: {
        cachePlugin: {
          beforeCacheAccess: async (context: TokenCacheContext) => {
            loaded ??= (async () => {
              if (!file || !protectedStorage() || this.epoch !== epoch) return;
              try {
                const encoded = await readFile(file, "utf8");
                latest ??= safeStorage.decryptString(Buffer.from(encoded, "base64"));
              } catch {
                /* No plaintext fallback and no credential-bearing error logging. */
              }
            })();
            await loaded;
            if (latest && this.epoch === epoch) context.tokenCache.deserialize(latest);
          },
          afterCacheAccess: async (context: TokenCacheContext) => {
            if (!context.cacheHasChanged || this.epoch !== epoch) return;
            latest = context.tokenCache.serialize();
            if (!file || !protectedStorage()) return;
            const encrypted = safeStorage.encryptString(latest).toString("base64");
            this.persisting = writeText(file, encrypted);
            await this.persisting;
          },
        },
      },
      auth: { clientId, authority: `https://login.microsoftonline.com/${tenantId}` },
      system: { loggerOptions: { piiLoggingEnabled: false, loggerCallback: () => {} } },
    });
    return this.client;
  }
  private async access(scopes: string[], interactive: boolean): Promise<string> {
    await this.restore();
    const client = this.app();
    const epoch = this.epoch;
    if (this.account) {
      try {
        return (await client.acquireTokenSilent({ account: this.account, scopes })).accessToken;
      } catch (error) {
        // Only MSAL's error code: its messages can carry account details.
        log.warn("Silent Microsoft token request failed", {
          code: (error as { errorCode?: string }).errorCode ?? "unknown",
        });
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
            await openExternal(url);
          },
          successTemplate: "You are connected to Jig. You can close this page.",
          errorTemplate: "Microsoft could not connect Jig. Return to Jig for details.",
        });
        if (this.epoch !== epoch) throw new Error("Sign-in cancelled");
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
