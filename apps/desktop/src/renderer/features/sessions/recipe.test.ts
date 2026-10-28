import { describe, expect, it } from "vitest";
import type { ChatItem } from "../../../shared/engine";
import { chatRecipe } from "./recipe";

describe("chat to tool", () => {
  it("lists the requests, commands and changed files in order", () => {
    const items = [
      { kind: "user", id: "1", text: "Bump the version and   tag it", at: "" },
      {
        kind: "tool",
        id: "2",
        name: "Bash",
        input: { command: "npm version patch" },
        status: "done",
        at: "",
      },
      {
        kind: "tool",
        id: "3",
        name: "Edit",
        input: { file_path: "/repo/CHANGELOG.md" },
        status: "done",
        at: "",
      },
      { kind: "tool", id: "4", name: "Read", input: { file_path: "/repo/x.ts" }, status: "done", at: "" },
      { kind: "assistant", id: "5", text: "Done", at: "" },
    ] as ChatItem[];
    const goal = chatRecipe("Release", items);
    expect(goal).toContain('in the chat "Release"');
    expect(goal).toContain(
      "- I asked: Bump the version and tag it\n- Claude ran: npm version patch\n- Claude changed /repo/CHANGELOG.md",
    );
    expect(goal).not.toContain("x.ts");
  });
});
