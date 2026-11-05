import { randomBytes } from "node:crypto";
import { z } from "zod";
import { JigError } from "../../shared/ipc";
import {
  type PhoneState,
  parseTeamsCredential,
  type TeamsSetupStatus,
  type TeamsSetupView,
  teamsCredential,
} from "../../shared/phone";
import {
  DEFAULT_GROUP,
  isResourceGroupName,
  newSuffix,
  type PlannedCommand,
  plannedCommands,
  relaySettings,
  type SetupChoice,
  type SetupOutputs,
  STEP_TITLES,
  setupResources,
} from "./teamsSetupPlan";

/** What setup keeps in `phone-teams-setup.json`: no secrets, so Create can go on after a restart. */
export const SavedSetup = z.object({
  choice: z
    .object({
      tenantId: z.string(),
      subscription: z.string(),
      region: z.string(),
      group: z.string(),
      suffix: z.string(),
    })
    .optional(),
  outputs: z.object({ appId: z.string().optional(), host: z.string().optional() }).default({}),
  done: z.array(z.string()).default([]),
  manual: z.boolean().optional(),
  packagePath: z.string().optional(),
});
export type SavedSetup = z.infer<typeof SavedSetup>;

export interface TeamsSetupDeps {
  /** Jig's `az` for the active tenant, JSON out (`runAz`); throws with az's error, naming the tenant. */
  az(args: string[], timeoutMs: number): Promise<unknown>;
  load(): Promise<SavedSetup>;
  save(saved: SavedSetup | undefined): Promise<void>;
  /** The relay's deployment package (`resources/relay/teams-relay.zip`); undefined when missing. */
  relayZip(): string | undefined;
  /** Writes the relay's settings to a private file for `--settings @file`; `done` deletes it. */
  settingsFile(contents: string): Promise<{ path: string; done: () => Promise<void> }>;
  /** Keeps the relay's credential and starts pairing (`phone.connect`). */
  connect(credential: string): Promise<PhoneState>;
  /** What the relay has seen (its health); undefined while the phone has no relay. */
  installs(): Promise<{ app: boolean; team: boolean } | undefined>;
  /** Writes the Teams app package for this app id and relay host; returns its path. */
  writePackage(appId: string, host: string): Promise<string>;
  onChange(view: TeamsSetupView): void;
  /** Waits between tries of the relay (tests pass a quick one). */
  sleep?(ms: number): Promise<void>;
  /** How long the relay may take to answer after deploying (ms). */
  relayWaitMs?: number;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const pick = (value: unknown, key: string) =>
  value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
/** A Flex Consumption location as az lists it ("East US" or "eastus") as `--location` takes it. */
const locationId = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The "Set up Teams" modal's work in main (D-370, D-381): reads where things can go, runs Create's `az`
 * commands in order (only when you press Create), writes the app package and asks the relay what it
 * has seen. The bot's secret and the relay key live only in memory, between the commands that need
 * them; after a restart those steps run again (a new secret and key) before connecting.
 */
export class TeamsSetup {
  private saved: SavedSetup = { outputs: {}, done: [] };
  private loaded = false;
  private tenant: TeamsSetupView["tenant"];
  private subscriptions: TeamsSetupView["subscriptions"] = [];
  private regions: string[] = [];
  private regionsFor?: string;
  private where: { subscription?: string; region?: string; group: string } = { group: DEFAULT_GROUP };
  private loading: TeamsSetupView["loading"];
  private whereError?: string;
  private running?: string;
  private failed?: { id: string; error: string };
  private installs = { app: false, team: false };
  /** Only between the commands that need them, never saved. */
  private secret?: string;
  private key?: string;

  constructor(private readonly deps: TeamsSetupDeps) {}

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.saved = await this.deps.load().catch(() => ({ outputs: {}, done: [] }));
    this.loaded = true;
    const c = this.saved.choice;
    if (c) this.where = { subscription: c.subscription, region: c.region, group: c.group };
  }

  private commands(): PlannedCommand[] {
    const c = this.saved.choice ?? this.draftChoice();
    return plannedCommands(c, this.saved.outputs, { zip: this.deps.relayZip() ?? "teams-relay.zip" });
  }

  /** The choice as it stands, for showing the commands before Create (placeholders where unpicked). */
  private draftChoice(): SetupChoice {
    return {
      tenantId: this.tenant?.id ?? "<tenant id>",
      subscription: this.where.subscription ?? "<subscription>",
      region: this.where.region ?? "<region>",
      group: this.where.group || DEFAULT_GROUP,
      suffix: "xxxxxx",
    };
  }

