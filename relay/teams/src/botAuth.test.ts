import { describe, expect, it, vi } from "vitest";
import { BOT_ISSUER, BotKeys, checkBotToken } from "./botAuth.ts";
import { testSigner } from "./testing.ts";

const APP = "11111111-2222-3333-4444-555555555555";
const SERVICE = "https://smba.trafficmanager.net/emea/";
const NOW = 1_800_000_000;
const signer = testSigner();
const good = { iss: BOT_ISSUER, aud: APP, exp: NOW + 3600, nbf: NOW - 10, serviceurl: SERVICE };
const ctx = { appId: APP, serviceUrl: SERVICE, channelId: "msteams", keys: signer.keys, now: NOW };

const check = (claims: Record<string, unknown>, extra: Partial<typeof ctx> = {}, header = {}) =>
  checkBotToken(`Bearer ${signer.token(claims, header)}`, { ...ctx, ...extra });

describe("checkBotToken", () => {
  it("accepts a token Microsoft signed for this bot", async () => {
    expect(await check(good)).toEqual({ ok: true });
  });

  it("refuses a wrong audience, issuer or algorithm", async () => {
    expect(await check({ ...good, aud: "someone-else" })).toEqual({ ok: false, reason: "wrong audience" });
    expect(await check({ ...good, iss: "https://sts.windows.net/x/" })).toEqual({
      ok: false,
      reason: "wrong issuer",
    });
    expect(await check(good, {}, { alg: "HS256" })).toEqual({ ok: false, reason: "wrong algorithm" });
  });

  it("allows five minutes of clock skew, no more", async () => {
    expect((await check({ ...good, exp: NOW - 200 })).ok).toBe(true);
    expect(await check({ ...good, exp: NOW - 400 })).toEqual({ ok: false, reason: "expired" });
    expect(await check({ ...good, nbf: NOW + 400 })).toEqual({ ok: false, reason: "not yet valid" });
  });

  it("refuses an unknown key and a signature by another key", async () => {
    expect(await check(good, {}, { kid: "other" })).toEqual({ ok: false, reason: "unknown key" });
    const forger = testSigner("test-key");
    expect(await checkBotToken(`Bearer ${forger.token(good)}`, ctx)).toEqual({
      ok: false,
      reason: "bad signature",
    });
  });

  it("checks the key's endorsements and the service URL", async () => {
    expect(await check(good, { channelId: "webchat" })).toEqual({
      ok: false,
      reason: "key not endorsed for the channel",
    });
    expect(await check({ ...good, serviceurl: "https://evil.example/" })).toEqual({
      ok: false,
      reason: "service URL mismatch",
    });
  });

  it("needs a Bearer JWT", async () => {
    expect(await checkBotToken(null, ctx)).toEqual({ ok: false, reason: "no bearer token" });
    expect(await checkBotToken("Bearer abc", ctx)).toEqual({ ok: false, reason: "not a JWT" });
  });
});

describe("BotKeys", () => {
  it("reads the keys from the OpenID metadata, caches them and refreshes for an unknown key", async () => {
    let now = 0;
    let keys = [{ kid: "a" }];
    const fetchFn = vi.fn(async (url: string) => {
      const body = url.endsWith("openidconfiguration") ? { jwks_uri: "https://keys.example/" } : { keys };
      return new Response(JSON.stringify(body));
    });
    const k = new BotKeys(fetchFn as unknown as typeof fetch, "https://meta/openidconfiguration", () => now);
    expect(await k.get("a")).toEqual({ kid: "a" });
    expect(await k.get("a")).toEqual({ kid: "a" });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    // An unknown key right after loading isn't fetched again at once…
    keys = [{ kid: "a" }, { kid: "b" }];
    expect(await k.get("b")).toBeUndefined();
    // …but five minutes later it is.
    now = 6 * 60_000;
    expect(await k.get("b")).toEqual({ kid: "b" });
    // And after 12 hours every key is refreshed.
    now = 13 * 3600_000;
    keys = [{ kid: "c" }];
    expect(await k.get("a")).toBeUndefined();
  });
});
