import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  safeStorage: { isEncryptionAvailable: () => false },
  shell: {},
}));

import { MeetingAuth } from "./auth";

type Plugin = {
  beforeCacheAccess: (context: unknown) => Promise<void>;
  afterCacheAccess: (context: unknown) => Promise<void>;
};

describe("Microsoft token cache", () => {
  it("hands MSAL the latest tokens on every access, not only the first load", async () => {
    const auth = new MeetingAuth(() => ({ tenantId: "tenant", clientId: "client" }) as never);
    const client = (auth as unknown as { app(): { config: { cache: { cachePlugin: Plugin } } } }).app();
    const plugin = client.config.cache.cachePlugin;
    const deserialize = vi.fn();
    await plugin.beforeCacheAccess({ tokenCache: { deserialize } });
    expect(deserialize).not.toHaveBeenCalled();

    // A sign-in changes the cache; MSAL then clears memory before the next silent request.
    await plugin.afterCacheAccess({ cacheHasChanged: true, tokenCache: { serialize: () => "signed-in" } });
    await plugin.beforeCacheAccess({ tokenCache: { deserialize } });
    await plugin.beforeCacheAccess({ tokenCache: { deserialize } });
    expect(deserialize).toHaveBeenCalledTimes(2);
    expect(deserialize).toHaveBeenLastCalledWith("signed-in");
  });
});
