import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ BrowserWindow: class {}, screen: {} }));

import { trackerLine, trackerScript, windowHandle } from "./shareFrame";

describe("share frame", () => {
  it("finds the window handle in a window source on Windows only", () => {
    expect(windowHandle("window:132456:0", "win32")).toBe("132456");
    expect(windowHandle("screen:0:0", "win32")).toBeUndefined();
    expect(windowHandle("window:132456:0", "darwin")).toBeUndefined();
  });

  it("reads the tracker's lines", () => {
    expect(trackerLine("10 -8 1280 720\r")).toEqual({ x: 10, y: -8, width: 1280, height: 720 });
    expect(trackerLine("hidden")).toBe("hidden");
    expect(trackerLine("gone")).toBe("gone");
    expect(trackerLine("0 0 0 0")).toBe("hidden");
    expect(trackerLine("Add-Type failed")).toBeUndefined();
  });

  it("follows only the numeric handle and Jig's process", () => {
    const script = trackerScript("132456", 4242);
    expect(script).toContain("[Int64]132456");
    expect(script).toContain("Get-Process -Id 4242");
  });
});
