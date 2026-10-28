import { describe, expect, it } from "vitest";
import { checkAiAccess } from "./index";

describe("ai access", () => {
  it("needs an enabled add-on with the ai permission", () => {
    expect(() => checkAiAccess(undefined, "x")).toThrow(/not found/);
    expect(() => checkAiAccess({ enabled: false, manifest: { permissions: ["ai"] } }, "x")).toThrow(/off/);
    expect(() => checkAiAccess({ enabled: true, manifest: { permissions: ["exec:git"] } }, "x")).toThrow(
      /"ai" permission/,
    );
    expect(() => checkAiAccess({ enabled: true, manifest: { permissions: ["ai"] } }, "x")).not.toThrow();
  });
});
