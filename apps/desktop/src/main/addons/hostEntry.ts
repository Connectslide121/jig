// Entry of the add-on host process (bundled to dist/main/addon-host.mjs, started with utilityProcess).
import { createHostRuntime, type FromHost, type ToHost } from "./hostRuntime";

const port = (
  process as unknown as {
    parentPort: { postMessage(m: unknown): void; on(e: "message", f: (e: { data: ToHost }) => void): void };
  }
).parentPort;
const runtime = createHostRuntime((message: FromHost) => port.postMessage(message));
port.on("message", (event) => void runtime.handle(event.data));
process.on("uncaughtException", (error) => {
  port.postMessage({ t: "rpc", id: 0, op: "log", args: { message: `Uncaught: ${error.stack ?? error}` } });
});
