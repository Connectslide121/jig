import { describe, expect, it } from "vitest";
import { FakeMcpClient } from "./fakeMcp";

describe("the fake engine's MCP client", () => {
  it("calls a chat's tool over its local MCP server, images included", async () => {
    const client = new FakeMcpClient({
      jig: {
        tools: [
          {
            name: "jig_browser_screenshot",
            description: "A screenshot",
            shape: {},
            readOnly: true,
            handler: async () => ({ text: "shot", images: [{ mime: "image/png", data: "iVBORw0KGgo=" }] }),
          },
        ],
      },
    });
    expect(client.serverOf("jig_browser_screenshot")).toBe("jig");
    expect(await client.call("jig", "jig_browser_screenshot", {})).toEqual({
      text: "shot",
      images: [{ mime: "image/png", data: "iVBORw0KGgo=" }],
      isError: false,
    });
    client.close();
  });
});