  private status(id: string): TeamsSetupStatus {
    if (this.saved.done.includes(id)) return "done";
    if (this.running === id) return "running";
    if (this.failed?.id === id) return "failed";
    return "todo";
  }

  view(): TeamsSetupView {
    const commands = this.commands();
    const created = commands.every((c) => this.saved.done.includes(c.id));
    const steps = STEP_TITLES.map((s) => {
      const mine = commands.filter((c) => c.step === s.id);
      const statuses = mine.map((c) => this.status(c.id));
      const status: TeamsSetupStatus = statuses.includes("failed")
        ? "failed"
        : statuses.includes("running")
          ? "running"
          : statuses.every((x) => x === "done")
            ? "done"
            : "todo";
      const failed =
        this.failed && mine.some((c) => c.id === this.failed?.id) ? this.failed.error : undefined;
      return {
        id: s.id,
        title: s.title,
        creates: s.creates,
        status,
        ...(failed ? { error: failed } : {}),
        commands: mine.map((c) => ({ id: c.id, text: c.display, status: this.status(c.id) })),
      };
    });
    const choice = this.saved.choice;
    const subName = (id: string) => this.subscriptions.find((s) => s.id === id)?.name;
    const resources =
      choice && !this.saved.manual
        ? (() => {
            const r = setupResources(choice, this.saved.outputs);
            return { ...r, subscription: subName(r.subscription) ?? r.subscription };
          })()
        : undefined;
    return {
      ...(this.tenant ? { tenant: this.tenant } : {}),
      subscriptions: this.subscriptions,
      regions: this.regions,
      choice: { ...this.where },
      ...(this.loading ? { loading: this.loading } : {}),
      ...(this.whereError ? { whereError: this.whereError } : {}),
      started: this.saved.done.length > 0 || Boolean(this.running),
      running: Boolean(this.running),
      created,
      manual: Boolean(this.saved.manual),
      steps,
      ...(this.saved.packagePath ? { packagePath: this.saved.packagePath } : {}),
      installs: { ...this.installs },
      ...(resources ? { resources } : {}),
    };
  }

  private changed(): void {
    this.deps.onChange(this.view());
  }

  private async persist(): Promise<void> {
    await this.deps.save(this.saved);
  }

  /** The modal opened: reads the tenant, subscriptions and regions once (az, read-only). */
  async open(options: { load?: boolean; installs?: boolean } = {}): Promise<TeamsSetupView> {
    await this.ensureLoaded();
    if (options.load && !this.tenant && !this.loading && !this.saved.manual) void this.loadWhere();
    if (options.installs) await this.checkInstalls();
    return this.view();
  }

  private async loadWhere(): Promise<void> {
    this.loading = "where";
    this.whereError = undefined;
    this.changed();
    try {
      const account = await this.deps.az(
        ["account", "show", "--query", "{tenantId: tenantId, user: user.name, tenant: tenantDisplayName}"],
        60_000,
      );
      const tenantId = str(pick(account, "tenantId"));
      if (!tenantId) throw new Error("The Azure CLI didn't say which tenant it is signed in to.");
      const tenantName = str(pick(account, "tenant"));
      const user = str(pick(account, "user"));
      this.tenant = { id: tenantId, ...(tenantName ? { name: tenantName } : {}), ...(user ? { user } : {}) };
      const list = await this.deps.az(
        [
          "account",
          "list",
          "--query",
          "[?state=='Enabled'].{id: id, name: name, tenantId: tenantId, isDefault: isDefault}",
        ],
        60_000,
      );
      const rows = (Array.isArray(list) ? list : []).filter((r) => str(pick(r, "id")));
      this.subscriptions = rows
        .map((r) => ({
          id: String(pick(r, "id")),
          name: str(pick(r, "name")) ?? String(pick(r, "id")),
          inTenant: String(pick(r, "tenantId")).toLowerCase() === tenantId.toLowerCase(),
          isDefault: pick(r, "isDefault") === true,
        }))
        .sort((a, b) => Number(b.inTenant) - Number(a.inTenant) || a.name.localeCompare(b.name))
        .map(({ isDefault: _, ...s }) => s);
      if (!this.where.subscription) {
        const usable = rows.filter(
          (r) => String(pick(r, "tenantId")).toLowerCase() === tenantId.toLowerCase(),
        );
        const preferred = usable.find((r) => pick(r, "isDefault") === true) ?? usable[0];
        if (preferred) this.where.subscription = String(pick(preferred, "id"));
      }
      if (!this.subscriptions.some((s) => s.inTenant))
        this.whereError =
          "No subscription of this tenant: the Azure Bot and the relay need one in the tenant where your Teams is. Pick another tenant in the top bar, or follow the portal guide.";
      this.loading = undefined;
      if (this.where.subscription) await this.loadRegions(this.where.subscription);
    } catch (error) {
      this.whereError = errorText(error);
    } finally {
      this.loading = undefined;
      this.changed();
    }
  }

