import { create } from "zustand";

/**
 * A chat to start talking with (D-278): "Hey Jig, new chat" opens the chat and asks its message box
 * to start Talk mode (only the message box has what talking needs). `send` is said to Claude first.
 */
export const useTalkRequest = create<{ target?: string; send?: string }>(() => ({}));

export function requestTalk(target: string, send?: string): void {
  useTalkRequest.setState({ target, send });
}

/** The message box of `target` takes the request (once). */
export function takeTalkRequest(target: string): { send?: string } | undefined {
  const { target: wanted, send } = useTalkRequest.getState();
  if (wanted !== target) return undefined;
  useTalkRequest.setState({ target: undefined, send: undefined });
  return { send };
}
