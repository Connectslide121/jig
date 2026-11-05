import { createPublicKey, type JsonWebKey, verify } from "node:crypto";

/**
 * Checks the token Microsoft's Bot Connector sends with every activity, as its docs list the steps
 * (`bot-framework-rest-connector-authentication`, checked 2026-11-05): a Bearer JWT signed with RS256
 * by a key from Bot Framework's OpenID metadata, issuer `https://api.botframework.com` (single-tenant
 * bots too), audience the bot's app id, within its lifetime (5 minutes of clock skew), a key endorsed
 * for the activity's channel, and a `serviceurl` claim equal to the activity's `serviceUrl`.
 */

export const BOT_OPENID_METADATA = "https://login.botframework.com/v1/.well-known/openidconfiguration";
export const BOT_ISSUER = "https://api.botframework.com";
const SKEW_S = 5 * 60;

export interface BotJwk extends JsonWebKey {
  kid?: string;
  endorsements?: string[];
}

type Fetch = typeof fetch;

/**
 * Bot Framework's signing keys, cached (Microsoft: refresh at least daily; new keys can appear at any
 * time, so an unknown key id refreshes once, at most every 5 minutes).
 */
export class BotKeys {
  private keys: BotJwk[] = [];
  private loadedAt = Number.NEGATIVE_INFINITY;
  private triedAt = Number.NEGATIVE_INFINITY;
  private loading?: Promise<void>;

  constructor(
    private readonly fetchFn: Fetch = fetch,
    private readonly metadataUrl = BOT_OPENID_METADATA,
    private readonly now: () => number = Date.now,
  ) {}

  async get(kid: string): Promise<BotJwk | undefined> {
    if (this.now() - this.loadedAt > 12 * 3600_000) await this.load();
    let key = this.keys.find((k) => k.kid === kid);
    if (!key && this.now() - this.triedAt > 5 * 60_000) {
      await this.load();
      key = this.keys.find((k) => k.kid === kid);
    }
    return key;
  }

  private load(): Promise<void> {
    this.loading ??= (async () => {
      this.triedAt = this.now();
      try {
        const meta = (await (await this.fetchFn(this.metadataUrl)).json()) as { jwks_uri?: string };
        if (!meta.jwks_uri) throw new Error("no jwks_uri");
        const set = (await (await this.fetchFn(meta.jwks_uri)).json()) as { keys?: BotJwk[] };
        if (!Array.isArray(set.keys)) throw new Error("no keys");
        this.keys = set.keys;
        this.loadedAt = this.now();
      } finally {
        this.loading = undefined;
      }
    })();
    return this.loading;
  }
}

export type TokenCheck = { ok: true } | { ok: false; reason: string };

export interface TokenContext {
  appId: string;
  /** The activity's `serviceUrl` and `channelId` (`msteams`). */
  serviceUrl?: string;
  channelId?: string;
  keys: Pick<BotKeys, "get">;
  /** Seconds since the epoch. */
  now?: number;
}

export async function checkBotToken(authorization: string | null, ctx: TokenContext): Promise<TokenCheck> {
  const match = /^Bearer\s+(\S+)$/i.exec(authorization ?? "");
  if (!match) return { ok: false, reason: "no bearer token" };
  const parts = match[1]!.split(".");
  if (parts.length !== 3) return { ok: false, reason: "not a JWT" };
  const [head, body, sig] = parts as [string, string, string];
  let header: { alg?: string; kid?: string };
  let claims: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(head, "base64url").toString("utf8"));
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "not a JWT" };
  }
  if (header.alg !== "RS256") return { ok: false, reason: "wrong algorithm" };
  if (claims.iss !== BOT_ISSUER) return { ok: false, reason: "wrong issuer" };
  const aud = claims.aud;
  if (!(aud === ctx.appId || (Array.isArray(aud) && aud.includes(ctx.appId))))
    return { ok: false, reason: "wrong audience" };
  const now = ctx.now ?? Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp + SKEW_S < now) return { ok: false, reason: "expired" };
  if (typeof claims.nbf === "number" && claims.nbf - SKEW_S > now)
    return { ok: false, reason: "not yet valid" };
  if (!header.kid) return { ok: false, reason: "unknown key" };
  let jwk: BotJwk | undefined;
  try {
    jwk = await ctx.keys.get(header.kid);
  } catch {
    return { ok: false, reason: "keys unavailable" };
  }
  if (!jwk) return { ok: false, reason: "unknown key" };
  let signed = false;
  try {
    const { kid: _kid, endorsements: _e, ...key } = jwk;
    signed = verify(
      "RSA-SHA256",
      Buffer.from(`${head}.${body}`),
      createPublicKey({ key, format: "jwk" }),
      Buffer.from(sig, "base64url"),
    );
  } catch {
    signed = false;
  }
  if (!signed) return { ok: false, reason: "bad signature" };
  if (ctx.channelId && jwk.endorsements && !jwk.endorsements.includes(ctx.channelId))
    return { ok: false, reason: "key not endorsed for the channel" };
  const serviceUrl = claims.serviceurl ?? claims.serviceUrl;
  if (!ctx.serviceUrl || serviceUrl !== ctx.serviceUrl) return { ok: false, reason: "service URL mismatch" };
  return { ok: true };
}
