import { describe, expect, it } from "vitest";
import { isAngularTemplate } from "./preview";

describe("isAngularTemplate", () => {
  it("knows Angular templates by name or by their syntax", () => {
    expect(isAngularTemplate("app/sidebar.component.html", "<nav></nav>")).toBe(true);
    expect(isAngularTemplate("app/menu.html", "@if (open()) {\n<nav></nav>\n}")).toBe(true);
    expect(isAngularTemplate("app/menu.html", '<div *ngIf="open"></div>')).toBe(true);
    expect(isAngularTemplate("app/menu.html", '<button (click)="save()">Save</button>')).toBe(true);
    expect(isAngularTemplate("app/menu.html", '<div [class.open]="open"></div>')).toBe(true);
    // Plain HTML, or {{ }} alone (Vue, Jinja), isn't; nor is another kind of file.
    expect(isAngularTemplate("site/index.html", "<!doctype html><h1>Shop</h1>")).toBe(false);
    expect(isAngularTemplate("site/index.html", "<p>{{ title }}</p>")).toBe(false);
    expect(isAngularTemplate("src/cart.ts", "@if (x) {}")).toBe(false);
  });
});
