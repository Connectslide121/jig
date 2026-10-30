import { describe, expect, it } from "vitest";
import { isHtmlPage } from "./preview";

describe("isHtmlPage", () => {
  it("previews pages, and opens templates and fragments as source", () => {
    const page = "<!doctype html><html><head><title>Shop</title></head><body><h1>Shop</h1></body></html>";
    expect(isHtmlPage("site/index.html", page)).toBe(true);
    // Angular: a component template, its control flow, bindings and interpolation.
    expect(isHtmlPage("app/sidebar.component.html", page)).toBe(false);
    expect(isHtmlPage("app/sidebar.html", "@if (open()) {\n<nav></nav>\n}")).toBe(false);
    expect(
      isHtmlPage("app/x.html", '<html><body><div *ngIf="open">{{ "title" | translate }}</div></body></html>'),
    ).toBe(false);
    expect(isHtmlPage("app/x.html", '<html><body><button (click)="save()">Save</button></body></html>')).toBe(
      false,
    );
    // Vue and Jinja.
    expect(isHtmlPage("x.html", '<html><body><p v-if="ok">Hi</p></body></html>')).toBe(false);
    expect(isHtmlPage("x.html", "<html><body>{% block content %}{% endblock %}</body></html>")).toBe(false);
    // A fragment without <html>/<body>.
    expect(isHtmlPage("partial.html", "<div class='card'>Hello</div>")).toBe(false);
    expect(isHtmlPage("empty.html", undefined)).toBe(false);
  });
});
