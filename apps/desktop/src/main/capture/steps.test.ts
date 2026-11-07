import { describe, expect, it } from "vitest";
import { describeStep, findScript, framesDue, isCaptureUrl, stepPause, typeCharScript } from "./steps";

describe("capture steps", () => {
  it("allows only web and file addresses", () => {
    expect(isCaptureUrl("https://example.com/demo")).toBe(true);
    expect(isCaptureUrl("http://localhost:5173")).toBe(true);
    expect(isCaptureUrl("file:///C:/demo/index.html")).toBe(true);
    expect(isCaptureUrl("javascript:alert(1)")).toBe(false);
    expect(isCaptureUrl("jig-app://index.html")).toBe(false);
    expect(isCaptureUrl("not a url")).toBe(false);
  });

  it("names a failing step by its name, else by what it does", () => {
    expect(describeStep({ do: "click", selector: "#buy", name: "Buy" }, 2)).toBe("Step 3 (Buy)");
    expect(describeStep({ do: "click", selector: "#buy" }, 0)).toBe("Step 1 (click #buy)");
    expect(describeStep({ do: "type", selector: "input", text: "x" }, 1)).toBe("Step 2 (type into input)");
    expect(describeStep({ do: "scroll", y: 400 }, 0)).toBe("Step 1 (scroll to 400)");
    expect(describeStep({ do: "wait", ms: 500 }, 0)).toBe("Step 1 (wait 500 ms)");
    expect(describeStep({ do: "go", url: "https://example.com" }, 0)).toBe(
      "Step 1 (go to https://example.com)",
    );
  });

  it("gives steps time on screen, capped", () => {
    expect(stepPause({ do: "wait", ms: 60_000 })).toBe(10_000);
    expect(stepPause({ do: "highlight", selector: "h1" })).toBe(1200);
    expect(stepPause({ do: "click", selector: "a" })).toBeGreaterThan(0);
  });

  it("puts selectors and text into scripts as JSON strings", () => {
    const evil = `"});alert(1);//`;
    expect(findScript(evil)).toContain(JSON.stringify(evil));
    expect(typeCharScript("#q", evil)).toContain(JSON.stringify(evil));
  });

  it("counts the frames due at a steady rate", () => {
    expect(framesDue(0, 30)).toBe(1);
    expect(framesDue(1000, 30)).toBe(31);
    expect(framesDue(500, 60)).toBe(31);
  });
});
