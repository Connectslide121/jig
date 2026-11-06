import { describe, expect, it } from "vitest";
import { type AddonInfo, addonLoadFailures } from "./addons";

const addon = (over: Partial<AddonInfo>): AddonInfo => ({
  id: "shop",
  name: "Shop",
  description: "",
  version: "1.0.0",
  source: "builtin",
  dir: "/addons/shop",
  enabled: true,
  errors: [],
  hasHost: false,
  ...over,
});

describe("addonLoadFailures", () => {
  it("lists switched-on add-ons with host or load errors", () => {
    const failures = addonLoadFailures(
      [
        addon({ errors: ['ui: parts.tsx:13:57 Could not resolve "../x"'] }),
        addon({ id: "clock", name: "Clock" }),
        addon({ id: "notes", name: "Notes" }),
      ],
      { clock: 'ui.tsx has no export named "Late"' },
    );
    expect(failures).toEqual([
      {
        id: "shop",
        name: "Shop",
        error: 'ui: parts.tsx:13:57 Could not resolve "../x"',
        key: 'shop\nui: parts.tsx:13:57 Could not resolve "../x"',
      },
      {
        id: "clock",
        name: "Clock",
        error: 'ui.tsx has no export named "Late"',
        key: 'clock\nui.tsx has no export named "Late"',
      },
    ]);
  });

  it("joins an add-on's errors into one, so a new error is a new key", () => {
    const [failure] = addonLoadFailures([addon({ errors: ["ui: a", "host: b"] })], { shop: "c" });
    expect(failure?.error).toBe("ui: a\nhost: b\nc");
  });

  it("leaves out add-ons that are off or previewed by the builder", () => {
    const addons = [
      addon({ enabled: false, errors: ["ui: a"] }),
      addon({ id: "draft", preview: { buildId: "b1" }, errors: ["ui: b"] }),
    ];
    expect(addonLoadFailures(addons, { shop: "c" })).toEqual([]);
  });
});
