import { describe, expect, it } from "vitest";
import { hunkFor, parseTour, splitDiff } from "./tour";

const diff = `diff --git a/src/cart.ts b/src/cart.ts
index 1..2 100644
--- a/src/cart.ts
+++ b/src/cart.ts
@@ -1,3 +1,4 @@
 a
+b
@@ -20,2 +21,5 @@
 c
+d
diff --git a/README.md b/README.md
new file mode 100644
--- /dev/null
+++ b/README.md
@@ -0,0 +1 @@
+# Shop`;

describe("change tours", () => {
  it("splits a diff per file", () => {
    const files = splitDiff(diff);
    expect(Object.keys(files)).toEqual(["src/cart.ts", "README.md"]);
    expect(files["README.md"]).toContain("+# Shop");
  });

  it("finds the hunk of a line", () => {
    const cart = splitDiff(diff)["src/cart.ts"]!;
    expect(hunkFor(cart, 2)).toBe(0);
    expect(hunkFor(cart, 23)).toBe(1);
    expect(hunkFor(cart, 99)).toBeUndefined();
    expect(hunkFor(cart, undefined)).toBeUndefined();
  });

  it("keeps steps about changed files", () => {
    const tour = parseTour(
      'Sure: {"title": "Cart totals", "overview": "o", "steps": [{"title": "Totals", "file": "b/src/cart.ts", "line": 21, "explanation": "e"}, {"title": "x", "file": "nope.ts", "line": null, "explanation": "e"}]}',
      ["src/cart.ts", "README.md"],
    );
    expect(tour).toEqual({
      title: "Cart totals",
      overview: "o",
      steps: [{ title: "Totals", file: "src/cart.ts", line: 21, explanation: "e" }],
    });
    expect(() => parseTour('{"steps": []}', ["a"])).toThrow(/didn't refer/);
  });
});
