import { useEffect, useRef } from "react";
import type { CallArgs, EventTopic, HostEvents, JigBridge, MethodName, MethodResult } from "../../shared/ipc";

declare global {
  interface Window {
    jig: JigBridge;
  }
}

/** An error returned by the host. `code` is stable (e.g. `unknown_method`, `not_found`). */
export class HostError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HostError";
  }
}

/** Calls a host method (see shared/ipc.ts). Rejects with a `HostError`. */
export async function call<M extends MethodName>(method: M, ...args: CallArgs<M>): Promise<MethodResult<M>> {
  const response = await window.jig.invoke(method, args[0]);
  if (response.ok) return response.value as MethodResult<M>;
  throw new HostError(response.error.code, response.error.message);
}

/** Subscribes to a host event for the lifetime of the component. */
export function useHostEvent<T extends EventTopic>(
  topic: T,
  listener: (payload: HostEvents[T]) => void,
): void {
  const ref = useRef(listener);
  ref.current = listener;
  useEffect(() => window.jig.on(topic, (payload) => ref.current(payload)), [topic]);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