  private async loadRegions(subscription: string): Promise<void> {
    if (this.regionsFor === subscription) return;
    this.loading = "regions";
    this.changed();
    try {
      const list = await this.deps.az(
        [
          "functionapp",
          "list-flexconsumption-locations",
          "--subscription",
          subscription,
          "--query",
          "[].name",
        ],
        90_000,
      );
      this.regions = [...new Set((Array.isArray(list) ? list : []).map((n) => locationId(String(n))))]
        .filter(Boolean)
        .sort();
      this.regionsFor = subscription;
      if (!this.where.region || !this.regions.includes(this.where.region))
        this.where.region = this.regions.includes("westeurope") ? "westeurope" : this.regions[0];
    } catch (error) {
      this.whereError = errorText(error);
    } finally {
      this.loading = undefined;
    }
  }

  /** Picks where things go (before Create started). */
  async setWhere(next: { subscription?: string; region?: string; group?: string }): Promise<TeamsSetupView> {
    await this.ensureLoaded();
    if (this.saved.done.length || this.running)
      throw new JigError("started", "Create already started: Start over to put it somewhere else.");
    if (next.group !== undefined) this.where.group = next.group.trim();
    if (next.region !== undefined) this.where.region = next.region;
    if (next.subscription !== undefined && next.subscription !== this.where.subscription) {
      const sub = this.subscriptions.find((s) => s.id === next.subscription);
      if (!sub?.inTenant)
        throw new JigError("invalid_name", "Pick a subscription in the tenant where your Teams is.");
      this.where.subscription = next.subscription;
      this.whereError = undefined;
      this.changed();
      await this.loadRegions(next.subscription);
    }
    this.changed();
    return this.view();
  }

  /** Why Create can't run yet, in the user's words; undefined when it can. */
  private notReady(): string | undefined {
    if (!this.tenant) return "Jig hasn't read the active tenant yet.";
    if (!this.where.subscription) return "Pick a subscription.";
    if (!this.where.region) return "Pick a region.";
    if (!isResourceGroupName(this.where.group))
      return "A resource group's name is letters, digits, _ . ( ) and -, and doesn't end with a period.";
    if (!this.deps.relayZip())
      return "The relay's package isn't in this Jig (run npm run relay:build in a clone).";
    return undefined;
  }

  /** Create: runs the commands in order from the first not done; answers at once. */
  async create(): Promise<TeamsSetupView> {
    await this.ensureLoaded();
    if (this.running) return this.view();
    if (!this.saved.choice) {
      const problem = this.notReady();
      if (problem) throw new JigError("not_ready", problem);
      this.saved.choice = {
        tenantId: this.tenant!.id,
        subscription: this.where.subscription!,
        region: this.where.region!,
        group: this.where.group,
        suffix: newSuffix(),
      };
    } else if (!this.deps.relayZip()) throw new JigError("not_ready", this.notReady() ?? "");
    // The secret and the key were only in memory: after a restart they are made again.
    if (!this.key) {
      const again = this.commands().filter((c) => c.step === "settings" || c.step === "connect");
      this.saved.done = this.saved.done.filter((id) => !again.some((c) => c.id === id));
    }
    this.failed = undefined;
    void this.run();
    return this.view();
  }

  private async run(): Promise<void> {
    for (;;) {
      const next = this.commands().find((c) => !this.saved.done.includes(c.id));
      if (!next) break;
      this.running = next.id;
      this.changed();
      try {
        await this.runOne(next);
        this.saved.done.push(next.id);
        await this.persist();
      } catch (error) {
        this.failed = { id: next.id, error: errorText(error) };
        this.running = undefined;
        this.changed();
        return;
      }
    }
    this.running = undefined;
    this.secret = undefined;
    this.key = undefined;
    this.changed();
  }

