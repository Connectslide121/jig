import { describe, expect, it } from "vitest";
import { NO_SHOWN, showsAll, toggleExtra, visibleRepos } from "./shown";

const repos = ["/r/api", "/r/elearning", "/r/shop", "/r/web"];

describe("visibleRepos", () => {
  it("lists only the focus repository by default", () => {
    expect(visibleRepos(repos, "/r/shop", NO_SHOWN)).toEqual(["/r/shop"]);
  });
  it("adds the repositories chosen for this focus, focus first", () => {
    const shown = { extras: { "/r/shop": ["/r/web", "/r/elearning"], "/r/api": ["/r/web"] } };
    expect(visibleRepos(repos, "/r/shop", shown)).toEqual(["/r/shop", "/r/elearning", "/r/web"]);
    expect(visibleRepos(repos, "/r/api", shown)).toEqual(["/r/api", "/r/web"]);
  });
  it("lists every repository when asked, or without a known focus", () => {
    expect(visibleRepos(repos, "/r/shop", { all: true, extras: {} })).toEqual(repos);
    expect(visibleRepos(repos, undefined, NO_SHOWN)).toEqual(repos);
    expect(visibleRepos(repos, "/r/gone", NO_SHOWN)).toEqual(repos);
    expect(showsAll(NO_SHOWN, "/r/api", repos)).toBe(false);
  });
});

describe("toggleExtra", () => {
  it("shows and hides a repository next to a focus", () => {
    const one = toggleExtra(NO_SHOWN, "/r/shop", "/r/elearning");
    expect(one.extras).toEqual({ "/r/shop": ["/r/elearning"] });
    expect(toggleExtra(one, "/r/shop", "/r/elearning").extras).toEqual({});
  });
});
