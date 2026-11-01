import { expect, it } from "vitest";
import { ownMediaUrl } from "./permissions";

it("only permits first-party media origins, including the exact development origin", () => {
  expect(ownMediaUrl("jig-app://app/index.html?meetingRoom=1", undefined)).toBe(true);
  expect(ownMediaUrl("http://localhost:5173/index.html", "http://localhost:5173/")).toBe(true);
  for (const url of [
    undefined,
    "broken",
    "jig-file://app/preview.html",
    "https://example.com",
    "jig-app://other/index.html",
    "http://localhost:51730/",
  ])
    expect(ownMediaUrl(url, "http://localhost:5173")).toBe(false);
});