  private async runOne(c: PlannedCommand): Promise<void> {
    const minutes = (c.minutes ?? 2) * 60_000;
    if (c.id === "connect.health") return this.connectRelay();
    if (c.id === "settings.set") {
      const { appId } = this.saved.outputs;
      if (!appId || !this.secret || !this.key) throw new Error("The bot's secret is missing: Create again.");
      const file = await this.deps.settingsFile(
        JSON.stringify(
          relaySettings({ appId, tenantId: this.saved.choice!.tenantId, secret: this.secret, key: this.key }),
        ),
      );
      try {
        const args = plannedCommands(this.saved.choice!, this.saved.outputs, {
          zip: this.deps.relayZip() ?? "",
          settingsFile: file.path,
        }).find((x) => x.id === c.id)?.args;
        await this.deps.az(args ?? [], minutes);
      } finally {
        await file.done();
      }
      // The secret is in Azure now; Jig doesn't keep it a moment longer.
      this.secret = undefined;
      return;
    }
    if (!c.args) return;
    if (c.args.some((a) => a.includes("<app id>") || a.includes("<relay host>")))
      throw new Error("An earlier step didn't say what this one needs: Start over.");
    if (c.id === "settings.secret") this.key = randomBytes(32).toString("base64url");
    const answer = await this.deps.az(c.args, minutes);
    for (const out of c.outputs ?? []) {
      const value = str(pick(answer, out));
      if (!value) throw new Error(`The Azure CLI's answer had no ${out === "password" ? "secret" : out}.`);
      if (out === "password") this.secret = value;
      else this.saved.outputs[out] = value;
    }
  }

  /** The relay answers (it may take a few minutes after deploying): keep its credential, start pairing. */
  private async connectRelay(): Promise<void> {
    const { host } = this.saved.outputs;
    if (!host || !this.key) throw new Error("The relay key is missing: Create again.");
    const credential = teamsCredential(`https://${host}`, this.key);
    const sleep = this.deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
    const until = Date.now() + (this.deps.relayWaitMs ?? 4 * 60_000);
    for (;;) {
      try {
        await this.deps.connect(credential);
        return;
      } catch (error) {
        if (Date.now() >= until)
          throw new Error(`The relay didn't answer: ${errorText(error)} Wait a minute and Retry.`);
        await sleep(10_000);
      }
    }
  }

  /** Made in the Azure portal by hand: the app id and the relay's credential. */
  async manual(appId: string, credential: string): Promise<TeamsSetupView> {
    await this.ensureLoaded();
    const parsed = parseTeamsCredential(credential);
    if (!parsed) throw new JigError("invalid_token", "That isn't a Teams relay's address and key.");
    await this.deps.connect(credential.trim());
    this.saved = { outputs: { appId: appId.trim(), host: new URL(parsed.url).host }, done: [], manual: true };
    this.saved.done = this.commands().map((c) => c.id);
    this.failed = undefined;
    await this.persist();
    this.changed();
    return this.view();
  }

  /** Writes the Teams app package and remembers where. */
  async writePackage(): Promise<TeamsSetupView> {
    await this.ensureLoaded();
    const { appId, host } = this.saved.outputs;
    if (!appId || !host) throw new JigError("not_ready", "Create the Azure pieces first.");
    this.saved.packagePath = await this.deps.writePackage(appId, host);
    await this.persist();
    this.changed();
    return this.view();
  }

  /** Asks the relay whether the app was added for yourself and to a team. */
  async checkInstalls(): Promise<void> {
    const seen = await this.deps.installs().catch(() => undefined);
    if (!seen) return;
    if (seen.app === this.installs.app && seen.team === this.installs.team) return;
    this.installs = seen;
    this.changed();
  }

  /** Start over / Disconnect: forgets what setup made (listed to you first; never deleted here). */
  async forget(): Promise<TeamsSetupView> {
    await this.ensureLoaded();
    if (this.running) throw new JigError("busy", "Create is running: wait for it to finish or fail.");
    this.saved = { outputs: {}, done: [] };
    this.failed = undefined;
    this.secret = undefined;
    this.key = undefined;
    this.installs = { app: false, team: false };
    await this.deps.save(undefined);
    this.changed();
    return this.view();
  }
}
