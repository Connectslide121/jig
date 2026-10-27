// Writes addon.schema.json (JSON Schema for addon.json) from the zod manifest schema.
import { writeFileSync } from "node:fs";
import { z } from "zod";
import { ManifestSchema } from "../src/manifest";

const schema = z.toJSONSchema(ManifestSchema, { io: "input" });
// Run from packages/sdk (npm run schema -w @jig/sdk).
writeFileSync("addon.schema.json", `${JSON.stringify(schema, null, 2)}\n`);
console.log("Wrote packages/sdk/addon.schema.json");
