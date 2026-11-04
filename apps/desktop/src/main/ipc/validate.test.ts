import { describe, expect, it } from "vitest";
import { EXECUTABLE, invalidArgs, isAllowedOrigin } from "./validate";

describe("IPC checks", () => {
  it("accepts calls from Jig's own page only", () => {
    expect(isAllowedOrigin("jig-app://app/index.html", undefined)).toBe(true);
    expect(isAllowedOrigin("http://localhost:5173/", "http://localhost:5173")).toBe(true);
    expect(isAllowedOrigin("http://localhost:5173/", undefined)).toBe(false);
    expect(isAllowedOrigin("jig-file://abc/page.html", undefined)).toBe(false);
    expect(isAllowedOrigin("https://example.com", "http://localhost:5173")).toBe(false);
    expect(isAllowedOrigin(undefined, undefined)).toBe(false);
  });

  it("checks argument shapes", () => {
    expect(invalidArgs("files.preview", { path: "/repo/README.md" })).toBeUndefined();
    expect(invalidArgs("files.preview", { path: 42 })).toMatch(/^path:/);
    expect(invalidArgs("files.preview", ["a"])).toBe("arguments must be an object");
    expect(invalidArgs("addons.storageSet", { id: "../config", key: "k", value: 1 })).toMatch(/^id:/);
    expect(invalidArgs("attempts.start", { projectId: "p", repo: "/r", task: "t", hints: ["a"] })).toMatch(
      /^hints:/,
    );
    expect(invalidArgs("terminals.resize", { id: "t", cols: 80.5, rows: 24 })).toMatch(/^cols:/);
    // A queued message may lose its text when it keeps a file, not both.
    const shot = { path: "/home/.jig/attachments/s/a.png", mime: "image/png" };
    expect(
      invalidArgs("sessions.editQueued", { id: "s", queuedId: "q", text: "", attachments: [shot] }),
    ).toBe(undefined);
    expect(invalidArgs("sessions.editQueued", { id: "s", queuedId: "q", text: " " })).toMatch(/empty/);
    expect(
      invalidArgs("sessions.editQueued", { id: "s", queuedId: "q", text: "x", attachments: [{ path: 1 }] }),
    ).toMatch(/^attachments/);
    // Methods without a schema only need plain data.
    expect(invalidArgs("config.get", undefined)).toBeUndefined();
    expect(invalidArgs("layout.set", { main: {} } as never)).toBeUndefined();
  });

  it("validates native browser URLs, commands and surface bounds", () => {
    expect(invalidArgs("userBrowser.navigate", { url: "http://localhost:5173" })).toBeUndefined();
    expect(invalidArgs("userBrowser.navigate", { action: "stop" })).toBeUndefined();
    expect(invalidArgs("userBrowser.navigate", { action: "execute" })).toMatch(/^action:/);
    expect(invalidArgs("userBrowser.navigate", { url: 4 })).toMatch(/^url:/);
    expect(
      invalidArgs("userBrowser.present", { bounds: { x: -1, y: 0, width: 800, height: 600 }, visible: true }),
    ).toMatch(/^bounds.x:/);
    expect(
      invalidArgs("userBrowser.present", { bounds: { x: 0, y: 0, width: 800, height: 600 }, visible: true }),
    ).toBeUndefined();
  });

  it("lets only tenant ids and domains reach az login", () => {
    expect(invalidArgs("azure.addTenant", { tenant: "contoso.onmicrosoft.com" })).toBeUndefined();
    expect(invalidArgs("azure.addTenant", { tenant: "" })).toBeUndefined();
    expect(invalidArgs("azure.addTenant", { tenant: "--use-device-code" })).toMatch(/^tenant:/);
    expect(invalidArgs("azure.signInAgain", { key: "../x" })).toMatch(/^key:/);
    expect(invalidArgs("azure.renameTenant", { key: "contoso", label: " " })).toMatch(/^label:/);
    expect(invalidArgs("azure.renameTenant", { key: "default", label: "Work" })).toBeUndefined();
    expect(invalidArgs("azure.renameTenant", { key: "default" })).toBeUndefined();
  });

  it("knows which files would run when opened", () => {
    expect(EXECUTABLE.test("C:\\\\tools\\\\setup.EXE")).toBe(true);
    expect(EXECUTABLE.test("deploy.ps1")).toBe(true);
    expect(EXECUTABLE.test("report.pdf")).toBe(false);
  });
});
