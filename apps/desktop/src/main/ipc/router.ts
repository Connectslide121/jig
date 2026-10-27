import { BrowserWindow, ipcMain, type WebContents } from "electron";
import {
  type CallResponse,
  CHANNEL_CALL,
  CHANNEL_EVENT,
  type EventTopic,
  type HostEvents,
  JigError,
  type MethodArgs,
  type MethodName,
  type MethodResult,
} from "../../shared/ipc";
import { logger } from "../log";

const log = logger("ipc");

export interface CallContext {
  sender: WebContents;
}

type Handler<M extends MethodName> = (
  args: MethodArgs<M>,
  ctx: CallContext,
) => Promise<MethodResult<M>> | MethodResult<M>;

// biome-ignore lint/suspicious/noExplicitAny: handlers are stored type-erased and typed at registration.
const handlers = new Map<string, Handler<any>>();

/** Registers the handler for one host method. Each method has exactly one handler. */
export function handle<M extends MethodName>(method: M, handler: Handler<M>): void {
  if (handlers.has(method)) throw new Error(`Handler for ${method} registered twice`);
  handlers.set(method, handler);
}

/** Calls a handler from inside the host (used by tests and by host modules that reuse methods). */
export async function invokeLocal<M extends MethodName>(
  method: M,
  args: MethodArgs<M>,
  ctx: CallContext,
): Promise<MethodResult<M>> {
  const handler = handlers.get(method);
  if (!handler) throw new JigError("unknown_method", `Unknown method ${method}`);
  return handler(args, ctx);
}

export function installRouter(): void {
  ipcMain.handle(
    CHANNEL_CALL,
    async (event, method: unknown, args: unknown): Promise<CallResponse<unknown>> => {
      if (typeof method !== "string" || !handlers.has(method)) {
        return { ok: false, error: { code: "unknown_method", message: `Unknown method ${String(method)}` } };
      }
      try {
        const value = await handlers.get(method)!(args, { sender: event.sender });
        return { ok: true, value };
      } catch (error) {
        if (error instanceof JigError)
          return { ok: false, error: { code: error.code, message: error.message } };
        log.error(`${method} failed`, error);
        return {
          ok: false,
          error: { code: "internal", message: error instanceof Error ? error.message : String(error) },
        };
      }
    },
  );
}

type Listener = (topic: EventTopic, payload: unknown) => void;
const localListeners = new Set<Listener>();

/** Sends an event to every window (and to in-host listeners). */
export function emit<T extends EventTopic>(topic: T, payload: HostEvents[T]): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(CHANNEL_EVENT, topic, payload);
  }
  for (const listener of localListeners) listener(topic, payload);
}

/** Subscribes host modules to events emitted inside the host. */
export function onLocal(listener: Listener): () => void {
  localListeners.add(listener);
  return () => localListeners.delete(listener);
}
