import { describe, expect, it } from "vitest";
import { artifactFromTool } from "./artifacts";
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

describe("artifacts in old chats", () => {
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
});
