import { describe, expect, it } from "vitest";
import { tourFolder } from "./tour";

describe("tourFolder", () => {
  it("uses the folder of the first changed file, else the chat's", () => {
    expect(tourFolder("E:\\repos", ["E:\\repos\\Shop\\src\\cart.ts", "E:\\repos\\Shop\\x.ts"])).toBe(
      "E:\\repos\\Shop\\src",
    );
    expect(tourFolder("/work", ["/work/shop/cart.ts"])).toBe("/work/shop");
    expect(tourFolder("/work/shop", ["src/cart.ts"])).toBe("/work/shop/src");
    expect(tourFolder("/work/shop", [])).toBe("/work/shop");
  });
});
