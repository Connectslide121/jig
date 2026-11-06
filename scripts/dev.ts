// npm run dev -- <demo folder> [--port 5180]: the demo with hot reload.
import { createServer } from "vite";
import { demoFolder, parseArgs } from "./lib/args.ts";
import { KIT_ROOT } from "./lib/generate.ts";

const { target, options } = parseArgs(process.argv.slice(2));
process.env.KIT_DEMO = demoFolder(target);
const server = await createServer({
  configFile: `${KIT_ROOT}/vite.config.ts`,
  server: { port: typeof options.port === "string" ? Number(options.port) : 5180, host: options.host === true ? true : undefined },
});
await server.listen();
server.printUrls();
