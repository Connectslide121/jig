import { describe, expect, it } from "vitest";
import { addonImportViolations } from "./addon-imports-lib";

const file = "addons/shop/ui.tsx";

describe("addonImportViolations", () => {
  it("allows imports inside addons/ and packages by name", () => {
    const source = [
      'import { Button } from "@jig/sdk/ui";',
      'import { useState } from "react";',
      'import { a } from "./lib/a";',
      'import { b } from "../shared/b";',
      'export * from "./lib/c";',
    ].join("\n");
    expect(addonImportViolations(file, source)).toEqual([]);
  });

  it("flags value imports that leave addons/", () => {
    const source = [
      'import { NOTE } from "../../apps/desktop/src/shared/prices";',
      "import {",
      "  one,",
      "  type Two,",
      '} from "../../packages/x";',
      'import "../../apps/side-effect";',
      'export { three } from "../../apps/three";',
      'const lazy = import("../../apps/lazy");',
    ].join("\n");
    expect(addonImportViolations(file, source)).toEqual([
      { line: 1, specifier: "../../apps/desktop/src/shared/prices" },
      { line: 2, specifier: "../../packages/x" },
      { line: 6, specifier: "../../apps/side-effect" },
      { line: 7, specifier: "../../apps/three" },
      { line: 8, specifier: "../../apps/lazy" },
    ]);
  });

  it("allows type-only imports, which are erased before bundling", () => {
    const source = [
      'import type { Meeting } from "../../../apps/desktop/src/shared/meetings";',
      'export type { Price } from "../../apps/prices";',
    ].join("\n");
    expect(addonImportViolations("addons/shop/lib/meeting.ts", source)).toEqual([]);
  });

  it("isn't fooled by a path that climbs out and back in", () => {
    expect(addonImportViolations(file, 'import { a } from "../../addons/other/a";')).toEqual([]);
    expect(addonImportViolations(file, 'import { a } from "../../../addons/a";')).toHaveLength(1);
  });

  it("ignores code that isn't an import", () => {
    const source = ['export const label = "from ../../apps";', "export function f() {}"].join("\n");
    expect(addonImportViolations(file, source)).toEqual([]);
  });
});
