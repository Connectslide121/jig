import { describe, expect, it } from "vitest";
import {
  artifactFromTool,
  chatArtifacts,
  isArtifactUrl,
  parseArtifactList,
  readArtifactPage,
} from "./artifacts";
import type { ChatItem } from "./engine";

const tool = (input: Record<string, unknown>, output: string, at = "2026-10-28T10:00:00Z"): ChatItem => ({
  kind: "tool",
  id: `t-${at}`,
  name: "Artifact",
  input,
  output,
  status: "done",
  at,
});

describe("artifacts from chats", () => {
  it("finds published artifacts with their local page", () => {
    expect(
      artifactFromTool(
        tool({ file_path: "/tmp/x/release-notes.html" }, "Published at https://claude.ai/artifact/abc123 ok"),
      ),
    ).toEqual({
      url: "https://claude.ai/artifact/abc123",
      path: "/tmp/x/release-notes.html",
      title: "release-notes",
    });
    expect(artifactFromTool(tool({ action: "list" }, "https://claude.ai/artifact/abc"))).toBeUndefined();
    expect(artifactFromTool(tool({ file_path: "/a.html" }, "failed"))).toBeUndefined();
  });

  it("lists one per link, the newest first", () => {
    const list = chatArtifacts([
      {
        id: "s1",
        title: "Chat one",
        items: [
          tool({ file_path: "/a.html", title: "A" }, "https://claude.ai/artifact/a", "2026-10-28T09:00:00Z"),
          tool(
            { file_path: "/a.html", title: "A v2" },
            "https://claude.ai/artifact/a",
            "2026-10-28T11:00:00Z",
          ),
        ],
      },
      {
        id: "s2",
        title: "Chat two",
        items: [
          tool({ file_path: "/b.html" }, "https://claude.ai/code/artifact/b-2", "2026-10-28T10:00:00Z"),
        ],
      },
    ]);
    expect(list.map((a) => [a.title, a.chatTitle])).toEqual([
      ["A v2", "Chat one"],
      ["b", "Chat two"],
    ]);
  });
});

describe("claude.ai artifacts", () => {
  it("checks links and reads lists and pages", () => {
    expect(isArtifactUrl("https://claude.ai/artifact/MMdEDPyp")).toBe(true);
    expect(isArtifactUrl("https://claude.ai/artifact/x/../evil")).toBe(false);
    expect(isArtifactUrl("https://evil.example/artifact/x")).toBe(false);
    expect(
      parseArtifactList({ artifacts: [{ title: "T", url: "u", rel: "shared" }, { title: "no url" }] }),
    ).toEqual([{ url: "u", title: "T", updatedAt: undefined, shared: true }]);
    expect(readArtifactPage({ read: { result: "<h1>Hi</h1>", code: 200 } }, "")).toContain(
      "<body>\n<h1>Hi</h1>",
    );
    expect(readArtifactPage({ read: { result: "<html><body>x</body></html>" } }, "")).toBe(
      "<html><body>x</body></html>",
    );
    expect(() => readArtifactPage({ read: { result: "x", code: 404 } }, "")).toThrow("404");
  });
});
