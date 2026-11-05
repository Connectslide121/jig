import { createSign, generateKeyPairSync } from "node:crypto";
import type { BotJwk } from "./botAuth.ts";

/** A Bot Framework-like signing key for the tests, and tokens signed with it. */
export function testSigner(kid = "test-key", endorsements: string[] = ["msteams"]) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk: BotJwk = { ...publicKey.export({ format: "jwk" }), kid, endorsements };
  return {
    jwk,
    keys: { get: async (id: string) => (id === kid ? jwk : undefined) },
    token(claims: Record<string, unknown>, header: Record<string, unknown> = {}) {
      const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
      const data = `${enc({ alg: "RS256", typ: "JWT", kid, ...header })}.${enc(claims)}`;
      const sig = createSign("RSA-SHA256").update(data).sign(privateKey).toString("base64url");
      return `${data}.${sig}`;
    },
  };
}
