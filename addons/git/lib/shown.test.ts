import { describe, expect, it } from "vitest";
import { NO_SHOWN, showsAll, toggleExtra, visibleRepos } from "./shown";

const repos = ["/r/api", "/r/elearning", "/r/podium", "/r/web"];

describe("visibleRepos", () => {
  it("lists only the focus repository by default", () => {
    expect(visibleRepos(repos, "/r/podium", NO_SHOWN)).toEqual(["/r/podium"]);
  });
  it("adds the repositories chosen for this focus, focus first", () => {
    const shown = { extras: { "/r/podium": ["/r/web", "/r/elearning"], "/r/api": ["/r/web"] } };
    expect(visibleRepos(repos, "/r/podium", shown)).toEqual(["/r/podium", "/r/elearning", "/r/web"]);
    expect(visibleRepos(repos, "/r/api", shown)).toEqual(["/r/api", "/r/web"]);
  });
  it("lists every repository when asked, or without a known focus", () => {
    expect(visibleRepos(repos, "/r/podium", { all: true, extras: {} })).toEqual(repos);
    expect(visibleRepos(repos, undefined, NO_SHOWN)).toEqual(repos);
    expect(visibleRepos(repos, "/r/gone", NO_SHOWN)).toEqual(repos);
    expect(showsAll(NO_SHOWN, "/r/api", repos)).toBe(false);
  });
});

describe("toggleExtra", () => {
  it("shows and hides a repository next to a focus", () => {
    const one = toggleExtra(NO_SHOWN, "/r/podium", "/r/elearning");
    expect(one.extras).toEqual({ "/r/podium": ["/r/elearning"] });
    expect(toggleExtra(one, "/r/podium", "/r/elearning").extras).toEqual({});
  });
});
